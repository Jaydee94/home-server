# Installation Guide

Step-by-step instructions to provision the home server from scratch.

---

## Overview

The full installation is automated by a single Ansible playbook run. This guide walks through each step from cloning the repository to verifying a working cluster with ArgoCD and Tailscale.

**Total time:** approximately 15–25 minutes (mostly waiting for downloads).

---

## Step 1 — Clone This Repository

```bash
git clone https://github.com/YOUR_USER/home-server.git
cd home-server
```

If you forked this repository, use your fork's URL.

---

## Step 2 — Configure the Inventory (Set Server IP)

Open the inventory file and replace the placeholder IP with your actual server's IP address:

```bash
$EDITOR ansible/inventory/hosts.yml
```

Change `192.168.1.100` to your server's IP:

```yaml
homeserver:
  hosts:
    homeserver:
      ansible_host: 192.168.1.100   # <-- CHANGE THIS
      ansible_user: ubuntu
      ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

If your SSH user is different from `ubuntu`, update `ansible_user` too.

If your SSH key is not at `~/.ssh/id_rsa`, update `ansible_ssh_private_key_file`.

Verify connectivity:

```bash
ansible -i ansible/inventory/hosts.yml homeserver -m ping
# Expected: homeserver | SUCCESS => { "ping": "pong" }
```

---

## Step 3 — Configure Variables

Open the variables file and review every value:

```bash
$EDITOR ansible/group_vars/all.yml
```

**Required changes:**

| Variable           | What to change                                           |
|--------------------|----------------------------------------------------------|
| `timezone`         | Your timezone (e.g., `America/New_York`, `Asia/Tokyo`)   |
| `argocd_repo_url`  | Your GitHub repository URL                               |
| `local_subnet`     | Your home LAN subnet (e.g., `192.168.0.0/24`)            |
| `tailscale_auth_key` | Set via Ansible Vault (see Step 4)                     |

**Optional changes:**

| Variable        | Default          | Notes                                      |
|-----------------|------------------|--------------------------------------------|
| `k3s_version`   | `v1.29.3+k3s1`   | See https://github.com/k3s-io/k3s/releases |
| `argocd_version`| `7.3.11`         | See https://artifacthub.io/packages/helm/argo/argo-cd |
| `helm_version`  | `v3.14.4`        | See https://github.com/helm/helm/releases  |
| `hostname`      | `homeserver`     | Hostname for the machine                   |

---

## Step 4 — Set Tailscale Auth Key with Ansible Vault

**Never commit your auth key in plaintext.** Use Ansible Vault to encrypt it.

1. Get your auth key from the [Tailscale admin panel](https://login.tailscale.com/admin/settings/keys):
   - Click **Generate auth key**
   - Disable **Reusable** (one-time use is safer for a server)
   - Disable **Ephemeral** (the node should persist)
   - Click **Generate key** and copy it (starts with `tskey-auth-...`)

2. Encrypt the key with Ansible Vault:

```bash
ansible-vault encrypt_string 'tskey-auth-YOUR_ACTUAL_KEY_HERE' --name 'tailscale_auth_key'
```

You will be prompted to create a vault password. **Remember this password** — you need it every time you run the playbook.

3. The command outputs something like:

```yaml
tailscale_auth_key: !vault |
          $ANSIBLE_VAULT;1.1;AES256
          39393965316162623733326665376234386665643530...
          ...
Encryption successful
```

4. Replace the `tailscale_auth_key` line in `ansible/group_vars/all.yml` with the entire vault block output (from `tailscale_auth_key:` to the last encrypted line).

5. Verify it's encrypted:

```bash
grep -A5 "tailscale_auth_key:" ansible/group_vars/all.yml
# Should show: tailscale_auth_key: !vault |
# NOT: tailscale_auth_key: "tskey-auth-..."
```

---

## Step 5 — Install Ansible Requirements

Install the required Ansible Galaxy collections on your control machine:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

This installs:
- `ansible.posix` — POSIX system modules
- `community.general` — extended community modules
- `kubernetes.core` — Kubernetes/Helm modules

Verify installation:

```bash
ansible-galaxy collection list | grep -E "ansible.posix|community.general|kubernetes.core"
```

---

## Step 6 — Run the Playbook

Execute the main playbook:

```bash
ansible-playbook \
  -i ansible/inventory/hosts.yml \
  ansible/site.yml \
  --ask-vault-pass
