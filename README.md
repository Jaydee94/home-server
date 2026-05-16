```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ██╗  ██╗ ██████╗ ███╗   ███╗███████╗    ██╗      █████╗ ██████╗  ║
║   ██║  ██║██╔═══██╗████╗ ████║██╔════╝    ██║     ██╔══██╗██╔══██╗ ║
║   ███████║██║   ██║██╔████╔██║█████╗      ██║     ███████║██████╔╝ ║
║   ██╔══██║██║   ██║██║╚██╔╝██║██╔══╝      ██║     ██╔══██║██╔══██╗ ║
║   ██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗    ███████╗██║  ██║██████╔╝ ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝    ╚══════╝╚═╝  ╚═╝╚═════╝  ║
║                                                                  ║
║           k3s · ArgoCD · Tailscale · GitOps                     ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04_LTS-E95420?style=flat-square&logo=ubuntu&logoColor=white)
![k3s](https://img.shields.io/badge/k3s-v1.29.3-FFC61C?style=flat-square&logo=k3s&logoColor=black)
![ArgoCD](https://img.shields.io/badge/ArgoCD-7.3.11-EF7B4D?style=flat-square&logo=argo&logoColor=white)
![Tailscale](https://img.shields.io/badge/Tailscale-VPN-246FDB?style=flat-square&logo=tailscale&logoColor=white)
![Ansible](https://img.shields.io/badge/Ansible-2.14+-EE0000?style=flat-square&logo=ansible&logoColor=white)

---

## Overview

A fully automated home server setup using **Ansible** to provision:

- **Ubuntu 24.04 LTS** as the base OS
- **k3s** — lightweight Kubernetes for edge/home use
- **ArgoCD** — GitOps continuous delivery with ApplicationSets
- **Tailscale** — zero-config VPN for secure remote access
- **Traefik** — ingress controller (bundled with k3s)

Everything is managed as code. Push to git → ArgoCD picks it up → your cluster is updated.

---

## Quick Start

> **Neu hier?** Zuerst Ubuntu Server 24.04 LTS installieren: [docs/00-ubuntu-server-install.md](docs/00-ubuntu-server-install.md)
>
> Prerequisites: Ansible >= 2.14, SSH key access to your server, Tailscale account.
> Full details in [docs/02-prerequisites.md](docs/02-prerequisites.md).

**Step 1 — Clone this repository**
```bash
git clone https://github.com/YOUR_USER/home-server.git
cd home-server
```

**Step 2 — Configure your server IP**
```bash
# Edit the inventory file and replace 192.168.1.100 with your server's IP
$EDITOR ansible/inventory/hosts.yml
```

**Step 3 — Configure variables and secrets**
```bash
# Review and update variables (repo URL, timezone, subnet, etc.)
$EDITOR ansible/group_vars/all.yml

# Encrypt your Tailscale auth key with Ansible Vault
ansible-vault encrypt_string 'tskey-auth-YOUR_KEY_HERE' --name 'tailscale_auth_key'
# Paste the output into ansible/group_vars/all.yml replacing the tailscale_auth_key value
```

**Step 4 — Install Ansible dependencies**
```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

**Step 5 — Run the playbook**
```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

After the playbook completes, ArgoCD is available at `http://<server-ip>:30080`.

---

## Directory Structure

```
home-server/
├── README.md                          # This file
├── docs/
│   ├── 01-overview.md                 # Architecture overview
│   ├── 02-prerequisites.md            # Requirements & pre-flight checklist
│   ├── 03-installation.md             # Step-by-step installation guide
│   ├── 04-k3s.md                      # k3s configuration reference
│   ├── 05-argocd.md                   # ArgoCD GitOps guide
│   ├── 06-tailscale.md                # Tailscale VPN guide
│   └── 07-troubleshooting.md          # Troubleshooting guide
├── ansible/
│   ├── site.yml                       # Main playbook entry point
│   ├── requirements.yml               # Ansible Galaxy collections
│   ├── inventory/
│   │   └── hosts.yml                  # Server inventory
│   ├── group_vars/
│   │   └── all.yml                    # All configurable variables
│   └── roles/
│       ├── common/                    # Base OS configuration
│       │   ├── tasks/main.yml
│       │   └── handlers/main.yml
│       ├── k3s/                       # k3s installation
│       │   ├── tasks/main.yml
│       │   └── templates/k3s-config.yaml.j2
│       ├── tailscale/                 # Tailscale VPN setup
│       │   └── tasks/main.yml
│       └── argocd/                    # ArgoCD installation
│           ├── tasks/main.yml
│           └── templates/
│               ├── argocd-values.yaml.j2
│               └── bootstrap-applicationset.yaml.j2
└── argocd/
    ├── bootstrap/
    │   └── root-applicationset.yaml   # Bootstrap ApplicationSet (committed to git)
    └── apps/
        └── example-whoami/            # Example Helm chart (whoami echo server)
            ├── Chart.yaml
            ├── values.yaml
            └── templates/
                ├── deployment.yaml
                ├── service.yaml
                └── ingress.yaml
```

---

## Tech Stack

| Component       | Technology           | Version    | Purpose                               |
|-----------------|----------------------|------------|---------------------------------------|
| Operating System| Ubuntu Server        | 24.04 LTS  | Base OS                               |
| Orchestration   | k3s                  | v1.29.3    | Lightweight Kubernetes                |
| GitOps          | ArgoCD               | 7.3.11     | Continuous delivery from Git          |
| App Delivery    | ApplicationSets      | built-in   | Multi-app GitOps via directory scan   |
| VPN             | Tailscale            | latest     | Zero-config WireGuard VPN             |
| Ingress         | Traefik              | v2.x       | HTTP/HTTPS reverse proxy (k3s bundled)|
| Automation      | Ansible              | >= 2.14    | Infrastructure as Code                |
| Package Manager | Helm                 | v3.14.4    | Kubernetes application packaging      |
| Storage         | local-path           | built-in   | Host-path based PersistentVolumes     |
| Networking      | Flannel (VXLAN)      | built-in   | Pod-to-pod networking                 |

---

## Hardware Specs

| Component | Specification                  |
|-----------|--------------------------------|
| CPU       | Intel Core i5                  |
| RAM       | 32 GB                          |
| Storage   | 512 GB NVMe SSD                |
| Network   | 1 Gbps Ethernet                |
| OS        | Ubuntu 24.04 LTS (fresh install)|

---

## Documentation Links

| Document                                                      | Description                              |
|---------------------------------------------------------------|------------------------------------------|
| [Ubuntu Server Installation](docs/00-ubuntu-server-install.md)| ISO herunterladen, installieren, vorbereiten |
| [Architecture Overview](docs/01-overview.md)                  | System design and component diagram      |
| [Prerequisites](docs/02-prerequisites.md)                     | Requirements and pre-flight checklist    |
| [Installation Guide](docs/03-installation.md)                 | Full step-by-step setup walkthrough      |
| [k3s Reference](docs/04-k3s.md)                               | k3s config, kubectl cheatsheet           |
| [ArgoCD GitOps Guide](docs/05-argocd.md)                      | Managing apps with ArgoCD                |
| [Tailscale VPN Guide](docs/06-tailscale.md)                   | VPN setup and client connection          |
| [Troubleshooting](docs/07-troubleshooting.md)                 | Common issues and debug commands         |
