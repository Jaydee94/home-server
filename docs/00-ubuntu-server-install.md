# Ubuntu Server 24.04 LTS — Installation Guide

This guide walks through installing **Ubuntu Server 24.04 LTS** on the home server. Use **Ubuntu Server** (not Desktop) — it's the supported base for the k3s cluster.

---

## Hardware

| Component | Recommended       | Reference build           |
|-----------|-------------------|---------------------------|
| CPU       | x86-64, 2+ cores  | Intel Core i5             |
| RAM       | ≥ 4 GB            | 32 GB                     |
| Storage   | ≥ 20 GB           | 512 GB NVMe SSD           |
| Network   | Wired Ethernet    | 1 Gbps                    |
| OS        | Ubuntu Server 24.04 LTS (Noble Numbat) |

---

## Step 1 — Download the Ubuntu Server ISO

Download from the official site:

<https://ubuntu.com/download/server>

> Pick **Ubuntu Server**, not Ubuntu Desktop. Current LTS: **24.04.x (Noble Numbat)**.

Optional but recommended — verify the SHA256 sum:

```bash
sha256sum ubuntu-24.04.*-live-server-amd64.iso
# Compare against: https://releases.ubuntu.com/24.04/SHA256SUMS
```

---

## Step 2 — Create a bootable USB stick

**Linux**

```bash
lsblk                                                       # find your USB device, e.g. /dev/sdb
sudo dd if=ubuntu-24.04.*-live-server-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

**macOS**

```bash
diskutil list                                               # find your USB, e.g. /dev/disk4
diskutil unmountDisk /dev/diskX
sudo dd if=ubuntu-24.04.*-live-server-amd64.iso of=/dev/rdiskX bs=4m
```

**Windows** — use [Rufus](https://rufus.ie).

> The USB stick will be wiped. Double-check the device path.

---

## Step 3 — Install Ubuntu Server

1. Boot the server from the USB stick (BIOS/UEFI key is usually `F2`, `F10`, `F12`, or `Del`).
2. Walk through the Subiquity installer:

| Step                 | Setting                                                                |
|----------------------|------------------------------------------------------------------------|
| Language             | English (avoids locale issues)                                         |
| Keyboard layout      | Your local layout (e.g. German)                                        |
| Installation type    | **Ubuntu Server** (NOT *minimized*)                                    |
| Network              | Accept DHCP for now — set a static IP later                            |
| Proxy                | Leave blank                                                            |
| Mirror               | Default                                                                |
| Storage              | **Use an entire disk** + **Set up this disk as an LVM group**          |
| Profile              | Username **`ubuntu`** (must match the inventory)                       |
| Server name          | **`homeserver`** (must match `hostname` in `group_vars/all.yml`)       |
| SSH                  | **Install OpenSSH server** (optionally import your GitHub/Launchpad keys) |
| Featured snaps       | Skip all — Ansible installs everything                                 |

3. Reboot when prompted and remove the USB stick.

---

## Step 4 — First login & find the server's IP

After reboot, log in (locally or via SSH if you imported a key):

```bash
ip -4 addr show         # find the server's IP, e.g. 192.168.1.123
hostname -I             # short form
```

---

## Step 5 — Push your SSH key from the control machine

On your **local** machine (the one that will run Ansible):

```bash
# Generate a key if you don't have one
ssh-keygen -t ed25519 -C "home-server-ansible" -f ~/.ssh/id_ed25519

# Copy the public key to the server (one-time password login)
ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@<server-ip>

# Verify passwordless login works
ssh -i ~/.ssh/id_ed25519 ubuntu@<server-ip> "echo 'SSH key auth works'"
```

If you used a different filename (or the legacy `~/.ssh/id_rsa`), update `ansible_ssh_private_key_file` in `ansible/inventory/hosts.yml`.

---

## Step 6 — Set a static IP

A static IP is strongly recommended for a server.

### Option A — Let Ansible handle it (recommended)

In `ansible/group_vars/all.yml`:

```yaml
network_configure_static_ip: true
network_interface: eno1          # CHANGE — find yours with: ip link show
network_static_ip: 192.168.1.100 # CHANGE
network_prefix_length: 24
network_gateway: 192.168.1.1     # CHANGE — your router's IP
network_dns:
  - 1.1.1.1
  - 8.8.8.8
```

The SSH session briefly drops while Netplan reconfigures. Make sure `ansible_host` in the inventory points at the new IP (or set it ahead of time).

### Option B — Do it manually before Ansible

```bash
ip link show                              # discover interface name, e.g. eno1
sudo $EDITOR /etc/netplan/00-installer-config.yaml
```

Replace the file with:

```yaml
network:
  version: 2
  ethernets:
    eno1:                       # your interface
      dhcp4: false
      addresses:
        - 192.168.1.100/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

Then:

```bash
sudo netplan apply
```

Test from your laptop:

```bash
ping 192.168.1.100
ssh ubuntu@192.168.1.100
```

---

## Step 7 — Enable passwordless sudo

Ansible needs `NOPASSWD` sudo. Ubuntu Server doesn't enable this by default — check and fix if needed:

```bash
sudo -n whoami           # should print "root" without prompting
# If it prompts for a password:
echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/ubuntu
sudo chmod 0440 /etc/sudoers.d/ubuntu
```

---

## Step 8 — System updates

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

---

## Ready for Ansible — checklist

- [ ] Ubuntu Server 24.04 LTS installed (not Desktop)
- [ ] Username is `ubuntu`
- [ ] Hostname matches `hostname` in `ansible/group_vars/all.yml` (default: `homeserver`)
- [ ] SSH key login works (`ssh -i ~/.ssh/id_ed25519 ubuntu@<ip>`)
- [ ] Passwordless sudo works (`sudo -n whoami` → `root`)
- [ ] Server has a static IP
- [ ] Internet is reachable from the server (`ping 1.1.1.1`)
- [ ] `ansible/inventory/hosts.yml` has the correct IP
- [ ] `ansible/group_vars/all.yml` is filled in (`argocd_repo_url`, `local_subnet`, `timezone`)
- [ ] Tailscale auth key encrypted with Ansible Vault

When everything is checked, continue with the **[Installation Guide](03-installation.md)**.
