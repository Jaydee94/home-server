# Architektur-Überblick

Dieses Dokument beschreibt die High-Level-Architektur des Home-Server-Setups.

---

## System-Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ WireGuard / Tailscale
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TAILSCALE VPN OVERLAY                            │
│                  (100.x.x.x Adressbereich)                          │
│                                                                     │
│   ┌─────────────┐         ┌──────────────┐      ┌──────────────┐   │
│   │  Laptop /   │         │    Phone /   │      │   Remote     │   │
│   │  Desktop    │◄───────►│    Tablet    │      │   Machine    │   │
│   └─────────────┘         └──────────────┘      └──────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Tailscale MagicDNS / IP
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    HOME SERVER (192.168.178.127)                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Ubuntu 26.04 LTS                          │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │   │
│  │  │ tailscaled │  │   chrony     │  │   UFW Firewall       │ │   │
│  │  │ (Tailscale)│  │ (NTP sync)   │  │  (22,80,443,6443..)  │ │   │
│  │  └────────────┘  └──────────────┘  └──────────────────────┘ │   │
│  │  ┌──────────────┐  ┌─────────────────────────────────────┐  │   │
│  │  │   host_dns   │  │   scanbd + SANE + scan_*.sh         │  │   │
│  │  │ resolver →   │  │   (Fujitsu USB Scanner Pipeline)    │  │   │
│  │  │ Pi-hole (k3s)│  │   ──► CIFS Mount auf UGREEN NAS     │  │   │
│  │  │ *.homeserver │  │       (Paperless-NGX consume-Dir)   │  │   │
│  │  └──────────────┘  └─────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │                   k3s (Kubernetes)                   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │   │
│  │  │  │   Traefik   │  │   ArgoCD    │  │  Workload   │  │   │   │
│  │  │  │  (Ingress)  │  │  (GitOps)   │  │   Apps      │  │   │   │
│  │  │  │  :80/:443   │  │  :30080     │  │  (siehe ↓)  │  │   │   │
│  │  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘  │   │   │
│  │  │         │                │                           │   │   │
│  │  │  ┌──────┴────────────────┴──────────────────────┐   │   │   │
│  │  │  │  argocd/apps/ — verwaltet vom ApplicationSet:│   │   │   │
│  │  │  │    metallb (LB-IP), pihole (DNS+Adblock),    │   │   │   │
│  │  │  │    monitoring + monitoring-dashboards,        │   │   │   │
│  │  │  │    sealed-secrets + kubeseal-webgui,         │   │   │   │
│  │  │  │    semaphore, argo-workflows + minio,        │   │   │   │
│  │  │  │    headlamp, gotify, homepage, paperless-ai, │   │   │   │
│  │  │  │    home-assistant, jellyfin, mosquitto,      │   │   │   │
│  │  │  │    kubevirt, gameserver, gameserver-ui,      │   │   │   │
│  │  │  │    csi-driver-smb, example-whoami            │   │   │   │
│  │  │  └─────────────────────────────────────────────┘   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌──────────────────────────────────────────────┐   │   │   │
│  │  │  │   Flannel VXLAN (Pod-Netz 10.42.0.0/16)      │   │   │   │
│  │  │  └──────────────────────────────────────────────┘   │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌──────────────────────────────────────────────┐   │   │   │
│  │  │  │   local-path StorageClass (NVMe-SSD)         │   │   │   │
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
│   └── argocd/apps/          ← ArgoCD beobachtet dieses Verzeichnis │
│       ├── example-whoami/   ← Jedes Unterverzeichnis = eine App    │
│       ├── metallb/                                                 │
│       ├── pihole/                                                  │
│       ├── monitoring/                                              │
│       ├── sealed-secrets/                                          │
│       ├── kubeseal-webgui/                                         │
│       ├── headlamp/                                                │
│       ├── semaphore/                                               │
│       ├── argo-workflows/                                          │
│       ├── minio/                                                   │
│       ├── gotify/                                                  │
│       ├── homepage/                                                │
│       ├── paperless-ai/                                            │
│       ├── home-assistant/                                           │
│       ├── jellyfin/                                                 │
│       ├── mosquitto/                                                │
│       ├── kubevirt/                                                 │
│       ├── gameserver/                                               │
│       ├── gameserver-ui/                                            │
│       ├── csi-driver-smb/                                           │
│       └── my-new-app/       ← Verzeichnis anlegen → auto-deployed  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## GitOps-Flow

