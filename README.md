<p align="center">
  <img src="docs/assets/banner.svg" alt="home-server — GitOps Home Lab on k3s, ArgoCD, Tailscale" width="100%" />
</p>

<p align="center">
  <a href="https://ubuntu.com/server"><img alt="Ubuntu" src="https://img.shields.io/badge/Ubuntu-26.04_LTS-E95420?style=for-the-badge&logo=ubuntu&logoColor=white"></a>
  <a href="https://k3s.io"><img alt="k3s" src="https://img.shields.io/badge/k3s-v1.29-FFC61C?style=for-the-badge&logo=k3s&logoColor=black"></a>
  <a href="https://argo-cd.readthedocs.io"><img alt="ArgoCD" src="https://img.shields.io/badge/ArgoCD-GitOps-EF7B4D?style=for-the-badge&logo=argo&logoColor=white"></a>
  <a href="https://tailscale.com"><img alt="Tailscale" src="https://img.shields.io/badge/Tailscale-VPN-246FDB?style=for-the-badge&logo=tailscale&logoColor=white"></a>
  <a href="https://www.ansible.com"><img alt="Ansible" src="https://img.shields.io/badge/Ansible-IaC-EE0000?style=for-the-badge&logo=ansible&logoColor=white"></a>
</p>

<p align="center">
  <b>Vollständig automatisierter, GitOps-getriebener Home-Server auf einer einzigen Maschine.</b><br/>
  Ein einziger Ansible-Run liefert einen gehärteten Ubuntu-Host, einen schlanken Kubernetes-Cluster (<a href="https://k3s.io">k3s</a>), Continuous Delivery aus Git (<a href="https://argo-cd.readthedocs.io">ArgoCD</a>) und Zero-Config-Remote-Access (<a href="https://tailscale.com">Tailscale</a>).
</p>

---

## TL;DR

