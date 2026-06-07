# Grafana Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grafana-Dashboards für alle Home-Server- und NAS-Services anlegen — 4 neue Scraper + 6 Dashboard-ConfigMaps.

**Architecture:** Alle Ressourcen landen in `argocd/apps/monitoring/templates/` als GitOps-YAML. Scraper (VMPodScrape/VMServiceScrape) werden in `namespace: monitoring` deployt und greifen über `namespaceSelector` auf andere Namespaces zu. Dashboards sind Kubernetes-ConfigMaps mit Label `grafana_dashboard: "1"`, die der Grafana-Sidecar automatisch lädt.

**Tech Stack:** VictoriaMetrics Operator (`VMPodScrape`, `VMServiceScrape`), Grafana 11 Sidecar, `ekofr/pihole-exporter`, Helm/ArgoCD, kubectl, jq, Playwright

---

## File Map

```
argocd/apps/monitoring/templates/
├── vmpodscrape-argocd.yaml           NEU — VMPodScrape für alle ArgoCD-Pods
├── vmservicescrape-minio.yaml        NEU — VMServiceScrape MinIO Port 9000
├── vmservicescrape-argo-workflows.yaml  NEU — VMServiceScrape Argo Workflows Port 2746
├── pihole-exporter.yaml              NEU — Deployment + Service pihole-exporter
├── vmservicescrape-pihole.yaml       NEU — VMServiceScrape pihole-exporter Port 9617
└── dashboards/
    ├── nas-node.yaml                 NEU — ConfigMap NAS Node Exporter Full
    ├── nas-docker.yaml               NEU — ConfigMap NAS cAdvisor Containers
    ├── argocd.yaml                   NEU — ConfigMap ArgoCD Dashboard
    ├── minio.yaml                    NEU — ConfigMap MinIO Dashboard
    ├── argo-workflows.yaml           NEU — ConfigMap Argo Workflows Dashboard
    └── pihole.yaml                   NEU — ConfigMap Pi-hole Dashboard
```

---

## Task 1: VMPodScrape für ArgoCD

**Files:**
- Create: `argocd/apps/monitoring/templates/vmpodscrape-argocd.yaml`

- [ ] **Step 1: Datei anlegen**

```yaml
# argocd/apps/monitoring/templates/vmpodscrape-argocd.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMPodScrape
metadata:
  name: argocd
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames:
      - argocd
  selector:
    matchLabels:
      app.kubernetes.io/part-of: argocd
  podMetricsEndpoints:
    - port: metrics
      path: /metrics
```

- [ ] **Step 2: Commit + push → ArgoCD synct**

```bash
git add argocd/apps/monitoring/templates/vmpodscrape-argocd.yaml
git commit -m "feat(monitoring): add VMPodScrape for ArgoCD metrics"
git push
```

- [ ] **Step 3: Verifizieren — ArgoCD-Metriken in VictoriaMetrics**

Warten ~3 Minuten, dann auf dem Server:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'curl -s "http://$(sudo kubectl get svc monitoring-victoria-metrics-k8s-stack-victoria-metrics -n monitoring -o jsonpath="{.spec.clusterIP}"):8428/api/v1/query?query=argocd_app_info" | python3 -m json.tool | head -20'
```

Expected: JSON mit `"status":"success"` und mindestens einem `result`.

---

## Task 2: VMServiceScrape für MinIO

**Files:**
- Create: `argocd/apps/monitoring/templates/vmservicescrape-minio.yaml`

MinIO exponiert `/minio/v2/metrics/cluster` auf Port 9000 **ohne Auth**.

- [ ] **Step 1: Datei anlegen**

```yaml
# argocd/apps/monitoring/templates/vmservicescrape-minio.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMServiceScrape
metadata:
  name: minio
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames:
      - minio
  selector:
    matchLabels:
      app: minio
      monitoring: "true"
  endpoints:
    - port: http
      path: /minio/v2/metrics/cluster
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/vmservicescrape-minio.yaml
git commit -m "feat(monitoring): add VMServiceScrape for MinIO metrics"
git push
```

- [ ] **Step 3: Verifizieren**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'curl -s "http://$(sudo kubectl get svc monitoring-victoria-metrics-k8s-stack-victoria-metrics -n monitoring -o jsonpath="{.spec.clusterIP}"):8428/api/v1/query?query=minio_audit_failed_messages" | python3 -m json.tool | grep -c "value"'
```

Expected: Ausgabe > 0.

---

## Task 3: VMServiceScrape für Argo Workflows

**Files:**
- Create: `argocd/apps/monitoring/templates/vmservicescrape-argo-workflows.yaml`

