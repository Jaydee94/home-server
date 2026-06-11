# KubeVirt VM Monitoring — Design-Spec

- **Datum:** 2026-06-11
- **Branch:** `feat/kubevirt-monitoring`
- **Status:** Design abgestimmt, bereit für Implementierungsplan

## Ziel

KubeVirt-VMs (konkret: `7dtd-server`) vollständig in das bestehende Monitoring integrieren:
CPU/RAM/Netz/Disk-Metriken in VictoriaMetrics sichtbar machen, ein Community-Grafana-Dashboard
deployen und die CPU/RAM-Kacheln der Gameserver-UI mit echten Werten befüllen.

## Ist-Zustand

- VictoriaMetrics k8s Stack läuft in `monitoring/` (VMAgent, VMSingle, Grafana)
- `kubevirt-prometheus-metrics` Service existiert im `kubevirt`-Namespace (port 443, TLS,
  Label `prometheus.kubevirt.io: "true"`) — wird von virt-handler/virt-controller/virt-api bedient
- **Kein VMServiceScrape** für diesen Service → keine `kubevirt_vmi_*`-Metriken in VictoriaMetrics
- `api/metrics/route.ts` in gameserver-ui fragt `container_cpu_usage_seconds_total` /
  `container_memory_working_set_bytes` ab — beide Metriken existieren für virt-launcher-Pods
  nicht in VictoriaMetrics → CPU/RAM-Tiles zeigen `—`

## Leitentscheidungen

| Thema | Entscheidung |
|---|---|
| Wo Scraping-Config | `argocd/apps/monitoring/templates/` — folgt bestehendem Muster (vmservicescrape-pihole, vmservicescrape-minio, …) |
| TLS-Handling | `insecureSkipVerify: true` — KubeVirt nutzt selbst-signierte Certs; kein CA-Bundle nötig |
| Dashboard | Community-Dashboard von grafana.com (ID 11482) als ConfigMap, Grafana-Sidecar picked es automatisch auf |
| Metrik-Quelle | `kubevirt_vmi_*` aus virt-handler — echte VM-Auslastung statt Container-Metriken |
| Parametrisierung | VM-Name (`7dtd-server`) kommt aus bestehendem `VM_NAME` Env-Var, kein Hardcoding |

## Neue Dateien

### 1. `argocd/apps/monitoring/templates/vmservicescrape-kubevirt.yaml`

VMServiceScrape, der den `kubevirt-prometheus-metrics` Service in `kubevirt/` scrapt:

```yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMServiceScrape
metadata:
  name: kubevirt
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames: [kubevirt]
  selector:
    matchLabels:
      prometheus.kubevirt.io: "true"
  endpoints:
    - port: metrics
      scheme: https
      tlsConfig:
        insecureSkipVerify: true
      honorLabels: true
```

VMAgent greift damit auf virt-handler (VMI-Metriken), virt-controller und virt-api zu.

**Metriken danach verfügbar:**
- `kubevirt_vmi_cpu_usage_seconds_total{name="7dtd-server"}` — CPU-Seconds (Counter)
- `kubevirt_vmi_memory_resident_bytes{name="7dtd-server"}` — tatsächlicher RAM (Gauge)
- `kubevirt_vmi_network_receive_bytes_total` / `_transmit_bytes_total`
- `kubevirt_vmi_storage_read_traffic_bytes_total` / `_write_traffic_bytes_total`
- `kubevirt_vmi_info` — VM-Metadaten (Labels: name, namespace, node, os, …)

### 2. `argocd/apps/monitoring/templates/dashboard-kubevirt.yaml`

ConfigMap mit dem KubeVirt-Community-Dashboard-JSON (grafana.com ID 11482).
Label `grafana_dashboard: "1"` → Grafana-Sidecar picked es automatisch auf (kein Grafana-Neustart).

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-kubevirt
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  kubevirt-overview.json: |
    <Dashboard-JSON von grafana.com/api/dashboards/11482>
```

## Geänderte Dateien

### 3. `apps/gameserver-ui/src/app/api/metrics/route.ts`

Beide Queries auf `kubevirt_vmi_*` umstellen:

| Field | Vorher | Nachher |
|---|---|---|
| CPU | `rate(container_cpu_usage_seconds_total{namespace="${ns}",pod=~"virt-launcher-${vm}.*"}[5m])*100` | `rate(kubevirt_vmi_cpu_usage_seconds_total{name="${vm}"}[5m])*100` |
| RAM | `container_memory_working_set_bytes{namespace="${ns}",pod=~"virt-launcher-${vm}.*"}` | `kubevirt_vmi_memory_resident_bytes{name="${vm}"}` |

`ns`-Variable wird nicht mehr benötigt (KubeVirt-Metriken haben keinen `namespace`-Label auf dem VMI-Level).

## Deployment-Ablauf

1. Branch `feat/kubevirt-monitoring` anlegen
2. Drei Dateien ändern/erstellen, committen
3. PR erstellen → CI (yamllint + helm lint) muss grün sein
4. Merge → ArgoCD auto-sync (~3 min) → VMAgent beginnt KubeVirt zu scrapen
5. In VictoriaMetrics prüfen: `kubevirt_vmi_cpu_usage_seconds_total` sichtbar
6. Grafana → neues Dashboard „KubeVirt / Overview" erscheint automatisch
7. Gameserver-UI Dashboard → CPU/RAM-Tiles zeigen echte Werte

## Bewusst NICHT im Scope

- Alert-Rules für VM down / RAM > X% (separates Ticket wenn gewünscht)
- Dashboards für virt-controller / virt-api Internals
- TLS-Zertifikat-Validierung für KubeVirt-Metrics-Endpoint (insecureSkipVerify bleibt)
- Monitoring anderer VMs (nur `7dtd-server` ist vorhanden)

## Test-Strategie

- `vmservicescrape-kubevirt.yaml` — kein Unit-Test möglich; Verifikation per PromQL-Query
  gegen VictoriaMetrics nach Sync: `kubevirt_vmi_cpu_usage_seconds_total{name="7dtd-server"}`
  muss Ergebnisse liefern
- `api/metrics/route.ts` — bestehende Route-Tests prüfen weiterhin Fehlerbehandlung;
  Query-Strings sind Strings (kein eigener Test-Mehrwert)
- End-to-End: Playwright-Screenshot des Dashboards nach Deployment — CPU/RAM zeigen Zahlen statt `—`

## Quellen

- KubeVirt Monitoring Docs: https://kubevirt.io/user-guide/observability/metrics/
- VictoriaMetrics VMServiceScrape CRD: https://docs.victoriametrics.com/operator/api/#vmservicescrape
- Grafana Community Dashboard KubeVirt: https://grafana.com/grafana/dashboards/11482