```bash
# 1) Repo klonen
git clone https://github.com/Jaydee94/home-server.git && cd home-server

# 2) Eigene Details eintragen (Server-IP, Repo-URL, Tailscale-Key)
$EDITOR ansible/inventory/hosts.yml
$EDITOR ansible/group_vars/all.yml

# 3) Collections installieren und Playbook laufen lassen
make install   # oder: ansible-galaxy collection install -r ansible/requirements.yml \
               #       && ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

Am Ende druckt das Playbook die ArgoCD-URL und das Admin-Passwort. Fertig.

---

## Was du bekommst

| Schicht          | Komponente                             | Hinweis                                                                |
|------------------|----------------------------------------|------------------------------------------------------------------------|
| Betriebssystem   | **Ubuntu Server 26.04 LTS**            | Gehärtet, UFW-Firewall, NTP-synced, Swap off                           |
| Kubernetes       | **k3s** (latest stable channel)        | Single-Node, bundelt Traefik, CoreDNS, local-path, metrics-server      |
| GitOps           | **ArgoCD** + ApplicationSets           | Verzeichnis unter `argocd/apps/` anlegen, pushen, deployt              |
| Split-DNS        | **dnsmasq** auf `tailscale0` + LAN     | `*.homeserver` aus LAN und Tailnet auflösbar — kein öffentliches DNS   |
| Web-Ansible      | **Semaphore UI**                       | Ein-Klick-`git pull && ansible-playbook` gegen das eigene LAN          |
| Monitoring       | **VictoriaMetrics + Grafana**          | Single-Node TSDB, vmagent, vmalert, Alertmanager, Dashboards           |
| Kubernetes-UI    | **Headlamp**                           | Browser-Dashboard für den Cluster                                      |
| Secrets          | **Sealed Secrets + kubeseal-webgui**   | Verschlüsselte Secrets in Git, nur im Cluster entschlüsselbar          |
| Dokumenten-Scan  | **scanbd + Fujitsu USB-Scanner**       | Bare-Metal-Scan-Daemon → CIFS → Paperless-NGX auf der NAS              |
| Notifications    | **Gotify**                             | Self-hosted Push-Notifications (Android/iOS-Client)                    |
| Remote-Access    | **Tailscale**                          | WireGuard-Mesh-VPN — keine Portfreigaben, keine öffentliche IP         |
| CI/CD intern     | **Argo Workflows + MinIO**             | Private CI/CD-Pipeline + S3-Artifact-Store im Cluster                 |
| Ingress          | **Traefik v2** (mit k3s gebundled)     | HTTP/HTTPS-Routing in den Cluster                                      |
| Provisioning     | **Ansible** (≥ 2.14)                   | Vollständig idempotent, Role-per-Concern, Vault für Secrets            |

Ziel-Hardware: kleine Box mit ≥ 4 GB RAM und ≥ 20 GB Disk. Referenz-Build: Intel i5, 32 GB RAM, 512 GB NVMe.

### Immer aktuell

`auto_upgrade: true` (Default) hält bei jedem Playbook-Run den gesamten Stack aktuell:

- **APT-Pakete** — `apt dist-upgrade` bei jedem Run, plus `unattended-upgrades` für tägliche Sicherheits-Patches im Hintergrund.
- **Tailscale** — `state: latest` für das `tailscale`-Paket.
- **k3s** — folgt `k3s_channel` (Default `stable`), der Upstream-Installer zieht jeweils den neuesten Release. Pin via `k3s_version`.
- **Helm** — Re-Run des offiziellen Installers ersetzt das Binary, wenn ein neuerer Helm-3-Release existiert.
- **ArgoCD** — `helm upgrade --install` ohne `--version` zieht das neueste Chart. Pin via `argocd_version`.
- **Reboot-if-required** — wenn APT `/var/run/reboot-required` setzt, rebootet das Playbook den Host und wartet, bis er wieder oben ist (Toggle via `auto_reboot_if_required`).

Für reproduzierbare Builds `auto_upgrade: false` in `ansible/group_vars/all.yml` setzen.

---

## Quickstart (5 Schritte)

> Erstmalig auf der Maschine? Start mit **[Ubuntu-Server-Installation](docs/00-ubuntu-server-install.md)**.
> Komplette Voraussetzungen unter **[docs/02-prerequisites.md](docs/02-prerequisites.md)**.

**1. Repo klonen**

```bash
git clone https://github.com/Jaydee94/home-server.git
cd home-server
```

**2. Inventory auf den eigenen Server zeigen lassen**

```bash
$EDITOR ansible/inventory/hosts.yml
# ansible_host (Server-IP) und ggf. ansible_ssh_private_key_file anpassen.
```

**3. Variablen setzen**

```bash
$EDITOR ansible/group_vars/all.yml
# Pflicht: argocd_repo_url, local_subnet, timezone.
# Tailscale-Key muss vault-encrypted sein (nächster Schritt).
```

**4. Tailscale-Auth-Key verschlüsseln**

```bash
ansible-vault encrypt_string 'tskey-auth-DEIN_KEY' --name 'tailscale_auth_key'
# Den !vault-Block in all.yml über den bestehenden tailscale_auth_key-Wert pasten.
```

**5. Playbook ausführen**

```bash
make install
# oder ohne make:
ansible-galaxy collection install -r ansible/requirements.yml
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

Am Ende druckt das Playbook:

```
ArgoCD UI:  http://<server-ip>:30080
Username:   admin
Password:   <auto-generiert>
```

---

## Repository-Layout