Argo Workflows Server exponiert `/metrics` auf Port 2746 (Service `argo-workflows-server`, namespaced Port ohne Name).

- [ ] **Step 1: Datei anlegen**

```yaml
# argocd/apps/monitoring/templates/vmservicescrape-argo-workflows.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMServiceScrape
metadata:
  name: argo-workflows
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames:
      - argo-workflows
  selector:
    matchLabels:
      app.kubernetes.io/name: argo-workflows-server
  endpoints:
    - targetPort: 2746
      path: /metrics
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/vmservicescrape-argo-workflows.yaml
git commit -m "feat(monitoring): add VMServiceScrape for Argo Workflows metrics"
git push
```

- [ ] **Step 3: Verifizieren**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'curl -s "http://$(sudo kubectl get svc monitoring-victoria-metrics-k8s-stack-victoria-metrics -n monitoring -o jsonpath="{.spec.clusterIP}"):8428/api/v1/query?query=go_gc_duration_seconds%7Bjob%3D%22argo-workflows%22%7D" | python3 -m json.tool | grep -c "value"'
```

Expected: Ausgabe > 0.

---

## Task 4: Pi-hole Exporter + VMServiceScrape

**Files:**
- Create: `argocd/apps/monitoring/templates/pihole-exporter.yaml`
- Create: `argocd/apps/monitoring/templates/vmservicescrape-pihole.yaml`

`ekofr/pihole-exporter` spricht die Pi-hole v6 REST-API an. Das Admin-Passwort liegt bereits als Secret `pihole-admin` (Key `password`) im Namespace `pihole`.

- [ ] **Step 1: Exporter-Deployment + Service anlegen**

```yaml
# argocd/apps/monitoring/templates/pihole-exporter.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pihole-exporter
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pihole-exporter
  template:
    metadata:
      labels:
        app: pihole-exporter
    spec:
      containers:
        - name: pihole-exporter
          image: ghcr.io/eko/pihole-exporter:latest
          ports:
            - containerPort: 9617
              name: metrics
          env:
            - name: PIHOLE_HOSTNAME
              value: "pihole-web.pihole.svc.cluster.local"
            - name: PIHOLE_PORT
              value: "80"
            - name: PIHOLE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: pihole-admin
                  key: password
            - name: PORT
              value: "9617"
            - name: INTERVAL
              value: "30s"
          resources:
            requests:
              cpu: 10m
              memory: 32Mi
            limits:
              cpu: 100m
              memory: 64Mi
---
apiVersion: v1
kind: Service
metadata:
  name: pihole-exporter
  namespace: monitoring
  labels:
    app: pihole-exporter
spec:
  selector:
    app: pihole-exporter
  ports:
    - name: metrics
      port: 9617
      targetPort: 9617
```

- [ ] **Step 2: VMServiceScrape anlegen**

```yaml
# argocd/apps/monitoring/templates/vmservicescrape-pihole.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMServiceScrape
metadata:
  name: pihole-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: pihole-exporter
  endpoints:
    - port: metrics
      path: /metrics
```

- [ ] **Step 3: Commit + push**

```bash
git add argocd/apps/monitoring/templates/pihole-exporter.yaml \
        argocd/apps/monitoring/templates/vmservicescrape-pihole.yaml
git commit -m "feat(monitoring): add pihole-exporter + VMServiceScrape"
git push
```

- [ ] **Step 4: Exporter-Pod-Status prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl get pods -n monitoring -l app=pihole-exporter'
```

Expected: 1/1 Running.

Falls `CrashLoopBackOff`:
```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl logs -n monitoring deploy/pihole-exporter --tail=20'
```

- [ ] **Step 5: Pi-hole-Metriken verifizieren**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'curl -s "http://$(sudo kubectl get svc monitoring-victoria-metrics-k8s-stack-victoria-metrics -n monitoring -o jsonpath="{.spec.clusterIP}"):8428/api/v1/query?query=pihole_dns_queries_today" | python3 -m json.tool | head -10'
```

Expected: `"status":"success"` mit einer Zahl > 0.

---

## Task 5: Dashboard-Verzeichnis anlegen

- [ ] **Step 1: Verzeichnis anlegen und committen**

```bash
mkdir -p argocd/apps/monitoring/templates/dashboards
git add argocd/apps/monitoring/templates/dashboards/.gitkeep 2>/dev/null || \
  touch argocd/apps/monitoring/templates/dashboards/.gitkeep && \
  git add argocd/apps/monitoring/templates/dashboards/.gitkeep
git commit -m "chore(monitoring): add dashboards template directory"
git push
```

---

## Task 6: NAS Node Dashboard

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboards/nas-node.yaml`

