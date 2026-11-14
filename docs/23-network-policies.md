# NetworkPolicies

Ein Teil der App-Namespaces nimmt eingehenden Traffic nur noch aus dem eigenen Namespace, von Traefik und von ausdrücklich erlaubten Namespaces an. Die übrigen Namespaces sind bewusst offen, weil eine falsch geschnittene Policy dort LAN-Dienste oder Cluster-Infrastruktur lahmlegen würde.

| | |
|---|---|
| Muster | `templates/networkpolicy.yaml` je App, Name `<app>-namespace-isolation` |
| Library-Template | `common.networkpolicy.isolation` in [`argocd/lib/common`](../argocd/lib/common/README.md) |

## Muster: Namespace-Isolation

`media` und `paperless-ai` rendern die Policy über das Library-Chart, die anderen Apps haben eine eigene Kopie mit demselben Inhalt:

```text
{{ include "common.networkpolicy.isolation" (dict "root" $ "name" "media" "namespaces" (list "monitoring" "homepage")) }}
```

Gerendert sieht das so aus (`namespaces` ergibt je einen weiteren `namespaceSelector`):

```yaml
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector: {}                # jeder Pod im selben Namespace
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system   # Traefik
```

Die Policies regeln nur `Ingress`. Ausgehender Traffic (DNS, Internet, Init-Container) bleibt offen, weil es keine Staging-Umgebung gibt und jede Änderung direkt den produktiven Single-Node-Cluster trifft. Innerhalb eines Namespace ist alles erlaubt, damit zusammenspielende Komponenten wie der VictoriaMetrics-Stack ohne Einzelregeln funktionieren. Das Label `kubernetes.io/metadata.name` setzt Kubernetes auf jedem Namespace automatisch.

## Abgedeckte Namespaces

| Namespace | Zusätzlich erlaubt | Grund |
|---|---|---|
| `gameserver-ui`, `headlamp`, `homepage`, `kubeseal-webgui`, `paperless-ai`, `semaphore` | keine | nur Traefik |
| `gotify` | `monitoring` | im Repo gibt es keinen aktuellen Aufrufer aus `monitoring` |
| `media` | `monitoring`, `homepage` | vmagent scrapt `media-api-exporter`; Homepage-Widgets rufen Seerr, Sonarr, Radarr, Prowlarr und SABnzbd per ClusterIP-DNS auf |
| `monitoring` | `homepage`, `gameserver-ui`, `remedy` | Homepage-Widget für Grafana; gameserver-ui und Remedy lesen vmsingle (`:8428`), Remedy zusätzlich den Alertmanager (`:9093`) |
| `ntfy` | `monitoring` | `ntfy-alertmanager` liefert Alerts an `ntfy.ntfy.svc.cluster.local` |
| `rps-arena` | `monitoring` | vorgehalten für späteres Scraping; app und redis sprechen über `podSelector: {}` |
| `smartctl-exporter` | nur `monitoring` | kein Traefik, kein Traffic im Namespace; vmagent ist der einzige Konsument des privilegierten Pods |

Ruft eine neue App per `<svc>.<namespace>.svc.cluster.local` in einen dieser Namespaces, muss die Policy der Ziel-App einen `namespaceSelector` für den Aufrufer bekommen. Sonst läuft die Verbindung ohne Fehlermeldung in einen Timeout. Bestehende Aufrufer findest du mit `grep -rn "svc.cluster.local" argocd/apps/`.

## Eigene Policies außerhalb des Musters

| Namespace | Policy | Regel |
|---|---|---|
| `ha-mcp` | `ha-mcp-ingress` | nur Traefik, nur auf den Container-Port; der geheime URL-Pfad ist die einzige Authentifizierung |
| `home-assistant` | `home-assistant-ingress` | Port 8123 nur aus `kube-system` und `ha-mcp` |
| `mosquitto` | `mosquitto-broker` | nur Port `mqtt` (TCP), aus jeder Quelle, weil das Nuki-Schloss über die MetalLB-IP `192.168.178.4` aus dem LAN kommt |
| `remedy` | aus dem Remedy-Chart (`networkPolicy` in `values.yaml`) plus `remedy-postgres-backup-egress` | einziger Namespace mit Egress-Regeln: API-Server, NAS-SSH, Alertmanager, vmsingle; Details in [Remedy](24-remedy.md) |

## Bewusst ausgenommen

`pihole` und `jellyfin` bekommen Traffic über dedizierte MetalLB-LAN-IPs (`192.168.178.2`, `192.168.178.3`), Jellyfin zusätzlich über einen Klipper-hostPort für Tailscale. Solcher Traffic kommt je nach `externalTrafficPolicy` mit Node- oder Client-IP an und passt auf keinen `podSelector` oder `namespaceSelector`. Eine Absicherung bräuchte getestete `ipBlock`-Regeln für `local_subnet` und `100.64.0.0/10`, bei Jellyfin zusätzlich eine Ausnahme für `media`.

Die Infrastruktur-Namespaces bleiben ebenfalls offen:

| Namespace | Grund |
|---|---|
| `metallb` | Speaker-Pods sprechen per Memberlist direkt miteinander; eine Störung trifft alle LoadBalancer-IPs |
| `sealed-secrets` | der API-Server muss den Controller erreichen, sonst lassen sich keine SealedSecrets mehr entschlüsseln |
| `kubevirt`, `gameserver` | Webhooks von virt-api und Pod-zu-Pod-Verkehr zwischen virt-handler, virt-controller und virt-launcher |
| `csi-driver-smb` | Kommunikation läuft vor allem über Unix-Sockets und hostPath |
| `argocd`, `kube-system`, `cert-manager`, `blackbox-exporter` | nicht angefasst |
| `monitoring-dashboards` | die App legt nur ConfigMaps in `monitoring` an, keine Pods |

Weitere Hinweise stehen in [gotchas.md](gotchas.md#networkpolicies).

## Betrieb

```bash
sudo kubectl get networkpolicy -A
```

Nach einer Änderung an einer Policy die Homepage-Widgets und die Grafana-Dashboards prüfen: Zeigen sie keine Daten mehr, fehlt eine Allow-Regel.
