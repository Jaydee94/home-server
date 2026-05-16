# Prerequisites and Requirements

This document covers everything you need before running the Ansible playbook.

---

## Control Machine Requirements

Your local machine (the one running Ansible) needs:

### Ansible >= 2.14

```bash
# Check version
ansible --version

# Install via pip (recommended)
pip3 install --user "ansible>=2.14"

# Or via pipx (isolated environment)
pipx install ansible

# On Ubuntu/Debian via apt (may be older version)
sudo apt install ansible
```

### Python >= 3.10

```bash
# Check version
python3 --version

# The following Python packages are needed on the control machine
pip3 install --user \
  ansible \
  netaddr \
  jmespath
```

### SSH Client

Standard `ssh` client must be available. Test with:
```bash
ssh -V
```

---

## Target Server Requirements

### Fresh Ubuntu 24.04 LTS Installation

- **Minimal server install** (no desktop environment needed)
- At least **4 GB RAM** (32 GB in this setup — well above minimum)
- At least **20 GB disk** (512 GB NVMe SSD in this setup)
- Network connectivity (DHCP or static IP — static recommended)
- A non-root user with `sudo` privileges (default Ubuntu install creates `ubuntu` user)

### SSH Key Authentication Configured

The control machine must be able to SSH to the server using a key (not password):

```bash
# Generate a key pair if you don't have one
ssh-keygen -t ed25519 -C "home-server-ansible" -f ~/.ssh/id_home_server

# Copy public key to server (you'll be prompted for the password once)
ssh-copy-id -i ~/.ssh/id_home_server.pub ubuntu@192.168.1.100

# Test key-based login
ssh -i ~/.ssh/id_home_server ubuntu@192.168.1.100 "echo 'SSH key auth works'"
```

### Python 3 on the Server

Ubuntu 24.04 ships with Python 3.12. Verify:
```bash
ssh ubuntu@192.168.1.100 "python3 --version"
```

---

## External Account Requirements

### Tailscale Account + Auth Key

1. Sign up at [tailscale.com](https://tailscale.com) (free for personal use)
2. Go to **Settings → Keys** in the Tailscale admin panel
3. Click **Generate auth key**
4. Select options:
   - **Reusable**: No (single-use is more secure)
   - **Ephemeral**: No (server should persist in your network)
   - **Tags**: Optional (e.g., `tag:homeserver`)
5. Copy the key (starts with `tskey-auth-...`)
6. Encrypt it with Ansible Vault (see [Installation Guide](03-installation.md))

### Git Repository for GitOps

ArgoCD needs to pull manifests from a Git repository. Options:

- **Same repository** as this one (recommended for simplicity)
- A separate private repository

The repository must be **publicly accessible** or you must configure ArgoCD with credentials for private repo access.

Update `argocd_repo_url` in `ansible/group_vars/all.yml` with your repository URL.

---

## Ansible Galaxy Collections

Install required collections before running the playbook:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

The `ansible/requirements.yml` file installs:

| Collection           | Version     | Purpose                                    |
|----------------------|-------------|--------------------------------------------|
| `ansible.posix`      | >= 1.5.0    | POSIX modules (sysctl, firewalld, etc.)    |
| `community.general`  | >= 7.0.0    | Extended modules (snap, homebrew, etc.)    |
| `kubernetes.core`    | >= 2.4.0    | kubectl/Helm interaction modules           |

---

## Pre-flight Checklist

Run these checks before executing the playbook. All must pass.

### 1. SSH Connectivity

```bash
ssh ubuntu@192.168.1.100 "whoami"
# Expected output: ubuntu
```

### 2. Sudo Access (Passwordless)

```bash
ssh ubuntu@192.168.1.100 "sudo whoami"
# Expected output: root
# If prompted for password, configure NOPASSWD sudo:
# echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/ubuntu
```

### 3. Ansible Ping

```bash
ansible -i ansible/inventory/hosts.yml homeserver -m ping
# Expected output:
# homeserver | SUCCESS => { "ping": "pong" }
```

### 4. Python Available on Target

```bash
ansible -i ansible/inventory/hosts.yml homeserver -m ansible.builtin.command \
  -a "python3 --version"
# Expected: python3 3.x.x
```

### 5. Internet Connectivity on Server

```bash
ssh ubuntu@192.168.1.100 "curl -sf https://get.k3s.io | head -5"
# Expected: script header lines (no errors)
```

### 6. Sufficient Disk Space

```bash
ssh ubuntu@192.168.1.100 "df -h /"
# Expected: at least 20 GB available
```

### 7. Sufficient Memory

```bash
ssh ubuntu@192.168.1.100 "free -h"
# Expected: at least 4 GB total RAM
```

### 8. Inventory File Updated

```bash
grep "192.168.1.100" ansible/inventory/hosts.yml
# If this returns the default IP, you haven't changed it yet!
# Edit the file and replace 192.168.1.100 with your actual server IP.
```

### 9. group_vars Updated

```bash
grep "YOUR_USER\|CHANGE_ME\|CHANGE_THIS" ansible/group_vars/all.yml
# This should return NO matches — if it does, you have placeholder values to replace.
```

### 10. Ansible Vault Secret Encrypted

```bash
grep "tailscale_auth_key:" ansible/group_vars/all.yml
# Should show the vault-encrypted value, NOT a plain-text key
# Correct: tailscale_auth_key: !vault |
# Wrong:   tailscale_auth_key: "CHANGE_ME_USE_VAULT"
```

---

## Optional: Static IP Configuration

For a server, a static IP is strongly recommended. Configure it before running Ansible.

On Ubuntu 24.04 (netplan):

```bash
# /etc/netplan/00-installer-config.yaml
network:
  version: 2
  ethernets:
    ens3:           # replace with your interface name (ip link show)
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

# Apply:
sudo netplan apply
```

---

## Network Topology Prerequisite

Ensure your home router:
- Has the server reachable at the configured IP
- Does **not** block outbound UDP port 41641 (used by Tailscale)
- Does **not** require port forwarding for Tailscale (it uses DERP relay as fallback)
