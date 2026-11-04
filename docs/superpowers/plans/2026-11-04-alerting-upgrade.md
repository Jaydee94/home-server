# Alerting Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schließe kritische Alert-Lücken (systemd, KubeVirt, Netzwerk, HTTP-Verfügbarkeit), ersetze Gotify durch ntfy.sh (kein VPN nötig), und füge ein Grafana-Dashboard für aktive Alerts hinzu.

**Architecture:** Vier unabhängige Änderungen im bestehenden VictoriaMetrics-Stack: (1) neue VMRules in der bestehenden Datei, (2) Alertmanager-Konfiguration auf ntfy.sh webhook umstellen + Gotify-Bridge entfernen, (3) neuer Blackbox-Exporter als ArgoCD-App mit VMProbe, (4) neues Grafana-Dashboard als ConfigMap.

**Tech Stack:** VictoriaMetrics k8s-Stack, VMRule CRD, VMProbe CRD, prometheus-community/prometheus-blackbox-exporter Helm, ArgoCD, SealedSecrets, Grafana

**Spec:** `docs/superpowers/specs/2026-11-04-alerting-upgrade-design.md`

## Global Constraints

- Alle Ressourcen im Namespace `monitoring`, außer der Blackbox-Exporter (auch `monitoring`)
- Helm-Umbrella-Chart-Pattern: jede App hat `Chart.yaml` + `values.yaml` + `templates/`
- Secrets ausschließlich als SealedSecrets – kein Klartext im Repo
- Alertmanager-Config lebt in `argocd/apps/monitoring/values.yaml` unter `victoria-metrics-k8s-stack.alertmanager.config`
- ntfy-Topic-Name liegt in ConfigMap `ntfy-alertmanager-config` (kein SealedSecret – kein persönliches Credential)
- Renovate-Pin: neue Helm-Chart-Abhängigkeiten brauchen `# renovate: datasource=helm` Kommentar
- Linting: `make lint` muss nach jeder Änderung grün bleiben

## Review Focus

- **Alertmanager inhibit_rules nach Migration prüfen** – Die bestehenden `inhibit_rules` müssen in die neue Config übernommen werden; fehlen sie, können info/warning-Alerts nicht mehr unterdrückt werden. → Task 2, Schritt 3.
- **node_systemd_unit_state Cardinality** – Ohne metric_relabel_configs der alle States außer `failed` dropped, explodiert die Cardinality. → Task 1, Schritt 2.
- **HostNetworkInterfaceDown Interface-Regex** – Ohne korrekte Exclusions (veth, cni, flannel, tunl, cali, dummy) feuert der Alert bei jedem k3s-internen Interface. → Task 1, Schritt 1.
- **Blackbox-Probe erreichbar** – VMAgent muss den Blackbox-Exporter-Pod im selben Namespace (monitoring) scrapen können; die bestehende NetworkPolicy erlaubt intra-namespace traffic, daher kein extra Policy nötig – aber muss verifiziert werden. → Task 3, Schritt 5.
- **ntfy send_resolved** – Wenn `send_resolved: true` fehlt, kommen keine "Resolved"-Notifications. → Task 2, Schritt 3.

---

### Task 1: Neue VMRules + systemd-Collector aktivieren

**Files:**
- Modify: `argocd/apps/monitoring/templates/vmrule-homeserver.yaml`
- Modify: `argocd/apps/monitoring/values.yaml` (node-exporter extraArgs + Volumes)

**Interfaces:**
- Produces: Metriken `node_systemd_unit_state`, `kubevirt_vmi_phase_count`, `node_network_up`, `kube_pod_status_unschedulable` als Alert-Quellen (alle bereits im TSDB, bis auf systemd)