```
Developer                Git Repo               ArgoCD              k3s Cluster
    │                       │                     │                      │
    │── git push ──────────►│                     │                      │
    │                       │◄── poll (3 min) ────│                      │
    │                       │─── diff erkannt ───►│                      │
    │                       │                     │── kubectl apply ────►│
    │                       │                     │                      │── Pods laufen
    │                       │                     │◄── Status-Sync ──────│
    │                       │                     │── Sync complete      │
```

---

## Komponenten

### Ubuntu 26.04 LTS (Base-OS)

Das Fundament des ganzen Stacks. Konfiguriert durch die Ansible-Rolle `common`:

- Vollständiges `apt dist-upgrade` bei jedem Ansible-Run (gesteuert über `auto_upgrade`)
- `unattended-upgrades` aktiv für tägliche Sicherheits-Patches im Hintergrund
- Automatischer Reboot, wenn `/var/run/reboot-required` existiert
- UFW-Firewall mit minimal offenen Ports
- Kernel-Module für Container-Netzwerk (`br_netfilter`, `overlay`)
- sysctl-Tuning für Kubernetes-Anforderungen
- Chrony für NTP-Zeitsync
- Swap deaktiviert (Kubernetes-Pflicht)

### k3s (Kubernetes-Distribution)

k3s ist eine CNCF-zertifizierte, produktionsreife Kubernetes-Distribution,
optimiert für ressourcenarme Umgebungen. Auf dieser Hardware (i5 + 32 GB RAM)
läuft k3s weit unter seinem Limit.

Mitgelieferte Komponenten:

- **Flannel** (VXLAN) für Pod-Networking
- **Traefik v2** als Default-Ingress-Controller
- **CoreDNS** für Cluster-DNS
- **local-path Provisioner** für PersistentVolume-Storage
- **metrics-server** für Resource-Metriken

### ArgoCD (GitOps-Controller)

ArgoCD beobachtet das Git-Repository und gleicht den Cluster-State mit dem
gewünschten YAML-State ab. Wird per Helm-Chart in den `argocd`-Namespace deployt.

Der **ApplicationSet**-Controller erlaubt dynamisches Erzeugen von Applications
aus Verzeichnis-Patterns — neues Verzeichnis unter `argocd/apps/` anlegen,
pushen, ArgoCD erzeugt automatisch eine neue Application und synct sie.

### Tailscale (VPN)

Tailscale liefert ein WireGuard-basiertes Mesh-VPN. Der Home-Server wird
zum Knoten im eigenen Tailscale-Netz — alle Services sind von jedem
Tailscale-Gerät per MagicDNS-Hostname oder Tailscale-IP erreichbar, ohne
Portfreigaben am Router.

### Traefik (Ingress-Controller)

Wird mit k3s mitgeliefert und routet HTTP/HTTPS in den Cluster. Services
werden über `Ingress`-Resourcen oder Traefiks `IngressRoute`-CRD exponiert.

### DNS (`*.homeserver` + Adblock via Pi-hole)

DNS macht **Pi-hole** als einziger Resolver (`argocd/apps/pihole/`, in k3s auf
der MetalLB-IP `192.168.178.2`). Es löst die `*.homeserver`-Wildcard autoritativ
auf (`address=/homeserver/192.168.178.127`) — so erreichst du Apps als
`grafana.homeserver`, `argocd.homeserver` etc. — und blockt netzwerkweit
Werbung/Tracker. Das frühere Host-`dnsmasq` wurde abgelöst; der Host selbst
fragt Pi-hole über die `host_dns`-Rolle (systemd-resolved → `.2`, FritzBox als
Fallback). Setup, FritzBox- und Tailscale-Schritte:
[`15-pihole.md`](15-pihole.md); die DNS-Trade-offs (SPOF):
[`09-dns-architecture.md`](09-dns-architecture.md).

### Scanner + Paperless-Pipeline

