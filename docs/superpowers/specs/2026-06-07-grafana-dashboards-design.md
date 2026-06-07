# Grafana Dashboards — Design Spec

_Date: 2026-06-07_

## Ziel

Für alle Services auf Home-Server und NAS sinnvolle Grafana-Dashboards anlegen.
Alles GitOps: Dashboards als ConfigMaps in `argocd/apps/monitoring/templates/dashboards/`,
Scraper als VMPodScrape/VMServiceScrape/VMStaticScrape in `argocd/apps/monitoring/templates/`.

---

## Service-Inventar und Metriken

### Bereits gescrapte Daten (kein neuer Scraper nötig)

| Service | Scrape-Quelle | Labels |
|---|---|---|
| NAS Node Metrics | `jays-ugreen:9100` (VMStaticScrape) | `instance=ugreen-nas`, `job=node-exporter` |
| NAS Docker-Container | `jays-ugreen:18080` (VMStaticScrape cAdvisor) | `instance=ugreen-nas`, `job=cadvisor` |

### Neue Scraper erforderlich

| Service | Scrape-Art | Details |
|---|---|---|
| ArgoCD | `VMPodScrape` (Pods, nicht Services) | Ports: controller 8082, server 8083, repo-server 8084, appset-controller 8080, notifications 9001 |
| MinIO | `VMServiceScrape` | Port 9000, Pfad `/minio/v2/metrics/cluster`, Bearer-Token (SealedSecret) |
| Argo Workflows | `VMServiceScrape` | Port 2746, Pfad `/metrics` |
| Pi-hole | `ekofr/pihole-exporter` Deployment + `VMServiceScrape` | Spricht Pi-hole-API an, exponiert `/metrics` auf Port 9617 |

---

## Neue Dateien

```
argocd/apps/monitoring/templates/
├── dashboards/
│   ├── nas-node.yaml              # NAS Node Exporter Full (Grafana ID 1860, gefiltert)
│   ├── nas-docker.yaml            # NAS cAdvisor Container (Grafana ID 14282)
│   ├── argocd.yaml                # ArgoCD Operational Overview (Grafana ID 14584)
│   ├── minio.yaml                 # MinIO Dashboard (Grafana ID 13502)
│   ├── argo-workflows.yaml        # Argo Workflows (Grafana ID 17928)
│   └── pihole.yaml                # Pi-hole Exporter (Grafana ID 10176)
├── vmpodscrape-argocd.yaml        # VMPodScrape für alle ArgoCD-Pods (ns: argocd)
├── vmservicescrape-minio.yaml     # VMServiceScrape MinIO (ns: minio)
├── vmservicescrape-argo-workflows.yaml  # VMServiceScrape Argo Workflows
├── pihole-exporter.yaml           # Deployment + Service pi-hole-exporter
├── vmservicescrape-pihole.yaml    # VMServiceScrape pihole-exporter
└── sealedsecret-minio-metrics.yaml     # SealedSecret: MinIO Prometheus Bearer-Token
```

---

## Scraper-Specs

### ArgoCD — VMPodScrape

```yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMPodScrape
metadata:
  name: argocd
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames: [argocd]
  selector:
    matchExpressions:
      - key: app.kubernetes.io/part-of
        operator: In
        values: [argocd]
  podMetricsEndpoints:
    - port: metrics
      path: /metrics
```

Alle ArgoCD-Pods mit `app.kubernetes.io/part-of=argocd` exponieren einen Port namens `metrics`.

### MinIO — VMServiceScrape + Bearer-Token

MinIO-Metriken sind hinter Prometheus-Bearer-Auth. Workflow:

1. `mc admin prometheus generate local` auf dem Server → Token ausgeben
2. Als Kubernetes-Secret (SealedSecret) anlegen: `minio-metrics-token` in `monitoring`-NS
3. VMServiceScrape referenziert das Secret:

```yaml
bearerTokenSecret:
  name: minio-metrics-token
  key: token
```

### Pi-hole — Exporter Deployment