- [ ] **Schritt 1: VMRules für HostNetworkInterfaceDown, KubeVirtVMNotRunning, PodUnschedulable einfügen**

  Neue Gruppe `homeserver.kubevirt` und Erweiterungen der Gruppen `homeserver.node` / `homeserver.kubernetes` in `vmrule-homeserver.yaml`:

  ```yaml
  # In homeserver.node
  - alert: HostNetworkInterfaceDown
    expr: >-
      node_network_up{device!~"lo|veth.*|cni.*|flannel.*|tunl.*|cali.*|dummy.*"} == 0
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: >-
        Netzwerk-Interface {{ $labels.device }} auf {{ $labels.instance }} ist down
      description: >-
        Interface {{ $labels.device }} hat seit 5 min keinen Link.

  # Neue Gruppe homeserver.kubevirt
  - name: homeserver.kubevirt
    rules:
      - alert: KubeVirtVMNotRunning
        expr: kubevirt_vmi_phase_count{phase=~"Failed|Unknown"} > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: >-
            KubeVirt VMI in Phase {{ $labels.phase }}
          description: >-
            Eine oder mehrere VMIs befinden sich in Phase {{ $labels.phase }}.
            Prüfe `kubectl get vmi -A`.

  # In homeserver.kubernetes
  - alert: PodUnschedulable
    expr: kube_pod_status_unschedulable == 1
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: >-
        Pod {{ $labels.namespace }}/{{ $labels.pod }} kann nicht scheduled werden
      description: >-
        Der Pod ist seit 10 min unschedulable (kein passender Node).
  ```

- [ ] **Schritt 2a: systemd-Collector in node-exporter aktivieren**

  In `values.yaml` unter `victoria-metrics-k8s-stack.prometheus-node-exporter` ergänzen (bestehende `resources:`-Keys beibehalten):

  ```yaml
  prometheus-node-exporter:
    enabled: true
    extraArgs:
      - --collector.systemd
    extraVolumes:
      - name: systemd-socket
        hostPath:
          path: /run/systemd
    extraVolumeMounts:
      - name: systemd-socket
        mountPath: /run/systemd
        readOnly: true
  ```

  Cardinality-Hinweis: ~200 systemd-Units × 7 States ≈ 1.400 Zeitreihen – kein Problem für VMSingle mit 10 Gi Storage.

- [ ] **Schritt 2b: SystemdUnitFailed-Alert in `vmrule-homeserver.yaml` hinzufügen**

  Neue Gruppe `homeserver.systemd` einfügen:

  ```yaml
  - name: homeserver.systemd
    rules:
      - alert: SystemdUnitFailed
        expr: node_systemd_unit_state{state="failed"} == 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: >-
            systemd-Unit {{ `{{ $labels.name }}` }} auf {{ `{{ $labels.instance }}` }} fehlgeschlagen
          description: >-
            Die systemd-Unit ist in state=failed. Prüfe mit
            `systemctl status {{ `{{ $labels.name }}` }}`.
  ```

- [ ] **Schritt 3: Lint**

  ```bash
  cd /Users/jaydee/git/home-server && make lint
  ```
  Erwartet: kein Fehler.

- [ ] **Schritt 4: Commit**

  ```bash
  git add argocd/apps/monitoring/templates/vmrule-homeserver.yaml \
          argocd/apps/monitoring/values.yaml
  git commit -m "feat(monitoring): add systemd, kubevirt, network, unschedulable alerts"
  ```

---

### Task 2: Gotify-Bridge durch ntfy-alertmanager Bridge ersetzen

**Files:**
- Delete: `argocd/apps/monitoring/templates/alertmanager-gotify-bridge.yaml`
- Delete: `argocd/apps/monitoring/templates/sealedsecret-alertmanager-gotify-bridge.yaml`
- Create: `argocd/apps/monitoring/templates/ntfy-alertmanager.yaml` (Deployment + Service)
- Create: `argocd/apps/monitoring/templates/configmap-ntfy-alertmanager.yaml` (Bridge-Konfiguration)
- Modify: `argocd/apps/monitoring/values.yaml` (Alertmanager config: receiver → Bridge)

**Interfaces:**
- Produces: Alertmanager sendet Webhooks an `http://ntfy-alertmanager.monitoring.svc.cluster.local:8080` → Bridge formatiert und postet an `https://ntfy.sh/<topic>`

- [ ] **Schritt 1: Gotify-Dateien löschen**

  ```bash
  git rm argocd/apps/monitoring/templates/alertmanager-gotify-bridge.yaml \
         argocd/apps/monitoring/templates/sealedsecret-alertmanager-gotify-bridge.yaml
  ```

