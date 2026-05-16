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
│  │                    Ubuntu 24.04 LTS                          │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │   │
│  │  │ tailscaled │  │   chrony     │  │   UFW Firewall       │ │   │
│  │  │ (Tailscale)│  │ (NTP sync)   │  │  (22,80,443,6443..)  │ │   │
│  │  └────────────┘  └──────────────┘  └──────────────────────┘ │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │                   k3s (Kubernetes)                   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │   │
│  │  │  │   Traefik   │  │   ArgoCD    │  │  Workload   │  │   │   │
│  │  │  │  (Ingress)  │  │  (GitOps)   │  │    Apps     │  │   │   │
│  │  │  │  :80/:443   │  │  :30080     │  │             │  │   │   │
│  │  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘  │   │   │
│  │  │         │                │                           │   │   │
│  │  │  ┌──────▼──────────────────────────────────────────┐ │   │   │
│  │  │  │      Flannel VXLAN (Pod Network 10.42.0.0/16)   │ │   │   │
│  │  │  └────────────────────────────────────────────────┘ │   │   │
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

### Ubuntu 24.04 LTS (Base OS)

The foundation of the entire stack. Configured by the `common` Ansible role with:
- Automatic security updates
- UFW firewall with minimal open ports
- Kernel modules for container networking (`br_netfilter`)
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

---

## Port Overview

| Port  | Protocol | Component       | Access         | Description                        |
|-------|----------|-----------------|----------------|------------------------------------|
| 22    | TCP      | SSH             | LAN + Tailscale| Server SSH access                  |
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