```
home-server/
├── README.md
├── Makefile                          # Convenience-Targets: install, lint, ping, check, …
├── docs/
│   ├── 00-ubuntu-server-install.md   # Bare-Metal-Ubuntu-Installation
│   ├── 01-overview.md                # Architektur-Diagramme
│   ├── 02-prerequisites.md           # Voraussetzungen & Pre-flight
│   ├── 03-installation.md            # Step-by-Step-Setup
│   ├── 04-k3s.md                     # k3s + kubectl-Referenz
│   ├── 05-argocd.md                  # GitOps-Nutzung
│   ├── 06-tailscale.md               # VPN-Setup
│   ├── 07-troubleshooting.md         # Häufige Probleme
│   ├── 08-semaphore.md               # Semaphore-Web-UI für Ansible
│   ├── 09-dns-architecture.md        # Split-DNS-Design & Ausfallsicherheit
│   ├── 10-scanner.md                 # Fujitsu-Scanner + scanbd + Paperless
│   ├── 11-gotify.md                  # Push-Notifications via Gotify
│   ├── 12-paperless-ai.md            # KI-Dokumentenanalyse für Paperless-NGX
│   ├── 13-argo-workflows.md          # Private CI/CD mit Argo Workflows + MinIO
│   └── assets/banner.svg
├── ansible/
│   ├── site.yml                      # Entry-Point
│   ├── requirements.yml              # Galaxy-Collections
│   ├── ansible.cfg                   # Defaults
│   ├── inventory/hosts.yml           # Eigener Server (+ semaphore_targets)
│   ├── group_vars/all.yml            # Alle Knobs (vault-verschlüsselte Secrets)
│   └── roles/
│       ├── common/                   # Base-OS, Firewall, Pakete
│       ├── dnsmasq/                  # Split-DNS für *.homeserver
│       ├── tailscale/                # VPN (WireGuard-Mesh)
│       ├── k3s/                      # Single-Node-Kubernetes + Helm
│       ├── argocd/                   # GitOps-Controller via Helm
│       ├── scanner/                  # Fujitsu-USB-Scanner + scanbd + SMB
│       ├── semaphore_secrets/        # Bootstrap-Secret für den Semaphore-Pod
│       ├── semaphore_targets/        # SSH-Pubkey auf Managed-Hosts pushen
│       └── semaphore_bootstrap/      # Projects/Inventories/Templates per API
└── argocd/
    ├── bootstrap/root-applicationset.yaml  # Erkennt jedes Verzeichnis darunter
    └── apps/                               # Ein Ordner pro ArgoCD-Application
        ├── example-whoami/                 # Referenz-Helm-Chart
        ├── gotify/                         # Push-Notifications
        ├── headlamp/                       # Kubernetes-Web-Dashboard
        ├── kubeseal-webgui/                # Sealed-Secrets-Verschlüsselungs-UI
        ├── monitoring/                     # VictoriaMetrics + Grafana
        ├── argo-workflows/                 # Private CI/CD-Pipeline (Argo Workflows)
        ├── minio/                          # S3-Artifact-Store für Argo Workflows
        ├── paperless-ai/                   # KI-Dokumentenanalyse für Paperless-NGX
        ├── sealed-secrets/                 # SealedSecrets-Controller
        └── semaphore/                      # Ansible-Web-UI
```

---

## Monitoring

Ein schlanker VictoriaMetrics-+-Grafana-Stack lebt unter
`argocd/apps/monitoring/` und wird automatisch von ArgoCD ausgerollt.

- **TSDB:** VMSingle (15 Tage Retention, 10 Gi `local-path`-PVC).
- **Scrapers:** VMAgent scrapet alle `VMServiceScrape`/`VMPodScrape` und
  zusätzlich Prometheus-`ServiceMonitor`-CRDs (vom Operator auto-konvertiert).
- **Host-Metriken:** `prometheus-node-exporter` als DaemonSet auf dem Ubuntu-Host.
- **Cluster-Metriken:** kubelet/cAdvisor, kube-apiserver, kube-state-metrics, CoreDNS.
  Scheduler/Controller-Manager/etcd-Scrapes sind deaktiviert — k3s vereint sie in einem Prozess.
- **Alerts:** Default-kube-prometheus-Rules, geroutet auf einen `blackhole`-Receiver,
  bis Discord/Slack/Gotify in `values.yaml` verdrahtet ist.
- **Dashboards:** Node Exporter Full, VictoriaMetrics + Kubernetes „Views / Global, Namespaces, Nodes, Pods" von grafana.com.

Grafana öffnen unter **http://grafana.homeserver** (LAN + Tailnet via dnsmasq).
User `admin`, Passwort aus dem auto-generierten Secret:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

---