- [ ] **Schritt 2: `configmap-ntfy-alertmanager.yaml` anlegen**

  Topic-Name frei wählen (zufällig, z.B. `homeserver-alerts-` + 6 zufällige Zeichen) und einsetzen:

  ```yaml
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: ntfy-alertmanager-config
    namespace: monitoring
  data:
    config.yml: |
      ---
      http-address: ":8080"
      ntfy:
        server: https://ntfy.sh
        topic: TOPIC_NAME_HIER_ERSETZEN
      labels:
        order:
          - severity
        severity:
          critical: urgent
          warning: high
          info: default
  ```

  Notification-Format: Titel = `alertname`, Body = `annotations.description`, Priorität aus `labels.severity`.

- [ ] **Schritt 3: `ntfy-alertmanager.yaml` anlegen** (Deployment + Service)

  ```yaml
  ---
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: ntfy-alertmanager
    namespace: monitoring
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: ntfy-alertmanager
    template:
      metadata:
        labels:
          app: ntfy-alertmanager
      spec:
        securityContext:
          runAsNonRoot: true
          runAsUser: 65534
        containers:
          - name: bridge
            # renovate: datasource=docker depName=xenrox/ntfy-alertmanager
            image: xenrox/ntfy-alertmanager:0.4.1
            args:
              - --config=/etc/ntfy-alertmanager/config.yml
            ports:
              - name: webhook
                containerPort: 8080
            volumeMounts:
              - name: config
                mountPath: /etc/ntfy-alertmanager
                readOnly: true
            resources:
              requests:
                cpu: 5m
                memory: 16Mi
              limits:
                cpu: 50m
                memory: 32Mi
        volumes:
          - name: config
            configMap:
              name: ntfy-alertmanager-config
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: ntfy-alertmanager
    namespace: monitoring
  spec:
    selector:
      app: ntfy-alertmanager
    ports:
      - name: webhook
        port: 8080
        targetPort: 8080
  ```

- [ ] **Schritt 4: Alertmanager-Config in `values.yaml` ersetzen**

  Den gesamten `alertmanager.config`-Block ersetzen (bestehende `inhibit_rules` **müssen** übernommen werden):

  ```yaml
  alertmanager:
    enabled: true
    spec:
      replicaCount: 1
    config:
      route:
        receiver: ntfy
        group_by: ["alertname", "namespace"]
        group_wait: 30s
        group_interval: 5m
        repeat_interval: 4h
        routes:
          - receiver: blackhole
            matchers:
              - severity="info"
      receivers:
        - name: ntfy
          webhook_configs:
            - url: "http://ntfy-alertmanager.monitoring.svc.cluster.local:8080"
              send_resolved: true
        - name: blackhole
      inhibit_rules:
        - target_matchers:
            - severity=~"warning|info"
          source_matchers:
            - severity=critical
          equal:
            - namespace
            - alertname
        - target_matchers:
            - severity=info
          source_matchers:
            - severity=warning
          equal:
            - namespace
            - alertname
  ```

- [ ] **Schritt 5: ntfy-App auf dem Smartphone einrichten**

  - App „ntfy" (iOS/Android) installieren
  - Topic abonnieren: denselben Namen wie in Schritt 2 gewählt
  - Ergebnis: Notifications kommen als Titel `HostDiskCritical`, Body `Less than 10% free on /`

- [ ] **Schritt 6: Lint**

  ```bash
  cd /Users/jaydee/git/home-server && make lint
  ```

- [ ] **Schritt 7: Commit**

  ```bash
  git add argocd/apps/monitoring/templates/ntfy-alertmanager.yaml \
          argocd/apps/monitoring/templates/configmap-ntfy-alertmanager.yaml \
          argocd/apps/monitoring/values.yaml
  git commit -m "feat(monitoring): replace gotify-bridge with ntfy-alertmanager bridge"
  ```

---

### Task 3: Blackbox Exporter (neue ArgoCD-App)

