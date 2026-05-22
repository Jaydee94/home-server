# Architecture Overview

This document describes the high-level architecture of the home server setup.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ WireGuard / Tailscale
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TAILSCALE VPN OVERLAY                            │
│                  (100.x.x.x address space)                          │
│                                                                     │
│   ┌─────────────┐         ┌──────────────┐      ┌──────────────┐   │
│   │  Laptop /   │         │    Phone /   │      │   Remote     │   │
│   │  Desktop    │◄───────►│    Tablet    │      │   Machine    │   │
│   └─────────────┘         └──────────────┘      └──────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Tailscale MagicDNS / IP
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    HOME SERVER (192.168.1.100)                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Ubuntu 26.04 LTS                          │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │   │
│  │  │ tailscaled │  │   chrony     │  │   UFW Firewall       │ │   │
│  │  │ (Tailscale)│  │ (NTP sync)   │  │  (22,80,443,6443..)  │ │   │
│  │  └────────────┘  └──────────────┘  └──────────────────────┘ │   │
│  │  ┌──────────────┐  ┌─────────────────────────────────────┐  │   │
│  │  │   dnsmasq    │  │   scanbd + SANE + scan_*.sh         │  │   │
│  │  │ split-DNS    │  │   (Fujitsu USB scanner pipeline)    │  │   │
│  │  │ *.homeserver │  │   ──► CIFS mount to UGREEN NAS      │  │   │
│  │  │ :53 LAN+TS   │  │       (Paperless-NGX consume dir)   │  │   │
│  │  └──────────────┘  └─────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │                   k3s (Kubernetes)                   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │   │
│  │  │  │   Traefik   │  │   ArgoCD    │  │  Workload   │  │   │   │
│  │  │  │  (Ingress)  │  │  (GitOps)   │  │   Apps      │  │   │   │
│  │  │  │  :80/:443   │  │  :30080     │  │  (see ↓)    │  │   │   │
│  │  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘  │   │   │
│  │  │         │                │                           │   │   │
│  │  │  ┌──────┴────────────────┴──────────────────────┐   │   │   │
│  │  │  │  argocd/apps/ — managed by ApplicationSet:   │   │   │   │
│  │  │  │    monitoring (VictoriaMetrics + Grafana),   │   │   │   │
│  │  │  │    sealed-secrets + kubeseal-webgui,         │   │   │   │
│  │  │  │    semaphore (Ansible UI),                   │   │   │   │
│  │  │  │    headlamp (k8s dashboard), gotify (push),  │   │   │   │
│  │  │  │    example-whoami                            │   │   │   │
│  │  │  └─────────────────────────────────────────────┘   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌──────────────────────────────────────────────┐   │   │   │
│  │  │  │   Flannel VXLAN (Pod Network 10.42.0.0/16)   │   │   │   │
│  │  │  └──────────────────────────────────────────────┘   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌──────────────────────────────────────────────┐   │   │   │
│  │  │  │   local-path StorageClass (NVMe SSD)         │   │   │   │
│  │  │  └──────────────────────────────────────────────┘   │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ git pull (HTTPS/SSH)
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                    GIT REPOSITORY (GitHub)                          │
│                                                                     │
│   home-server/                                                      │
│   └── argocd/apps/          ← ArgoCD watches this directory        │
│       ├── example-whoami/   ← Each subdirectory = one Application  │
│       ├── monitoring/                                              │
│       ├── sealed-secrets/                                          │
│       ├── kubeseal-webgui/                                         │
│       ├── headlamp/                                                │
│       ├── semaphore/                                               │
│       ├── gotify/                                                  │
│       └── my-new-app/       ← Add directory → auto-deployed        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## GitOps Flow

```
Developer                Git Repo               ArgoCD              k3s Cluster
    │                       │                     │                      │
    │── git push ──────────►│                     │                      │
    │                       │◄── poll (3min) ─────│                      │
    │                       │──── diff detected ──►│                      │
    │                       │                     │── kubectl apply ────►│
    │                       │                     │                      │── Pods running
    │                       │                     │◄── status sync ──────│
    │                       │                     │── sync complete      │
```

---

## Component Descriptions

### Ubuntu 26.04 LTS (Base OS)

The foundation of the entire stack. Configured by the `common` Ansible role with:
- Full `apt dist-upgrade` on every Ansible run (controlled by `auto_upgrade`)
- `unattended-upgrades` enabled for daily background security patches
- Reboot triggered automatically when `/var/run/reboot-required` is present
- UFW firewall with minimal open ports
- Kernel modules for container networking (`br_netfilter`, `overlay`)
- sysctl tuning for Kubernetes requirements
- Chrony for NTP time synchronization
- Swap disabled (required for Kubernetes)

### k3s (Kubernetes Distribution)

k3s is a CNCF-certified, production-ready Kubernetes distribution optimized for resource-constrained environments. On this hardware (i5 + 32GB RAM), k3s operates far below its resource limits.

Bundled components used in this setup:
- **Flannel** (VXLAN mode) for pod networking
- **Traefik** v2 as the default Ingress controller
- **CoreDNS** for cluster DNS
- **local-path provisioner** for PersistentVolume storage
- **metrics-server** for resource metrics

