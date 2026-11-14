# Monitoring und Alerting

Metriken, Logs, Dashboards und Alerts für Home-Server, NAS und Cluster. Der Stack basiert auf VictoriaMetrics; Alerts landen als Push-Nachricht in der eigenen ntfy-Instanz.

| | |
|---|---|
| URL | http://grafana.homeserver (Grafana), http://ntfy.homeserver (ntfy) |
| Namespace | `monitoring`, dazu `ntfy`, `blackbox-exporter`, `smartctl-exporter` |
| Quelle | [`argocd/apps/monitoring/`](../argocd/apps/monitoring/), [`monitoring-dashboards/`](../argocd/apps/monitoring-dashboards/), [`blackbox-exporter/`](../argocd/apps/blackbox-exporter/), [`smartctl-exporter/`](../argocd/apps/smartctl-exporter/), [`ntfy/`](../argocd/apps/ntfy/) |
| Chart | `victoria-metrics-k8s-stack` (VictoriaMetrics Helm-Repo, Version in [`Chart.yaml`](../argocd/apps/monitoring/Chart.yaml)) |
| NAS | Rolle `ansible/roles/node_exporter_nas/` (`make nas`) |

## Komponenten

| Komponente | Aufgabe | Wichtige Werte |
|---|---|---|
| VMSingle | Zeitreihen-Datenbank | Retention `30d`, PVC 10Gi |
| VMAgent | scrapt alle `VMServiceScrape`/`VMPodScrape`/`VMStaticScrape`/`VMProbe` im Cluster (`selectAllByDefault`) | Intervall 30s |
| VMAlert | wertet alle `VMRule`s aus, fragt VMSingle direkt ab | Intervall 30s |
| Alertmanager | gruppiert, unterdrückt und routet Alerts | siehe unten |
| VLSingle, VLAgent | VictoriaLogs: Pod-Logs aller Container | Retention `14d`, max. 8GiB auf PVC `victorialogs-data` |
| Grafana | Dashboards, Datasources VictoriaMetrics und VictoriaLogs | Admin aus SealedSecret `grafana-admin` |
| node-exporter, kube-state-metrics | Host- und Cluster-Metriken | node-exporter mit `--collector.systemd` |
| `pihole-exporter` | Pi-hole-Statistiken | `templates/pihole-exporter.yaml` |
| blackbox-exporter | HTTP- und TCP-Probes gegen die Dienste | Ziele in [`templates/vmprobe.yaml`](../argocd/apps/blackbox-exporter/templates/vmprobe.yaml) |
| smartctl-exporter | SMART-Werte der NVMe `/dev/nvme0` | DaemonSet, privilegiert |
| NAS: node-exporter, cAdvisor | Docker-Compose auf dem NAS, Ports `9100` und `18080` | Scrape per `VMStaticScrape` in `templates/ugreen-nas-scrape.yaml` |

Die Scrape-Objekte für ArgoCD, cert-manager, Traefik, Pi-hole, KubeVirt und smartctl liegen in `argocd/apps/monitoring/templates/`. Der node-exporter des NAS liest zusätzlich Textfile-Metriken aus `/opt/node-exporter/textfile/`, darüber meldet das [Paperless-Backup](26-backup.md#paperless-backup-auf-dem-nas) seinen Status. Wie du Logs abfragst, steht in [gotchas.md](gotchas.md#logs--victorialogs).

## Regeln und Dashboards

| Was | Wo |
|---|---|
| Default-Regeln (kube-prometheus, VictoriaMetrics, VictoriaLogs) | vom `sync-job` geladen, Quellen SHA-gepinnt in `values.yaml` unter `defaultRules.sources` |
| eigene Regeln | [`templates/vmrule-homeserver.yaml`](../argocd/apps/monitoring/templates/vmrule-homeserver.yaml), Gruppen `homeserver.*` (Node, Kubernetes, ArgoCD, NAS, Pi-hole, Traefik, Dienste, KubeVirt, systemd, Blackbox, Zertifikate, Disk) |
| Default-Dashboards | vom `sync-job` geladen, `defaultDashboards.sources` |
| eigene Dashboards | ConfigMaps in [`argocd/apps/monitoring-dashboards/`](../argocd/apps/monitoring-dashboards/) (ArgoCD, Alerts, NAS-Docker, NAS-Node, Pi-hole) und `templates/dashboard-kubevirt.yaml` |

Der Grafana-Sidecar lädt jede ConfigMap mit Label `grafana_dashboard: "1"` aus allen Namespaces. Die ConfigMaps aus `monitoring-dashboards` landen im Namespace `monitoring`.

## Alert-Routing

```text
VMAlert ──▶ Alertmanager ──┬─ critical, warning ──▶ ntfy-alertmanager ──▶ ntfy ──▶ App (Push über ntfy.sh)
                           └─ info, Watchdog, InfoInhibitor ──▶ blackhole
```

- Gruppierung nach `alertname` und `namespace`, Wiederholung offener Alerts alle 12h. Ein `critical` unterdrückt `warning` und `info` mit gleichem `alertname` und `namespace`.
- `ntfy-alertmanager` (`templates/ntfy-alertmanager.yaml`) übersetzt Webhooks in ntfy-Nachrichten. Priorität: `critical` 5, `warning` 4, `info` 3. Die Konfiguration ist scfg, kein YAML.
- Server-URL und Topic stehen im SealedSecret `ntfy-alertmanager-topic`. Wie du es neu sealst, steht im Kommentar von [`sealedsecret-ntfy-alertmanager-topic.yaml`](../argocd/apps/monitoring/templates/sealedsecret-ntfy-alertmanager-topic.yaml).
- ntfy ist im LAN zusätzlich per NodePort erreichbar (`192.168.178.127:30980` HTTP, `:30981` HTTPS). Für Push-Nachrichten unterwegs nutzt es `ntfy.sh` als Upstream.

Remedy liest den Alertmanager mit, gameserver-ui fragt VMSingle direkt ab (siehe [NetworkPolicies](23-network-policies.md)).

## Betrieb

```bash
sudo kubectl -n monitoring get pods
sudo kubectl -n monitoring get vmsingle,vmagent,vmalert,vmalertmanager,vlsingle
sudo kubectl get vmrule,vmservicescrape,vmpodscrape,vmstaticscrape,vmprobe -A
sudo kubectl -n monitoring logs job/monitoring-victoria-metrics-k8s-stack-sync-job   # nur bis 10 min nach dem Sync
# aktive Alerts im Alertmanager
sudo kubectl -n monitoring port-forward svc/vmalertmanager-monitoring-victoria-metrics-k8s-stack 9093 &
curl -s localhost:9093/api/v2/alerts
```

## Fallstricke

Fallstricke zu Alerting, Grafana, VictoriaLogs, SMART und AppArmor stehen gesammelt in [gotchas.md](gotchas.md#alerting) und den folgenden Abschnitten ([Grafana](gotchas.md#grafana), [Logs](gotchas.md#logs--victorialogs), [Disk](gotchas.md#disk--smart), [AppArmor](gotchas.md#apparmor--container-signale)). Es gibt keinen Dead-Man's-Switch: Fällt der Node aus, kommt keine Meldung.