`ekofr/pihole-exporter` (ghcr.io/eko/pihole-exporter) spricht die Pi-hole v6 API an:

```
PIHOLE_HOSTNAME=pihole-web.pihole.svc.cluster.local
PIHOLE_PORT=80
PIHOLE_PASSWORD=<from SealedSecret>
PORT=9617
```

Das Pi-hole-Admin-Passwort wird aus dem bestehenden `pihole-admin`-Secret gelesen
(bereits als SealedSecret vorhanden). Der Exporter braucht nur lesenden Zugriff.

### Argo Workflows — VMServiceScrape

Argo Workflows Server exponiert `/metrics` auf Port 2746. Der Kubernetes-Service
hat keinen benannten Port → VMServiceScrape verwendet `targetPort: 2746` direkt.

---

## Dashboard-Details

| # | Dashboard | Grafana-ID | Key-Panels |
|---|---|---|---|
| 1 | NAS Node Metrics | 1860 | CPU, RAM, Disk-I/O, Netzwerk — JSON-Variable `instance` auf `ugreen-nas` vorbelegt (eigene ConfigMap, kein Duplikat des Home-Server-Dashboards) |
| 2 | NAS Docker-Container | 14282 | Container CPU/RAM/Netz per Container-Name (Paperless-NGX, OpenCode, TinyTeller, Day Pilot) |
| 3 | ArgoCD | 14584 | App-Health, Sync-Status, Controller-Queue, Reconcile-Dauer |
| 4 | MinIO | 13502 | Bucket-Größe, Request-Rate, Error-Rate, Latenz |
| 5 | Argo Workflows | 17928 | Workflow-Runs, Erfolgs-/Fehler-Rate, Laufzeit |
| 6 | Pi-hole | 10176 | DNS-Queries/s, Blocked-Rate, Top blocked Domains, aktive Clients |

Dashboard-JSON wird von grafana.com heruntergeladen und als ConfigMap mit Label
`grafana_dashboard: "1"` eingecheckt. Jedes Dashboard bekommt `datasource`-Variablen
auf `VictoriaMetrics` umgebogen (Grafana-Sidecar lädt automatisch).

---

## Abhängigkeiten

- `monitoring`-Namespace hat `namespaceSelector`-Berechtigung für VMPodScrape/VMServiceScrape
  in anderen Namespaces — bereits in der victoria-metrics-k8s-stack-Konfiguration aktiv.
- MinIO Bearer-Token: einmaliger manueller Schritt (`mc admin prometheus generate`),
  dann als SealedSecret committen.
- Pi-hole-Exporter: liest das bestehende `pihole-admin`-Secret — kein neues Secret nötig.

---

## Was NICHT gemacht wird (YAGNI)

- Dashboards für Headlamp, Semaphore, kubeseal-webgui, Homepage, Sealed-Secrets —
  keine sinnvollen Metriken jenseits der bereits vorhandenen Pod-/Node-Dashboards.
- Alerting-Rules für die neuen Dashboards — separates Feature.
- NAS-Apps (Paperless-NGX, OpenCode, TinyTeller, Day Pilot) über App-spezifische
  Endpoints — cAdvisor-Containermetriken reichen für sinnvolles Monitoring.

---

## Reihenfolge der Implementierung

1. Neue Scraper deployen (ArgoCD VMPodScrape, Argo Workflows, Pi-hole-Exporter + VMServiceScrape)
2. MinIO Bearer-Token beschaffen und als SealedSecret anlegen
3. MinIO VMServiceScrape deployen
4. Dashboard-ConfigMaps anlegen (alle 6)
5. Playwright-Test: Grafana öffnen, alle 6 Dashboards prüfen

---

## Playwright-Testplan

Nach dem Deployment:
1. `http://grafana.homeserver` öffnen, einloggen
2. Alle 6 neuen Dashboards öffnen
3. Prüfen: kein `No data`-Panel (außer MinIO bis Token bereitsteht)
4. Pi-hole: mindestens eine Query-Rate > 0
5. ArgoCD: alle Apps als Healthy gelistet
6. NAS: CPU/RAM-Werte > 0