- [ ] **Step 1: Dashboard-JSON laden und ConfigMap erzeugen**

```bash
# Dashboard-ID 1860 Revision 37 — Node Exporter Full
# Die Instance-Variable wird auf ugreen-nas vorbelegt
JSON=$(curl -sL "https://grafana.com/api/dashboards/1860/revisions/37/download")

# Titel und instance-Default anpassen
JSON=$(echo "$JSON" | python3 - <<'EOF'
import json, sys
d = json.load(sys.stdin)
d["title"] = "NAS — Node Exporter Full"
d["id"] = None
# instance-Variable default auf ugreen-nas setzen
for t in d.get("templating", {}).get("list", []):
    if t.get("name") == "instance":
        t["current"] = {"text": "ugreen-nas", "value": "ugreen-nas"}
        t["query"] = "ugreen-nas"
print(json.dumps(d))
EOF
)

mkdir -p argocd/apps/monitoring/templates/dashboards
cat > argocd/apps/monitoring/templates/dashboards/nas-node.yaml <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-dashboard-nas-node
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  nas-node.json: |
$(echo "$JSON" | sed 's/^/    /')
YAML
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/dashboards/nas-node.yaml
git commit -m "feat(monitoring): add NAS Node Exporter Full dashboard"
git push
```

- [ ] **Step 3: Grafana lädt Dashboard**

```bash
# ~2 Minuten warten, dann in Grafana prüfen:
# http://grafana.homeserver → Dashboards → "NAS — Node Exporter Full"
# CPU, RAM und Disk-Panels zeigen Werte für ugreen-nas
```

---

## Task 7: NAS Docker Container Dashboard

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboards/nas-docker.yaml`

- [ ] **Step 1: Dashboard-JSON laden (cAdvisor Dashboard ID 14282)**

```bash
JSON=$(curl -sL "https://grafana.com/api/dashboards/14282/revisions/latest/download")
JSON=$(echo "$JSON" | python3 - <<'EOF'
import json, sys
d = json.load(sys.stdin)
d["title"] = "NAS — Docker Containers (cAdvisor)"
d["id"] = None
print(json.dumps(d))
EOF
)
cat > argocd/apps/monitoring/templates/dashboards/nas-docker.yaml <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-dashboard-nas-docker
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  nas-docker.json: |
$(echo "$JSON" | sed 's/^/    /')
YAML
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/dashboards/nas-docker.yaml
git commit -m "feat(monitoring): add NAS cAdvisor Docker containers dashboard"
git push
```

- [ ] **Step 3: Dashboard verifizieren**

Grafana → Dashboards → `NAS — Docker Containers (cAdvisor)` → Container-Panels zeigen Paperless-NGX, OpenCode, TinyTeller, Day Pilot.

---

## Task 8: ArgoCD Dashboard

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboards/argocd.yaml`

- [ ] **Step 1: Dashboard-JSON laden (ID 14584)**

```bash
JSON=$(curl -sL "https://grafana.com/api/dashboards/14584/revisions/latest/download")
JSON=$(echo "$JSON" | python3 - <<'EOF'
import json, sys
d = json.load(sys.stdin)
d["title"] = "ArgoCD — Applications"
d["id"] = None
print(json.dumps(d))
EOF
)
cat > argocd/apps/monitoring/templates/dashboards/argocd.yaml <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-dashboard-argocd
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  argocd.json: |
$(echo "$JSON" | sed 's/^/    /')
YAML
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/dashboards/argocd.yaml
git commit -m "feat(monitoring): add ArgoCD applications dashboard"
git push
```

- [ ] **Step 3: Dashboard verifizieren**

Grafana → `ArgoCD — Applications` → App-Health-/Sync-Panels zeigen alle 13 Apps als Healthy.

---

## Task 9: MinIO Dashboard

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboards/minio.yaml`

- [ ] **Step 1: Dashboard-JSON laden (ID 13502)**

```bash
JSON=$(curl -sL "https://grafana.com/api/dashboards/13502/revisions/latest/download")
JSON=$(echo "$JSON" | python3 - <<'EOF'
import json, sys
d = json.load(sys.stdin)
d["title"] = "MinIO — Storage"
d["id"] = None
print(json.dumps(d))
EOF
)
cat > argocd/apps/monitoring/templates/dashboards/minio.yaml <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-dashboard-minio
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  minio.json: |
$(echo "$JSON" | sed 's/^/    /')
YAML
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/dashboards/minio.yaml
git commit -m "feat(monitoring): add MinIO storage dashboard"
git push
```

- [ ] **Step 3: Dashboard verifizieren**

Grafana → `MinIO — Storage` → Request-Rate- und Bucket-Panels zeigen Daten.

---

## Task 10: Argo Workflows Dashboard

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboards/argo-workflows.yaml`

