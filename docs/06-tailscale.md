# Tailscale VPN Guide

This document covers Tailscale setup, MagicDNS, subnet routing, and client device configuration.

---

## Overview

Tailscale creates a WireGuard-based mesh VPN (called a "tailnet") between all your devices. Once the home server joins your tailnet, you can access all its services from any device running Tailscale — without any port forwarding, dynamic DNS, or open ports on your router.

---

## Getting an Auth Key

Auth keys allow devices to join your tailnet automatically (useful for servers where interactive browser login isn't practical).

1. Log in to the [Tailscale admin panel](https://login.tailscale.com/admin)
2. Navigate to **Settings** → **Keys**
3. Click **Generate auth key**
4. Configure the key:
   - **Reusable:** Disable (one-time use is safer)
   - **Ephemeral:** Disable (server should persist when offline)
   - **Tags:** Optional — add `tag:homeserver` if using ACL tags
   - **Expiry:** Set a reasonable expiry (or disable for convenience)
5. Click **Generate key**
6. Copy the key immediately — it's only shown once

**Encrypt the key with Ansible Vault** (never store in plaintext):

```bash
ansible-vault encrypt_string 'tskey-auth-YOUR_KEY_HERE' --name 'tailscale_auth_key'
```

Paste the encrypted block into `ansible/group_vars/all.yml`.

---

## MagicDNS Setup

Tailscale MagicDNS provides automatic DNS resolution for all devices in your tailnet. With MagicDNS, you can reach your home server at `homeserver` or `homeserver.tail12345.ts.net` from any Tailscale-connected device.

**Enable MagicDNS:**

1. Go to [Tailscale admin panel](https://login.tailscale.com/admin) → **DNS**
2. Toggle **Enable MagicDNS** on
3. Optionally set a **Global nameserver** (e.g., `1.1.1.1`) for non-Tailscale hostnames

**After enabling MagicDNS, access your server:**

```
# Short hostname (within tailnet)
http://homeserver:30080        # ArgoCD
ssh homeserver                 # SSH

# Fully qualified tailnet hostname
http://homeserver.tail12345.ts.net:30080
ssh homeserver.tail12345.ts.net
```

Find your tailnet name in the admin panel under **Settings** → **General**.

**Test MagicDNS:**

```bash
# From a client device with Tailscale running
ping homeserver
nslookup homeserver
curl http://homeserver:30080
```

---

## Accessing Services via Tailscale IP

Every device in your tailnet gets a stable IP in the `100.x.x.x` range (CGNAT).

Find your server's Tailscale IP:

```bash
# On the server
tailscale ip -4

# From the admin panel
# Go to https://login.tailscale.com/admin/machines and find your server
```

Example: if your server's Tailscale IP is `100.101.102.103`:

```
http://100.101.102.103:30080    # ArgoCD
http://100.101.102.103:80       # Traefik HTTP
ssh 100.101.102.103             # SSH
kubectl --server=https://100.101.102.103:6443 get nodes
```

---

## Subnet Routing

Subnet routing allows other Tailscale clients to reach devices on your **home LAN** that don't have Tailscale installed — like a NAS, smart TV, or printer.

The Ansible role configures the server to advertise your local subnet (`local_subnet` variable, default `192.168.1.0/24`).

**Enable subnet routes:**

After the playbook runs, approve the advertised routes in the admin panel:

1. Go to [Tailscale admin panel](https://login.tailscale.com/admin/machines)
2. Find your home server
3. Click **...** → **Edit route settings**
4. Enable the advertised subnet (`192.168.1.0/24`)
5. Click **Save**

**Test subnet access:**

```bash
# From a Tailscale client device
# Access a LAN device (e.g., your router at 192.168.1.1)
ping 192.168.1.1
curl http://192.168.1.1/      # router admin page (if accessible)

# Access the home server's LAN IP directly
curl http://192.168.1.100:30080
```

**Enable subnet routing on client:**

On macOS/Windows/iOS/Android Tailscale clients, you may need to enable "Use Tailscale subnets" in the app settings for subnet routes to work.

On Linux clients:

```bash
sudo tailscale up --accept-routes
```

---

## Connecting Client Devices

Install Tailscale on all your devices:

### Linux

```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Connect (opens browser for auth)
sudo tailscale up

# Connect with subnet routing enabled
sudo tailscale up --accept-routes

# Status
tailscale status
tailscale ip -4
```

### macOS

```bash
# Via Homebrew
brew install --cask tailscale

# Or download from Mac App Store:
# https://apps.apple.com/app/tailscale/id1475387142
```

After install, click the Tailscale icon in the menu bar → **Log In**.

### Windows

Download from: https://tailscale.com/download/windows

Click the Tailscale icon in the system tray → **Log In**.

### iOS / Android

Available in the App Store and Google Play. Search for "Tailscale".

### Verifying Connectivity

After connecting a client, verify it can reach the home server:

```bash
# From client
tailscale status                         # should show homeserver in list
ping homeserver                          # MagicDNS
curl http://homeserver:30080             # ArgoCD
ssh ubuntu@homeserver                    # SSH
```

---

## Server Tailscale Management

**Check Tailscale status on the server:**

```bash
tailscale status
```

Output shows all devices in your tailnet and their connection status.

**Check connection details:**

```bash
tailscale status --json | jq .
tailscale ping homeserver           # latency to another tailnet device
tailscale netcheck                  # network diagnostics
```

**Common Tailscale commands on the server:**

```bash
# Disconnect from tailnet
sudo tailscale down

# Reconnect (uses existing auth)
sudo tailscale up

# Force re-authentication
sudo tailscale up --force-reauth

# Show Tailscale IP
tailscale ip -4
tailscale ip -6

# View Tailscale logs
sudo journalctl -u tailscaled -f
sudo journalctl -u tailscaled --since "1 hour ago"

# Service management
sudo systemctl status tailscaled
sudo systemctl restart tailscaled
```

---

## Exit Node Configuration (Optional)

Making your home server an exit node routes **all** internet traffic from your client devices through your home internet connection. This is useful when on untrusted networks (public WiFi).

**Enable exit node on server:**

```bash
# Advertise as exit node
sudo tailscale up \
  --advertise-exit-node \
  --advertise-routes=192.168.1.0/24 \
  --hostname=homeserver
```

**Approve in admin panel:**

1. Go to [admin panel](https://login.tailscale.com/admin/machines) → your server
2. Click **...** → **Edit route settings**
3. Enable **Use as exit node**
4. Click **Save**

**Use exit node on client:**

```bash
# Linux client: use homeserver as exit node
sudo tailscale up --exit-node=homeserver

# Or use the Tailscale IP
sudo tailscale up --exit-node=100.101.102.103

# Disable exit node
sudo tailscale up --exit-node=
```

On macOS/Windows: Tailscale icon → **Exit Node** → select your server.

**Verify exit node is working:**

```bash
# Should show your home IP, not your current network's IP
curl ifconfig.me
```

---

## ACL Configuration

Tailscale ACLs (Access Control Lists) control which devices can communicate with which other devices. The default policy allows all-to-all.

To restrict access, edit your ACL policy in the [admin panel](https://login.tailscale.com/admin/acls):

**Example: Allow only specific devices to reach the home server:**

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:personal-devices"],
      "dst": ["tag:homeserver:*"]
    }
  ],
  "tagOwners": {
    "tag:homeserver": ["autogroup:admin"],
    "tag:personal-devices": ["autogroup:admin"]
  }
}
```

Then generate auth keys with the appropriate tags (`tag:homeserver` for the server, `tag:personal-devices` for laptops/phones).

---

## Troubleshooting Tailscale

See [07-troubleshooting.md](07-troubleshooting.md#tailscale-not-connecting) for detailed troubleshooting steps.

Quick checks:

```bash
# Is tailscaled running?
sudo systemctl status tailscaled

# Is the server connected?
tailscale status

# Network diagnostics
tailscale netcheck

# Can the server reach Tailscale servers?
curl -sv https://login.tailscale.com/

# View full logs
sudo journalctl -u tailscaled --since "30 minutes ago"
```