### ArgoCD (GitOps Controller)

ArgoCD continuously monitors the Git repository and reconciles the cluster state with the desired state defined in YAML manifests. Deployed via Helm into the `argocd` namespace.

The **ApplicationSet** controller enables dynamic application generation from directory patterns — simply create a new directory under `argocd/apps/` and push; ArgoCD automatically creates and syncs a new Application for it.

### Tailscale (VPN)

Tailscale provides a WireGuard-based mesh VPN. The home server acts as a node in your Tailscale network, making all services accessible from any of your devices via MagicDNS hostnames or Tailscale IP addresses — without opening any ports on your router.

### Traefik (Ingress Controller)

Bundled with k3s, Traefik handles HTTP/HTTPS routing into the cluster. Services are exposed via Kubernetes `Ingress` resources or Traefik's native `IngressRoute` CRD.

### dnsmasq (Split-DNS for `*.homeserver`)

A bare-metal `dnsmasq` runs on the host and serves the `*.homeserver`
zone on both the LAN interface and `tailscale0`. Every entry in
`dnsmasq_hosts` (`ansible/group_vars/all.yml`) resolves to the server's
LAN IP, which lets you reach apps as `grafana.homeserver`,
`argocd.homeserver`, etc. from anywhere in the LAN or tailnet without
touching the router or the Tailscale admin console for each new app.
The architecture (and why the home-server is intentionally **not** your
LAN-wide DNS server) is covered in detail in
[`09-dns-architecture.md`](09-dns-architecture.md).

### Scanner + Paperless Pipeline

A Fujitsu USB scanner sits directly on the host. `scanbd` listens on the
hardware button and triggers shell scripts (`scan_button.sh` →
`scan_to_pdf.sh`) that produce a PDF and drop it onto a CIFS mount of
the UGREEN NAS, where Paperless-NGX picks it up. Optional Gotify push
notifications are sent from the same scripts. Full setup is in
[`10-scanner.md`](10-scanner.md) and [`11-gotify.md`](11-gotify.md).

### Monitoring Stack (VictoriaMetrics + Grafana)

Deployed via `argocd/apps/monitoring/`. VMSingle stores 15 days of TSDB
on a `local-path` PVC, VMAgent scrapes both `VMServiceScrape`/`VMPodScrape`
CRDs and Prometheus `ServiceMonitor` CRDs (auto-converted), and Grafana
ships pre-loaded dashboards (Node Exporter Full, VictoriaMetrics,
Kubernetes Views) at `http://grafana.homeserver`.

### Sealed Secrets

Bitnami's `sealed-secrets` controller (under `argocd/apps/sealed-secrets/`)
decrypts in-cluster `SealedSecret` CRDs into regular Kubernetes
`Secret`s. `kubeseal-webgui` (under `argocd/apps/kubeseal-webgui/`)
provides a small browser UI that encrypts plaintext values against the
controller's public key — useful for committing per-app secrets safely
to the GitOps repo.

### Semaphore (Ansible Web UI)

Runs as a k8s pod under `argocd/apps/semaphore/`. The
`semaphore_bootstrap` Ansible role calls Semaphore's REST API to
provision Projects, Inventories, Repositories and Templates idempotently,
so the UI is ready to use after the first playbook run.

---

## Port Overview

| Port  | Protocol | Component       | Access         | Description                        |
|-------|----------|-----------------|----------------|------------------------------------|
| 22    | TCP      | SSH             | LAN + Tailscale| Server SSH access                  |
| 53    | UDP+TCP  | dnsmasq         | LAN + Tailscale| Split-DNS for `*.homeserver`       |
| 80    | TCP      | Traefik         | LAN + Tailscale| HTTP ingress                       |
| 443   | TCP      | Traefik         | LAN + Tailscale| HTTPS ingress                      |
| 6443  | TCP      | k3s API Server  | LAN + Tailscale| Kubernetes API                     |
| 30080 | TCP      | ArgoCD NodePort | LAN + Tailscale| ArgoCD web UI (HTTP)               |
| 30443 | TCP      | ArgoCD NodePort | LAN + Tailscale| ArgoCD web UI (HTTPS)              |
| 41641 | UDP      | Tailscale       | Internet       | WireGuard VPN (Tailscale)          |
| 10250 | TCP      | k3s kubelet     | Internal       | kubelet API                        |
| 8472  | UDP      | Flannel VXLAN   | Internal       | Pod overlay network                |

---

## Network Overview

| Network             | CIDR              | Purpose                          |
|---------------------|-------------------|----------------------------------|
| Home LAN            | 192.168.1.0/24    | Physical home network            |
| Tailscale overlay   | 100.64.0.0/10     | VPN mesh network                 |
| k3s Pod CIDR        | 10.42.0.0/16      | Pod IP addresses                 |
| k3s Service CIDR    | 10.43.0.0/16      | ClusterIP service addresses      |

---

## Security Model

- **No ports exposed to the internet** — all remote access is via Tailscale
- **UFW firewall** blocks everything not explicitly allowed
- **Tailscale ACLs** can further restrict which devices access which services
- **ArgoCD** only has read access to the Git repository
- **Ansible Vault** encrypts the Tailscale auth key at rest