```

Enter the vault password when prompted.

**What the playbook does (in order):**

1. **common role** (~3 min): Updates packages, configures firewall, kernel parameters, swap, chrony
2. **tailscale role** (~1 min): Installs Tailscale and connects to your VPN
3. **k3s role** (~5 min): Installs k3s, configures kubeconfig, installs Helm
4. **argocd role** (~10 min): Deploys ArgoCD via Helm, applies bootstrap ApplicationSet

At the end, the playbook prints a summary with URLs.

**Running only specific roles:**

```bash
# Only run the common role
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags common --ask-vault-pass

# Only run k3s and argocd
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags k3s,argocd --ask-vault-pass

# Skip tailscale
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --skip-tags tailscale --ask-vault-pass
```

**The playbook is fully idempotent** — running it multiple times is safe and makes no unnecessary changes.

---

## Step 7 — Verify Installation

SSH into the server and run these verification commands:

### Check k3s Node Status

```bash
ssh ubuntu@192.168.1.100
kubectl get nodes
```

Expected output:

```
NAME         STATUS   ROLES                  AGE   VERSION
homeserver   Ready    control-plane,master   5m    v1.29.3+k3s1
```

### Check All System Pods

```bash
kubectl get pods -A
```

All pods should be `Running` or `Completed`. Look especially for:
- `kube-system` namespace: Traefik, CoreDNS, metrics-server, local-path-provisioner
- `argocd` namespace: argocd-server, argocd-repo-server, argocd-application-controller, etc.

### Check ArgoCD Application Status

```bash
kubectl get applications -n argocd
# Or
kubectl get applicationsets -n argocd
```

### Check Tailscale Connection

```bash
tailscale status
```

Expected output shows your server connected with a `100.x.x.x` IP and status `Connected`.

```bash
tailscale ip -4
# Outputs the Tailscale IP, e.g.: 100.101.102.103
```

### Check ArgoCD Initial Password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

---

## Step 8 — Access Services

### ArgoCD Web UI

Open a browser and navigate to:

```
http://<server-ip>:30080
```

Or via Tailscale MagicDNS (if enabled):

```
http://homeserver:30080
```

Login credentials:
- **Username:** `admin`
- **Password:** output of the command from Step 7

**Important:** Change the password after first login:
1. Click the user icon (top left)
2. Click **User Info**
3. Click **Update Password**

### ArgoCD CLI

Install the CLI on your local machine:

```bash
# Linux
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd
sudo mv argocd /usr/local/bin/

# macOS
brew install argocd
```

Login:

```bash
argocd login <server-ip>:30080 --username admin --password <initial-password> --insecure
```

### kubectl from Local Machine

Copy the kubeconfig to your local machine:

```bash
# From your local machine
scp ubuntu@192.168.1.100:~/.kube/config ~/.kube/home-server-config

# Use it
KUBECONFIG=~/.kube/home-server-config kubectl get nodes

# Or merge into default kubeconfig
KUBECONFIG=~/.kube/config:~/.kube/home-server-config kubectl config view --merge --flatten > ~/.kube/merged-config
mv ~/.kube/merged-config ~/.kube/config
kubectl config get-contexts
kubectl config use-context default   # or the context name shown
```

Note: The kubeconfig on the server uses `127.0.0.1:6443` as the API server address. For remote access, either:
- Use SSH tunnel: `ssh -L 6443:localhost:6443 ubuntu@192.168.1.100`
- Or update the kubeconfig server address to the Tailscale IP before copying

---

## Updating the Setup

To apply configuration changes after the initial setup, re-run the playbook:

```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

For application changes managed by ArgoCD, simply commit and push to the git repository — ArgoCD will detect and apply changes automatically.