- [ ] **Step 1: Dashboard-JSON laden (ID 17928)**

```bash
JSON=$(curl -sL "https://grafana.com/api/dashboards/17928/revisions/latest/download")
JSON=$(echo "$JSON" | python3 - <<'EOF'
import json, sys
d = json.load(sys.stdin)
d["title"] = "Argo Workflows — CI/CD"
d["id"] = None
print(json.dumps(d))
EOF
)
cat > argocd/apps/monitoring/templates/dashboards/argo-workflows.yaml <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-dashboard-argo-workflows
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  argo-workflows.json: |
$(echo "$JSON" | sed 's/^/    /')
YAML
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/dashboards/argo-workflows.yaml
git commit -m "feat(monitoring): add Argo Workflows CI/CD dashboard"
git push
```

- [ ] **Step 3: Dashboard verifizieren**

Grafana → `Argo Workflows — CI/CD` → Go-Runtime-Panels zeigen Daten; Workflow-Panels zeigen 0 (keine laufenden Workflows ist korrekt).

---

## Task 11: Pi-hole Dashboard

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboards/pihole.yaml`

Voraussetzung: Task 4 (pihole-exporter) ist deployed und Metriken fließen.

- [ ] **Step 1: Dashboard-JSON laden (ID 10176)**

```bash
JSON=$(curl -sL "https://grafana.com/api/dashboards/10176/revisions/latest/download")
JSON=$(echo "$JSON" | python3 - <<'EOF'
import json, sys
d = json.load(sys.stdin)
d["title"] = "Pi-hole — DNS & Adblock"
d["id"] = None
print(json.dumps(d))
EOF
)
cat > argocd/apps/monitoring/templates/dashboards/pihole.yaml <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: custom-dashboard-pihole
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  pihole.json: |
$(echo "$JSON" | sed 's/^/    /')
YAML
```

- [ ] **Step 2: Commit + push**

```bash
git add argocd/apps/monitoring/templates/dashboards/pihole.yaml
git commit -m "feat(monitoring): add Pi-hole DNS & Adblock dashboard"
git push
```

- [ ] **Step 3: Dashboard verifizieren**

Grafana → `Pi-hole — DNS & Adblock` → DNS-Queries/s > 0, Blocked-Rate % angezeigt.

---

## Task 12: Playwright End-to-End-Test

Alle 6 Dashboards in Grafana prüfen.

- [ ] **Step 1: Grafana-Passwort holen**

```bash
GRAFANA_PW=$(ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n monitoring get secret grafana-admin \
   -o jsonpath="{.data.admin-password}" | base64 -d')
echo "Password: $GRAFANA_PW"
```

- [ ] **Step 2: Browser öffnen + Login**

Playwright navigiert zu `http://grafana.homeserver`, loggt ein mit `admin` / Passwort aus Step 1.

- [ ] **Step 3: Alle 6 Dashboards öffnen und prüfen**

Für jedes Dashboard gilt: öffnen, prüfen dass:
- Kein `No data`-Panel vorhanden (außer Argo Workflows Workflow-Count = 0 ist ok)
- Mindestens ein Panel zeigt Zeitreihen-Daten

Dashboards in Reihenfolge prüfen:
1. `NAS — Node Exporter Full`
2. `NAS — Docker Containers (cAdvisor)`
3. `ArgoCD — Applications`
4. `MinIO — Storage`
5. `Argo Workflows — CI/CD`
6. `Pi-hole — DNS & Adblock`

- [ ] **Step 4: Screenshot pro Dashboard erstellen**

Mit Playwright Screenshot als Verifikationsnachweis.

---

## Hinweise zur Fehlerbehebung

**VMPodScrape/VMServiceScrape greift nicht:**
```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl logs -n monitoring deploy/monitoring-victoria-metrics-k8s-stack-vmagent --tail=20 | grep -i "error\|warn"'
```

**Dashboard lädt nicht in Grafana:**
```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl logs -n monitoring deploy/monitoring-victoria-metrics-k8s-stack-grafana -c grafana --tail=20 | grep -i "dashboard\|error"'
```

**Pi-hole Exporter Passwort-Fehler:**
```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl logs -n monitoring deploy/pihole-exporter --tail=30'
# Falls "unauthorized": prüfen ob pihole-admin Secret existiert:
# sudo kubectl get secret pihole-admin -n pihole
```

**VictoriaMetrics VM-IP ermitteln (für alle curl-Tests):**
```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl get svc monitoring-victoria-metrics-k8s-stack-victoria-metrics -n monitoring -o jsonpath="{.spec.clusterIP}"'
```