Ein Fujitsu USB-Scanner hängt direkt am Host. `scanbd` hört auf den
Hardware-Button und triggert Shell-Skripte (`scan_button.sh` →
`scan_to_pdf.sh`), die ein PDF erzeugen und auf einem CIFS-Mount der
UGREEN NAS ablegen, wo Paperless-NGX es einliest. Optional werden
Gotify-Push-Notifications aus denselben Skripten verschickt.
Vollständiges Setup: [`10-scanner.md`](10-scanner.md) und
[`11-gotify.md`](11-gotify.md).

### Monitoring-Stack (VictoriaMetrics + Grafana)

Deployt via `argocd/apps/monitoring/`. VMSingle hält 15 Tage TSDB auf
einem `local-path`-PVC, VMAgent scrapet `VMServiceScrape`/`VMPodScrape`
**und** auto-konvertierte Prometheus-`ServiceMonitor`-CRDs, Grafana
liefert vorinstallierte Dashboards (Node Exporter Full, VictoriaMetrics,
Kubernetes Views) unter `http://grafana.homeserver`.

### Sealed Secrets

Der `sealed-secrets`-Controller von Bitnami (unter
`argocd/apps/sealed-secrets/`) entschlüsselt cluster-interne
`SealedSecret`-CRDs in normale Kubernetes-`Secret`s. `kubeseal-webgui`
(`argocd/apps/kubeseal-webgui/`) ist eine kleine Browser-UI, die
Klartext-Werte mit dem Public Key des Controllers verschlüsselt —
ideal, um per-App-Secrets sicher ins GitOps-Repo zu committen.

### Semaphore (Ansible-Web-UI)

Läuft als k8s-Pod unter `argocd/apps/semaphore/`. Die Ansible-Rolle
`semaphore_bootstrap` ruft die Semaphore-REST-API auf und legt
Projects, Inventories, Repositories und Templates idempotent an —
die UI ist nach dem ersten Playbook-Run sofort einsatzbereit.

---

## Port-Übersicht

| Port  | Protokoll | Komponente      | Scope            | Zweck                                |
|-------|-----------|-----------------|------------------|--------------------------------------|
| 22    | TCP       | SSH             | LAN + Tailscale  | Server-SSH-Zugriff                   |
| 53    | UDP+TCP   | Pi-hole (.2)    | LAN + Tailscale  | DNS: `*.homeserver` + netzwerkweiter Adblock |
| 80    | TCP       | Traefik         | LAN + Tailscale  | HTTP-Ingress                         |
| 443   | TCP       | Traefik         | LAN + Tailscale  | HTTPS-Ingress                        |
| 6443  | TCP       | k3s API-Server  | LAN + Tailscale  | Kubernetes-API                       |
| 30080 | TCP       | ArgoCD NodePort | LAN + Tailscale  | ArgoCD-Web-UI (HTTP)                 |
| 30443 | TCP       | ArgoCD NodePort | LAN + Tailscale  | ArgoCD-Web-UI (HTTPS)                |
| 41641 | UDP       | Tailscale       | Internet         | WireGuard-VPN (Tailscale)            |
| 10250 | TCP       | k3s-kubelet     | Intern           | kubelet-API                          |
| 8472  | UDP       | Flannel VXLAN   | Intern           | Pod-Overlay-Netz                     |

---

## Netzwerk-Übersicht

| Netz                | CIDR              | Zweck                            |
|---------------------|-------------------|----------------------------------|
| Home-LAN            | 192.168.178.0/24  | Physikalisches Heimnetz          |
| Tailscale-Overlay   | 100.64.0.0/10     | VPN-Mesh                         |
| k3s-Pod-CIDR        | 10.42.0.0/16      | Pod-IPs                          |
| k3s-Service-CIDR    | 10.43.0.0/16      | ClusterIP-Service-Adressen       |

---

## Security-Modell

- **Keine Ports ins Internet** — Remote-Zugriff ausschließlich über Tailscale.
- **UFW-Firewall** blockt alles, was nicht explizit erlaubt ist.
- **Tailscale-ACLs** können zusätzlich pro Gerät einschränken, welche Services erreichbar sind.
- **ArgoCD** hat ausschließlich Read-Access auf das Git-Repo.
- **Ansible-Vault** verschlüsselt sensitive Werte (Tailscale-Auth-Key, SMB-Password, Vault-Password, Tokens) at rest.