## Application hinzufügen (der GitOps-Weg)

```bash
mkdir -p argocd/apps/my-app
# Plain Kubernetes-YAML, kustomization.yaml oder ein Helm-Chart hineinlegen.
git add argocd/apps/my-app && git commit -m "feat(apps): add my-app" && git push
```

Innerhalb von ~3 Minuten erkennt ArgoCD das neue Verzeichnis, erstellt eine
`Application` namens `my-app` im Namespace `my-app` und synct sie.
Details: **[docs/05-argocd.md](docs/05-argocd.md)**.

---

## Networking & Security

- **Keine öffentlichen Ports.** Internet-Zugriff geht ausschließlich über Tailscale.
- **UFW** erlaubt nur, was der Stack braucht: SSH, HTTP/HTTPS, k3s-API, ArgoCD-NodePort, kubelet, Flannel VXLAN, Tailscale-UDP, plus volles Trust für LAN, Tailnet, Pod- und Service-CIDRs.
- **Ansible-Vault** verschlüsselt sensitive Secrets at rest.
- **ArgoCD** hat ausschließlich Read-Access auf das Git-Repo.

| Port  | Protokoll | Scope             | Zweck                                  |
|-------|-----------|-------------------|----------------------------------------|
| 22    | TCP       | LAN + Tailnet     | SSH                                    |
| 53    | UDP+TCP   | LAN + Tailnet     | dnsmasq Split-DNS für `*.homeserver`   |
| 80    | TCP       | LAN + Tailnet     | Traefik HTTP                           |
| 443   | TCP       | LAN + Tailnet     | Traefik HTTPS                          |
| 6443  | TCP       | LAN + Tailnet     | k3s-API                                |
| 30080 | TCP       | LAN + Tailnet     | ArgoCD-UI (HTTP)                       |
| 30443 | TCP       | LAN + Tailnet     | ArgoCD-UI (HTTPS)                      |
| 41641 | UDP       | Internet          | Tailscale-WireGuard                    |

Vollständige Architektur in **[docs/01-overview.md](docs/01-overview.md)**.

---

## Dokumentation

| Doc                                                             | Inhalt                                       |
|-----------------------------------------------------------------|----------------------------------------------|
| [Ubuntu-Server-Installation](docs/00-ubuntu-server-install.md)  | ISO, USB-Stick, Installer, erster Boot       |
| [Architektur-Überblick](docs/01-overview.md)                    | Komponenten und Traffic-Flows                |
| [Voraussetzungen](docs/02-prerequisites.md)                     | Was vor dem Ansible-Run nötig ist            |
| [Installationsleitfaden](docs/03-installation.md)               | Vollständiger Step-by-Step-Walkthrough       |
| [k3s-Referenz](docs/04-k3s.md)                                  | Config, kubectl-Cheatsheet, Upgrades         |
| [ArgoCD-GitOps](docs/05-argocd.md)                              | App-Workflow, CLI, Sync-Policies             |
| [Tailscale-VPN](docs/06-tailscale.md)                           | Auth-Keys, MagicDNS, Subnet-Routes           |
| [Troubleshooting](docs/07-troubleshooting.md)                   | Diagnose-Playbook für häufige Probleme       |
| [Semaphore-UI](docs/08-semaphore.md)                            | Web-UI zum Ausführen von Playbooks           |
| [DNS-Architektur](docs/09-dns-architecture.md)                  | Warum der Home-Server NICHT dein LAN-DNS ist |
| [Scanner & Paperless](docs/10-scanner.md)                       | Fujitsu-USB-Scanner → CIFS → Paperless-NGX   |
| [Gotify-Push](docs/11-gotify.md)                                | Self-hosted Push-Notifications aus dem Stack |
| [Paperless-AI](docs/12-paperless-ai.md)                         | KI-Dokumentenanalyse + RAG für Paperless-NGX |
| [Argo Workflows](docs/13-argo-workflows.md)                     | Private CI/CD-Pipeline mit MinIO-Artifact-Store |

---

## Lizenz

MIT — siehe [LICENSE](LICENSE).
