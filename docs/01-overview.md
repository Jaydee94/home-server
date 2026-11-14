# Architektur

Ein einzelner Ubuntu-Host betreibt einen Single-Node-k3s-Cluster. Ansible richtet den Host ein, ArgoCD rollt alles unter `argocd/apps/` aus dem Branch `main` aus, und von außen ist der Server nur über Tailscale erreichbar.

```text
Laptop/Phone ── Tailscale (WireGuard, 100.64.0.0/10) ──┐
LAN-Clients (192.168.178.0/24) ────────────────────────┤
                                                       ▼
homeserver 192.168.178.127 (Ubuntu Server 26.04 LTS)
├── Host: UFW, tailscaled (Subnet-Router), chrony, systemd-resolved → Pi-hole,
│         scanbd (USB-Scanner), restic-Timer
└── k3s (Single-Node)
    ├── Traefik :80/:443 ── Ingress *.homeserver ── App-Services
    ├── MetalLB L2: .2 Pi-hole DNS, .3 Jellyfin, .4 Mosquitto
    ├── ArgoCD :30080 ── ApplicationSet ── argocd/apps/* ◄── git pull ── GitHub (main)
    └── CoreDNS, local-path-provisioner (NVMe), metrics-server

UGREEN NAS 192.168.178.118 (SMB): Paperless-consume, Medien, Backup-Repo
```

## Komponenten