**Files:**
- Create: `argocd/apps/blackbox-exporter/Chart.yaml`
- Create: `argocd/apps/blackbox-exporter/values.yaml`
- Create: `argocd/apps/blackbox-exporter/templates/vmprobe.yaml`
- Modify: `argocd/apps/monitoring/templates/vmrule-homeserver.yaml` (neue Gruppe `homeserver.blackbox`)

**Interfaces:**
- Consumes: VMAgent mit `selectAllByDefault: true` discovert VMProbe automatisch
- Produces: Metrik `probe_success{job="homeserver-blackbox"}` im TSDB; Alert `ServiceEndpointDown`

- [ ] **Schritt 1: `Chart.yaml` anlegen**

  ```yaml
  apiVersion: v2
  name: blackbox-exporter
  description: HTTP blackbox probes for homeserver services via prometheus-blackbox-exporter
  type: application
  version: 0.1.0
  appVersion: "latest"
  dependencies:
    # renovate: datasource=helm registryUrl=https://prometheus-community.github.io/helm-charts
    - name: prometheus-blackbox-exporter
      repository: https://prometheus-community.github.io/helm-charts
      version: "9.4.0"
  ```

- [ ] **Schritt 2: `values.yaml` anlegen**

  ```yaml
  prometheus-blackbox-exporter:
    config:
      modules:
        http_2xx:
          prober: http
          timeout: 10s
          http:
            valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
            valid_status_codes: []  # 2xx
            follow_redirects: true
    resources:
      requests:
        cpu: 10m
        memory: 32Mi
      limits:
        cpu: 100m
        memory: 64Mi
    serviceMonitor:
      enabled: false  # VMProbe statt ServiceMonitor
  ```

- [ ] **Schritt 3: `templates/vmprobe.yaml` anlegen**

  ```yaml
  apiVersion: operator.victoriametrics.com/v1beta1
  kind: VMProbe
  metadata:
    name: homeserver-services
    namespace: monitoring
  spec:
    jobName: homeserver-blackbox
    vmProberSpec:
      url: blackbox-exporter-prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115
      path: /probe
      scheme: http
    module: http_2xx
    targets:
      staticConfig:
        static:
          - http://homepage.homeserver
          - http://grafana.homeserver
          - http://pihole.homeserver/admin/login
          - http://192.168.178.127:30080           # ArgoCD
          - http://jellyfin.homeserver
          - http://homeassistant.homeserver
        relabelingConfigs:
          - sourceLabels: [__address__]
            targetLabel: instance
  ```

- [ ] **Schritt 4: `ServiceEndpointDown`-Alert in `vmrule-homeserver.yaml` hinzufügen**

  Neue Gruppe `homeserver.blackbox`:

  ```yaml
  - name: homeserver.blackbox
    rules:
      - alert: ServiceEndpointDown
        expr: probe_success{job="homeserver-blackbox"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: >-
            Service {{ $labels.instance }} antwortet nicht
          description: >-
            HTTP-Probe von {{ $labels.instance }} schlägt seit 2 min fehl.
            Prüfe Traefik-Logs und Pod-Status.
  ```

- [ ] **Schritt 5: Helm-Dependencies aktualisieren**

  ```bash
  cd argocd/apps/blackbox-exporter && helm dependency update
  git add Chart.lock charts/
  ```

- [ ] **Schritt 6: Lint**

  ```bash
  cd /Users/jaydee/git/home-server && make lint
  ```

- [ ] **Schritt 7: Commit**

  ```bash
  git add argocd/apps/blackbox-exporter/ \
          argocd/apps/monitoring/templates/vmrule-homeserver.yaml
  git commit -m "feat(monitoring): add blackbox-exporter with HTTP probes for 6 services"
  ```

---

