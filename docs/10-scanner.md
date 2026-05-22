# Scanner / Paperless Ingestion

The Fujitsu USB-Scanner sits directly on the home-server. `scanbd` listens
on the hardware scan button, the role's shell scripts call `scanimage` and
`convert`, the resulting PDF lands on a CIFS mount of the UGREEN NAS where
the existing Paperless-NGX stack reads it out of
`personal_folder/paperless/consume`.

```
[Fujitsu USB] --(button)--> scanbd --> scan_button.sh
                                       └── scan_to_pdf.sh --> /mnt/paperless-consume
                                                                   │ (CIFS to NAS)
                                                                   └── Paperless-NGX (NAS)
                                                       └── curl → Gotify (k3s) → push
```

Push-Notifications für jeden Scan (Erfolg/Fehler) sind eine optionale
Erweiterung — Setup in [`docs/11-gotify.md`](11-gotify.md).

Paperless-NGX, its Postgres and Redis run on the UGREEN NAS and are not
managed by this playbook — the scanner role only owns the bare-metal
scanning daemon and the SMB mount that delivers PDFs into the NAS consume
directory.

> The shell snippets below use a `SRV` shorthand for the SSH command into
> the home-server. Replace `homeserver` with the inventory host or
> Tailscale IP if your setup differs:
>
> ```bash
> SRV='ssh -i ~/.ssh/id_ed25519 jaydee@homeserver'
> ```

## 1. Hardware prerequisites

- Fujitsu scanner (ADF capable) connected via USB to the home-server.
- The NAS SMB share `//jays-ugreen/personal_folder/paperless/consume`
  is reachable from the home-server's LAN.

## 2. Determine the USB IDs

```bash
$SRV 'lsusb | grep -i fujitsu'
# Bus 002 Device 005: ID 04c5:11a2 Fujitsu, Ltd ScanSnap iX...
```

Set both IDs in `ansible/group_vars/all.yml`:

```yaml
scanner_usb_vendor_id: "04c5"
scanner_usb_product_id: "11a2"
```

If the product ID is left empty the role aborts pre-flight rather than
roll out a wildcard udev rule.

## 3. Vault-encrypt the SMB password

```bash
ansible-vault encrypt_string 'YOUR_SMB_PASSWORD' --name 'scanner_smb_password'
```

Paste the resulting `!vault |` block into `ansible/group_vars/all.yml`.
The variable is never given a plaintext default in `defaults/main.yml`;
the role fails pre-flight if it is undefined.

## 4. Apply the role

```bash
make scanner
```

The role runs in this order:

1. Install `sane`, `sane-utils`, `scanbd`, `imagemagick`, `cifs-utils`, `bc`, `util-linux`.
2. Create the `scanner` group, ensure `saned` is a member.
3. Create the credentials directory (`0700 root:root`), scripts directory,
   tmp + log directories and the consume mountpoint.
4. Render `/etc/cifs-credentials/paperless` (`0600`, `no_log`).
5. Mount the SMB share at `/mnt/paperless-consume` with `_netdev,nofail,x-systemd.automount`.
6. Deploy SANE + scanbd configuration and reload the daemon.
7. Deploy `scan_button.sh` and `scan_to_pdf.sh` with `set -euo pipefail`
   and an `ERR` trap that writes `scan-FAILED-<ts>.failed` markers.
8. Patch `/etc/ImageMagick-6/policy.xml` (idempotent `blockinfile`) to
   re-enable PDF/TIFF writes.
9. Deploy the scanbd systemd drop-in (`User=saned`, hardening flags).
10. Deploy the Fujitsu udev rule (`GROUP=scanner, MODE=0660, TAG+=uaccess`).
11. Deploy and enable the `scanner-healthcheck.timer` (default: hourly).

## 5. Verification

```bash
# NAS mount
$SRV 'df -h /mnt/paperless-consume'

# Scanner visible to SANE (as saned)
$SRV 'sudo -u saned scanimage -L'

# scanbd up
$SRV 'systemctl status scanbd --no-pager'

# scanbd really runs as saned/scanner
$SRV 'systemctl show scanbd -p User,Group'

# udev rule resolved
$SRV 'udevadm test "$(udevadm info -q path -n /dev/bus/usb/002/005)" 2>&1 | tail'

# healthcheck timer scheduled
$SRV 'systemctl list-timers scanner-healthcheck.timer'

# permissions on credentials
$SRV 'ls -ld /etc/cifs-credentials /etc/cifs-credentials/paperless'
```

## 6. Live test

Press the hardware button on the scanner. On the host:

```bash
$SRV 'journalctl -t scanbd-scan -f'
```

A new `scan-<ts>.pdf` must appear in `/mnt/paperless-consume/` within a
few seconds; Paperless-NGX on the NAS picks it up shortly after.

## 7. Troubleshooting

| Symptom | Hint |
|---|---|
| Scanner not found | `sudo SANE_DEBUG_FUJITSU=255 scanimage -L` |
| scanbd silent | `sudo systemctl stop scanbd && sudo -u saned scanbd -d -f` |
| Mount disappeared | `sudo systemctl start scanner-healthcheck.service` (don't wait for the timer) |
| Wrong USB perms | `sudo udevadm test $(udevadm info -q path -n /dev/bus/usb/<bus>/<dev>)` |
| `scan-FAILED-*.failed` in consume | `journalctl -t scanbd-scan --since '1 hour ago'` |
| ImageMagick PDF refused | check `/etc/ImageMagick-6/policy.xml` for the `ANSIBLE MANAGED — scanner role` block |
| `scanimage` works as root but not `saned` | `usermod -aG scanner saned` was skipped — re-run `make scanner` |

## 8. Design notes

The role is built around a few opinionated defaults that make the daemon
safe to run on a bare-metal host:

- **Fail-fast pre-flight.** Missing `scanner_usb_product_id` or
  `scanner_smb_password` aborts the role rather than rolling out a
  wildcard udev rule or a broken mount.
- **Least-privilege daemon.** `scanbd` runs as `saned`/`scanner`, not
  `root`, with a full hardening drop-in (`ProtectSystem=strict`,
  `CapabilityBoundingSet=`, `MemoryDenyWriteExecute=true`, …).
- **Robust shell scripts.** `set -euo pipefail` + `ERR` trap +
  `flock` (no double-runs from rapid button presses) + journald-tagged
  logging (`logger -t scanbd-scan`).
- **Non-root USB access.** udev rule grants the device to
  `GROUP=scanner` and adds `TAG+=uaccess` instead of relying on root.
- **Resilient NAS mount.** `_netdev,nofail,x-systemd.automount` lets the
  server boot when the NAS is offline; the mount comes back automatically
  when the NAS does.
- **Self-healing.** An hourly `scanner-healthcheck.timer` re-mounts the
  share if it disappears and logs scanner reachability to the journal.
- **Idempotent ImageMagick patch.** `blockinfile` re-enables PDF/TIFF
  writes — re-running the role is a no-op instead of an in-place `sed`.
- **Optional Gotify push.** App token lives in a `0640 root:scanner`
  env-file, never in the rendered shell script. Setup:
  [`docs/11-gotify.md`](11-gotify.md).