| Komponente | Rolle im Setup | Doku |
|---|---|---|
| Ubuntu Server 26.04 LTS | Host, eingerichtet von den Ansible-Rollen in [`site.yml`](../ansible/site.yml) | [Installation](03-installation.md) |
| k3s | Kubernetes mit gebündeltem Traefik v3, CoreDNS, local-path-provisioner, metrics-server und Klipper-ServiceLB | [k3s](04-k3s.md) |
| ArgoCD | GitOps-Controller, ein `ApplicationSet` erzeugt pro Verzeichnis unter `argocd/apps/` eine Application im gleichnamigen Namespace | [ArgoCD](05-argocd.md) |
| Tailscale | VPN ohne offene Router-Ports, der Host gibt das LAN als Subnet-Route frei | [Tailscale](06-tailscale.md) |
| MetalLB | feste LAN-IPs für Dienste, die nicht über Traefik laufen | [Pi-hole](15-pihole.md) |
| Pi-hole | einziger DNS-Resolver im LAN und Tailnet, Wildcard `*.homeserver`, Adblock | [Pi-hole](15-pihole.md) |
| cert-manager | eigene CA und ein Default-Zertifikat für alle `*.homeserver`-Ingresses | [Gotchas](gotchas.md#tls--https) |
| VictoriaMetrics, Grafana, ntfy | Metriken, Logs, Dashboards und Alerting | [Monitoring](13-monitoring.md) |
| Semaphore | Web-UI für Ansible-Läufe, täglicher Lauf von `site.yml` | [Semaphore](08-semaphore.md) |
| restic | nächtliches Backup von Datastore, Sealed-Secrets-Keys und Volumes auf die NAS | [Backup](26-backup.md) |

## Apps unter `argocd/apps/`

| App | Zweck |
|---|---|
| `blackbox-exporter` | HTTP-Probes auf die Dienste |
| `cert-manager` | TLS mit lokaler CA |
| `csi-driver-smb` | SMB-Volumes von der NAS für Pods |
| `gameserver` | 7 Days to Die als KubeVirt-VM ([Gameserver](19-gameserver.md)) |
| `gameserver-ui` | Web-UI für den Gameserver ([Gameserver-UI](20-gameserver-ui.md)) |
| `gotify` | Push-Benachrichtigungen, unter anderem vom Scanner ([Gotify](11-gotify.md)) |
| `ha-mcp` | MCP-Server für Home Assistant ([HA-MCP](22-ha-mcp.md)) |
| `headlamp` | Kubernetes-Web-UI |
| `home-assistant` | Hausautomation ([Home Assistant](17-homeassistant.md)) |
| `homepage` | Startseite `home.homeserver` ([Homepage](14-homepage.md)) |
| `jellyfin` | Medienserver mit Quick-Sync-Transcoding ([Jellyfin](16-jellyfin.md)) |
| `kubeseal-webgui` | Browser-UI zum Verschlüsseln von Sealed Secrets |
| `kubevirt` | KubeVirt-Operator und CDI für VMs |
| `media` | Prowlarr, SABnzbd, Sonarr, Radarr, Seerr ([Media-Stack](21-media-stack.md)) |
| `metallb` | LoadBalancer im L2-Modus |
| `monitoring` | VictoriaMetrics-Stack mit Grafana ([Monitoring](13-monitoring.md)) |
| `monitoring-dashboards` | zusätzliche Grafana-Dashboards (ArgoCD, Pi-hole, NAS, Alerts) |
| `mosquitto` | MQTT-Broker für das Nuki-Schloss ([Nuki/MQTT](18-nuki-mqtt.md)) |
| `ntfy` | Push-Server für Alerts |
| `paperless-ai` | KI-Tagging für Paperless-NGX ([Paperless-AI](12-paperless-ai.md)) |
| `pihole` | DNS und Adblock ([Pi-hole](15-pihole.md)) |
| `remedy` | KI-Operator für das Homelab ([Remedy](24-remedy.md)) |
| `rps-arena` | Browser-Spiel ([RPS-Arena](25-rps-arena.md)) |
| `sealed-secrets` | Controller, der `SealedSecret`s entschlüsselt |
| `semaphore` | Ansible-Web-UI ([Semaphore](08-semaphore.md)) |
| `smartctl-exporter` | SMART-/NVMe-Metriken der Host-Disk |

## Anfragen und DNS

Die FritzBox verteilt per DHCP `192.168.178.2` als DNS-Server, Tailnet-Geräte bekommen dieselbe Adresse über die Tailscale-DNS-Einstellungen und die Subnet-Route. Pi-hole beantwortet jede Anfrage für `*.homeserver` mit `192.168.178.127`. Dort nimmt Traefik auf Port 80 und 443 an, wählt den Ingress nach Hostname und leitet an den Service der App weiter. HTTPS nutzt das Default-Zertifikat von cert-manager.

Jellyfin (`.3`) und Mosquitto (`.4`) haben eigene MetalLB-IPs, weil LAN-Geräte ohne Tailscale (Smart-TV, Nuki) sie direkt ansprechen. ArgoCD und RPS-Arena laufen zusätzlich als NodePort auf der Host-IP. Die Port-Freigaben stehen im [README](../README.md#netzwerk-und-sicherheit), das DNS-Setup samt Ausfallverhalten in [Pi-hole](15-pihole.md).

## Netze und IPs

| Adresse | Zweck |
|---|---|
| `192.168.178.0/24` | Heimnetz (`local_subnet`), Gateway `192.168.178.1` |
| `192.168.178.2` | Pi-hole DNS (MetalLB-Pool `pihole-dns`) |
| `192.168.178.3` | Jellyfin (MetalLB-Pool `jellyfin`) |
| `192.168.178.4` | Mosquitto MQTT `:1883` (MetalLB-Pool `mosquitto`) |
| `192.168.178.118` | UGREEN NAS `jays-ugreen` |
| `192.168.178.127` | Home-Server, Traefik, NodePorts |
| `100.64.0.0/10` | Tailnet (`tailscale_cidr`) |
| `10.42.0.0/16` | k3s-Pods (`k3s_pod_cidr`) |
| `10.43.0.0/16` | k3s-Services (`k3s_service_cidr`) |

Alle MetalLB-Pools haben `autoAssign: false`. Eine IP bekommt nur ein Service, der sie ausdrücklich anfordert. Die Pools liegen in [`argocd/apps/metallb/templates/`](../argocd/apps/metallb/templates/).

## Sicherheit

Am Router ist kein Port freigegeben. UFW erlaubt 80, 443 und UDP 41641 von überall, alles Weitere nur aus LAN, Tailnet und den k3s-Netzen. NodePorts und Traefik laufen an UFW vorbei ([Gotchas](gotchas.md#host-hardening-common-rolle)). SSH akzeptiert nur Keys. Host-Secrets liegen als Ansible-Vault-Werte in [`all.yml`](../ansible/group_vars/all.yml), Cluster-Secrets als `SealedSecret` im Repo, und ArgoCD liest das Repo nur.
