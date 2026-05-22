# Gotify push notifications

[Gotify](https://gotify.net) runs as an ArgoCD-managed app in the k3s
cluster (`argocd/apps/gotify/`) and receives push notifications from the
scanner pipeline on the home-server. The Android/iOS Gotify client (or
any of the desktop/CLI clients) subscribes to the server and surfaces a
push for every scan event.

```
[scan button] → scanbd → scan_button.sh
                          └── scan_to_pdf.sh ─curl──> Gotify (k3s) ─push──> Phone
```

The scan scripts source `/etc/scanner/gotify.env` (mode `0640 root:scanner`)
at runtime — the app token never appears in the script body, the systemd
journal, or git.

## 1. Initial deploy of the Gotify server

### 1.1 Vault-encrypt the admin password

```bash
ansible-vault encrypt_string 'YOUR_STRONG_ADMIN_PW' \
  --name 'gotify_admin_password'
```

Paste the resulting `!vault |` block into `ansible/group_vars/all.yml`
(see the commented stub at the bottom of that file). This value is **not**
read by Ansible directly — it is only kept under vault so the plaintext
isn't lost when rotating.

### 1.2 Generate the SealedSecret cipher text

The cluster controller (already deployed via `argocd/apps/sealed-secrets/`)
will only accept ciphers produced with its public key. Easiest path is the
web UI at <http://kubeseal-webgui.homeserver>:

1. Open it, fill in:
   - **Namespace**: `gotify`
   - **Secret name**: `gotify-admin`
   - **Key**: `password`
   - **Value**: the plaintext admin password from 1.1
2. Click **Encrypt**, copy the long base64 string.

Or via CLI (run from a workstation that has `kubeseal` installed and the
cluster's public cert in `~/.kube/sealed-secrets.pem`):

```bash
echo -n 'YOUR_STRONG_ADMIN_PW' \
  | kubeseal --raw \
      --namespace gotify \
      --name gotify-admin \
      --from-file=/dev/stdin
```

### 1.3 Paste the cipher into `values.yaml`

Open `argocd/apps/gotify/values.yaml` and replace the placeholder:

```yaml
adminSecret:
  enabled: true
  username: admin
  secretName: gotify-admin
  encryptedPassword: "AgB...long-base64..."     # ← from 1.2
```

Commit + push:

```bash
git add argocd/apps/gotify/values.yaml
git commit -m "feat(gotify): set sealed admin password"
git push
```

ArgoCD picks the change up within ~3 minutes (or click **Refresh** in the
ArgoCD UI on the `gotify` app to apply immediately).

### 1.4 Verify

> The shell snippets below use a `SRV` shorthand for the SSH command into
> the home-server. Replace `homeserver` with the inventory host or
> Tailscale IP if your setup differs:
>
> ```bash
> SRV='ssh -i ~/.ssh/id_ed25519 jaydee@homeserver'
> ```

```bash
$SRV 'sudo kubectl -n gotify get pods,svc,ingress,pvc,sealedsecret,secret'
curl -sS http://gotify.homeserver/health
```

Expected:
- Pod `Running`, PVC `Bound`, the `gotify-admin` Secret is present
  (decrypted by the controller from the SealedSecret).
- `/health` returns `{"health":"green",...}`.

Log into `http://gotify.homeserver` with `admin` + the password from 1.1.

## 2. Create an application token for the scanner

1. In the Gotify Web UI: **Apps → CREATE APPLICATION**
   - Name: `Scanner`
   - Description: `Fujitsu scanner pipeline`
2. Copy the generated token (long opaque string).

## 3. Wire the scanner scripts to Gotify

### 3.1 Vault-encrypt the token

```bash
ansible-vault encrypt_string 'YOUR_GOTIFY_APP_TOKEN' \
  --name 'scanner_gotify_token'
```

### 3.2 Enable the integration in `group_vars/all.yml`

```yaml
scanner_gotify_enabled: true
scanner_gotify_url: "http://gotify.homeserver"
scanner_gotify_token: !vault |
          $ANSIBLE_VAULT;1.1;AES256
          ... pasted block from 3.1 ...
```

### 3.3 Roll out

```bash
make scanner
```

The role:
- adds `curl` to the package set,
- creates `/etc/scanner` (`0750 root:scanner`),
- renders `/etc/scanner/gotify.env` (`0640 root:scanner`, `no_log`),
- redeploys `scan_button.sh` and `scan_to_pdf.sh` with the
  `gotify_notify` helper baked in.

### 3.4 End-to-end test

```bash
# Confirm saned can read the env-file
$SRV 'sudo -u saned bash -lc ". /etc/scanner/gotify.env && echo $GOTIFY_ENABLED $GOTIFY_URL"'
# expected: 1 http://gotify.homeserver

# Manual push from the host (sanity check the token):
$SRV 'curl -fsS -X POST "http://gotify.homeserver/message" \
        -H "X-Gotify-Key: $(grep ^GOTIFY_TOKEN= /etc/scanner/gotify.env | cut -d= -f2-)" \
        -F "title=test" -F "message=hello" -F "priority=5"'

# Press the hardware button on the scanner — watch:
$SRV 'journalctl -t scanbd-scan -f'
```

Expected pushes:
- **Erfolg**: `✅ Scan erfolgreich` + `📄 scan-<ts>.pdf (<n> Seiten) → Paperless`
- **Kein Papier im ADF**: `❌ Scan fehlgeschlagen` + `Keine Seiten gescannt — ADF leer oder Scanner blockiert?`
- **scan_button-Trap außerhalb der Pipeline**: `❌ Scan abgebrochen` + `scan_button trap rc=<rc>`

## 4. Rotate the admin password / app token

- **Admin password**: regenerate via `kubeseal` from a new plaintext,
  replace `adminSecret.encryptedPassword` in `values.yaml`, commit +
  push. Delete the old `gotify-admin` secret in-cluster if ArgoCD doesn't
  prune it automatically, then restart the gotify pod.
- **App token**: revoke the old one in the Gotify Web UI, create a new
  one, repeat steps 3.1–3.3. The env-file (`0640`) is rewritten by
  Ansible — never edit it by hand.

## 5. Troubleshooting

| Symptom | Hint |
|---|---|
| Pod CrashLoopBackOff after first deploy | `encryptedPassword` is still `REPLACE_ME_WITH_KUBESEAL_OUTPUT` — finish step 1.3 |
| `gotify-admin` secret missing | `kubectl -n gotify describe sealedsecret gotify-admin` — controller logs explain decryption errors; cipher must be generated against this cluster's public key |
| No pushes despite a successful scan | `sudo cat /etc/scanner/gotify.env` and confirm `GOTIFY_ENABLED=1`; check `journalctl -t scanbd-scan -g "gotify notify failed"` |
| Pushes work via curl but not from the scripts | `saned` likely isn't in the `scanner` group → re-run `make scanner` |
| Wrong hostname (`gotify.homeserver` doesn't resolve) | Confirm `gotify` is in `dnsmasq_hosts` in `group_vars/all.yml`, then `make dnsmasq` |