### Task 4: Grafana Dashboard "Homeserver Alerts"

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboard-alerts.yaml`

**Interfaces:**
- Consumes: Metrik `ALERTS{alertstate="firing"}` aus VictoriaMetrics (alle vorherigen Tasks vorausgesetzt, aber auch standalone nutzbar)
- Produces: Grafana-Dashboard mit Label `grafana_dashboard: "1"` im Namespace `monitoring`

- [ ] **Schritt 1: ConfigMap `dashboard-alerts.yaml` anlegen**

  ConfigMap mit Grafana-Dashboard-JSON. Das Dashboard enthält:
  - **Row 1 – Stat-Panels:** drei nebeneinander
    - "Critical Firing": `count(ALERTS{alertstate="firing", severity="critical"}) or vector(0)`
    - "Warning Firing": `count(ALERTS{alertstate="firing", severity="warning"}) or vector(0)`
    - "Total Firing": `count(ALERTS{alertstate="firing"}) or vector(0)`
    - Farb-Thresholds: 0 = grün, ≥1 = rot (Critical) / orange (Warning) / rot (Total)
  - **Row 2 – Tabelle:** Query `ALERTS{alertstate="firing"}`, Spalten: alertname, namespace, severity, Annotation summary, Seit (startedAt)
  - **Row 3 – Zeitreihe:** `count(ALERTS{alertstate="firing"}) by (severity)` über 24 h

  Die ConfigMap-Struktur folgt `argocd/apps/monitoring-dashboards/argocd.yaml` als Vorlage (Label `grafana_dashboard: "1"`, Key `<name>.json`).

  ```yaml
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: custom-dashboard-homeserver-alerts
    namespace: monitoring
    labels:
      grafana_dashboard: "1"
  data:
    homeserver-alerts.json: |
      { ... }   # vollständiges Dashboard-JSON (siehe Schritt 2)
  ```

- [ ] **Schritt 2: Dashboard-JSON generieren**

  Dashboard-JSON mit Grafana-Schema v30 schreiben. Wichtige Felder:
  - `uid`: `homeserver-alerts`
  - `title`: `Homeserver – Active Alerts`
  - `refresh`: `1m`
  - `time`: `{ "from": "now-24h", "to": "now" }`
  - Datasource-Variable `$datasource` vom Typ `prometheus` (wie alle anderen Dashboards im Repo – z.B. `argocd.yaml`)
  - Stat-Panel-Typ `stat`, Tabellen-Typ `table`, Zeitreihen-Typ `timeseries`

  Referenz-Panel aus `argocd/apps/monitoring-dashboards/argocd.yaml` als Strukturvorlage verwenden.

- [ ] **Schritt 3: Lint**

  ```bash
  cd /Users/jaydee/git/home-server && make lint
  ```

- [ ] **Schritt 4: Commit**

  ```bash
  git add argocd/apps/monitoring/templates/dashboard-alerts.yaml
  git commit -m "feat(monitoring): add homeserver active-alerts Grafana dashboard"
  ```

---

## Verifikation nach ArgoCD-Sync (alle Tasks)

Nach `git push → ArgoCD sync`:

```bash
# 1. VMRules vorhanden
kubectl get vmrule -n monitoring homeserver-custom-rules -o yaml | grep -E "SystemdUnitFailed|KubeVirtVMNotRunning|HostNetworkInterfaceDown|ServiceEndpointDown"

# 2. node-exporter systemd-Collector aktiv
kubectl exec -n monitoring ds/monitoring-prometheus-node-exporter -- \
  wget -qO- localhost:9100/metrics | grep node_systemd_unit_state | head -5

# 3. ntfy-alertmanager Bridge läuft
kubectl get pod -n monitoring -l app=ntfy-alertmanager

# 4. ntfy-Webhook über Bridge testen (Alertmanager-Format)
kubectl exec -n monitoring deploy/ntfy-alertmanager -- \
  wget -qO- --post-data='{"receiver":"ntfy","status":"firing","alerts":[{"labels":{"alertname":"TestAlert","severity":"warning"},"annotations":{"summary":"Testbenachrichtigung","description":"Manueller Test vom homeserver"}}]}' \
  --header='Content-Type: application/json' \
  http://localhost:8080
# → Notification "TestAlert" muss auf dem Handy ankommen

# 4. Blackbox-Exporter Probes
kubectl exec -n monitoring deploy/blackbox-exporter-prometheus-blackbox-exporter -- \
  wget -qO- 'localhost:9115/probe?target=http://grafana.homeserver&module=http_2xx' | grep probe_success

# 5. Grafana-Dashboard sichtbar
# Öffne http://grafana.homeserver → Dashboards → "Homeserver – Active Alerts"
```
