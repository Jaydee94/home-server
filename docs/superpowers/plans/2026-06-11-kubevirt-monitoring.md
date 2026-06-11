# KubeVirt VM Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KubeVirt-VMs in VictoriaMetrics scrapen, ein Community-Grafana-Dashboard deployen und die CPU/RAM-Kacheln der Gameserver-UI mit echten Werten füllen.

**Architecture:** Ein VMServiceScrape in `argocd/apps/monitoring/templates/` scrapt den bereits vorhandenen `kubevirt-prometheus-metrics`-Service (HTTPS, insecureSkipVerify). Das Community-Dashboard 11748 von grafana.com wird als ConfigMap mit Label `grafana_dashboard=1` deployed — der Grafana-Sidecar picked es automatisch auf. Die `api/metrics/route.ts` in der Gameserver-UI nutzt danach `kubevirt_vmi_vcpu_seconds` / `kubevirt_vmi_memory_resident_bytes` statt der bisher fehlschlagenden cAdvisor-Queries.

**Tech Stack:** VictoriaMetrics Operator (`VMServiceScrape` CRD), Helm, ArgoCD GitOps, Next.js API Route (TypeScript), Grafana ConfigMap-Sidecar-Provisioning.

---

## Codebase-Kontext (für Implementierer)

- Cluster: k3s Single-Node, `192.168.178.127`
- Monitoring-Stack: `argocd/apps/monitoring/` (Helm, `victoria-metrics-k8s-stack`)
- KubeVirt: `argocd/apps/kubevirt/`, Version v1.8.3
- Vorhandener KubeVirt-Service: `kubevirt-prometheus-metrics` im Namespace `kubevirt`, Port 443 (TLS, selbstsigniert), Label `prometheus.kubevirt.io: "true"` — selektiert virt-handler/virt-controller/virt-api
- Grafana-Datasource UID: `VictoriaMetrics` (type: `prometheus`, auto-provisioniert durch den Stack)
- Gameserver-UI: `apps/gameserver-ui/`, deployed in Namespace `gameserver-ui`
- VM-Name: `7dtd-server` (via Env-Var `VM_NAME` im Deployment)
- Bestehende VMServiceScrape-Beispiele: `argocd/apps/monitoring/templates/vmservicescrape-pihole.yaml`

## Datei-Übersicht

| Aktion | Pfad |
|---|---|
| Neu erstellen | `argocd/apps/monitoring/templates/vmservicescrape-kubevirt.yaml` |
| Neu erstellen | `argocd/apps/monitoring/templates/dashboard-kubevirt.yaml` |
| Ändern | `apps/gameserver-ui/src/app/api/metrics/route.ts` |

---

## Task 1: Branch anlegen + VMServiceScrape erstellen

**Files:**
- Create: `argocd/apps/monitoring/templates/vmservicescrape-kubevirt.yaml`

- [ ] **Step 1: Branch anlegen**

```bash
git checkout -b feat/kubevirt-monitoring
```

Expected: `Switched to a new branch 'feat/kubevirt-monitoring'`

- [ ] **Step 2: VMServiceScrape erstellen**

Erstelle `argocd/apps/monitoring/templates/vmservicescrape-kubevirt.yaml` mit folgendem Inhalt:

```yaml
---
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMServiceScrape
metadata:
  name: kubevirt
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames:
      - kubevirt
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

- [ ] **Step 3: Helm lint ausführen**

```bash
helm lint argocd/apps/monitoring/
```

Expected:
```
==> Linting argocd/apps/monitoring/
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

- [ ] **Step 4: Committen**

```bash
git add argocd/apps/monitoring/templates/vmservicescrape-kubevirt.yaml
git commit -m "feat(monitoring): add VMServiceScrape for KubeVirt metrics"
```

---

## Task 2: Community-Dashboard als ConfigMap deployen

**Files:**
- Create: `argocd/apps/monitoring/templates/dashboard-kubevirt.yaml`

Das Dashboard 11748 „KubeVirt VM Info" von grafana.com wird heruntergeladen und transformiert:
- `__inputs` und `__requires` werden entfernt (nur für Grafana-Import-Wizard)
- Default-Datasource wird auf `VictoriaMetrics` gesetzt (UID: `VictoriaMetrics`, type: `prometheus`)
- `${DS_PROMETHEUS}`-Referenzen werden durch `VictoriaMetrics` ersetzt

- [ ] **Step 1: Dashboard-JSON herunterladen und transformieren**

Führe folgenden Befehl aus und kopiere das Ergebnis (JSON-String) für Step 2:

```bash
curl -sL "https://grafana.com/api/dashboards/11748/revisions/1/download" --compressed \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
d.pop('__inputs', None)
d.pop('__requires', None)
for v in d.get('templating', {}).get('list', []):
    if v.get('name') == 'datasource':
        v['current'] = {'selected': True, 'text': 'VictoriaMetrics', 'value': 'VictoriaMetrics'}
        break
import re
text = json.dumps(d)
text = text.replace('\${DS_PROMETHEUS}', 'VictoriaMetrics')
print(text)
" > /tmp/kubevirt-dashboard.json

# Prüfen ob die Datei valides JSON enthält:
python3 -c "import json; d=json.load(open('/tmp/kubevirt-dashboard.json')); print('OK, title:', d['title'], 'panels:', len(d['panels']))"
```

Expected: `OK, title: KubeVirt VM Info panels: 10`

- [ ] **Step 2: ConfigMap erstellen**

Erstelle `argocd/apps/monitoring/templates/dashboard-kubevirt.yaml`:

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-kubevirt
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  kubevirt-vm-info.json: |
```

Hänge dann den Inhalt von `/tmp/kubevirt-dashboard.json` als eingerückten Block (4 Spaces) an. Das geht mit:

```bash
# Füge den JSON-Inhalt 4-fach eingerückt zur YAML-Datei hinzu:
python3 -c "
import json, textwrap
d = json.load(open('/tmp/kubevirt-dashboard.json'))
text = json.dumps(d, indent=2)
indented = textwrap.indent(text, '    ')
header = '''---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-kubevirt
  namespace: monitoring
  labels:
    grafana_dashboard: \"1\"
data:
  kubevirt-vm-info.json: |
'''
print(header + indented)
" > argocd/apps/monitoring/templates/dashboard-kubevirt.yaml
```

- [ ] **Step 3: Datei prüfen**

```bash
head -10 argocd/apps/monitoring/templates/dashboard-kubevirt.yaml
wc -l argocd/apps/monitoring/templates/dashboard-kubevirt.yaml
```

Expected: Erste Zeile `---`, zweite Zeile `apiVersion: v1`, Datei ca. 600–800 Zeilen.

- [ ] **Step 4: yamllint prüfen**

```bash
yamllint argocd/apps/monitoring/templates/dashboard-kubevirt.yaml
```

Falls yamllint auf Zeilenlänge klagt (`line too long`): Das ist erwartet für JSON in YAML und in `.yamllint` via `line-length: {max: 200, level: warning}` konfiguriert — Warnings sind ok, Errors nicht.

- [ ] **Step 5: Helm lint**

```bash
helm lint argocd/apps/monitoring/
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 6: Committen**

```bash
git add argocd/apps/monitoring/templates/dashboard-kubevirt.yaml
git commit -m "feat(monitoring): add KubeVirt community dashboard (grafana 11748)"
```

---

## Task 3: Gameserver-UI metrics route auf kubevirt_vmi_* umstellen

**Files:**
- Modify: `apps/gameserver-ui/src/app/api/metrics/route.ts`

Die aktuellen Queries verwenden `container_cpu_usage_seconds_total` und `container_memory_working_set_bytes` — diese Metriken existieren für virt-launcher-Pods nicht in VictoriaMetrics. Ersetzt werden sie durch die `kubevirt_vmi_*`-Metriken aus dem virt-handler.

Korrekte Metriknamen (aus dem Community-Dashboard verifiziert):
- CPU: `kubevirt_vmi_vcpu_seconds` (Counter, Label: `name="<vm-name>"`)
- Memory: `kubevirt_vmi_memory_resident_bytes` (Gauge, Label: `name="<vm-name>"`)

- [ ] **Step 1: `route.ts` anpassen**

Ersetze den gesamten Inhalt von `apps/gameserver-ui/src/app/api/metrics/route.ts` mit:

```typescript
import { NextResponse } from "next/server";

const VICTORIA_URL = process.env.VICTORIA_URL
  ?? "http://vmsingle-monitoring-victoria-metrics-k8s-stack.monitoring.svc.cluster.local:8428";

export async function GET() {
  try {
    const vm = process.env.VM_NAME ?? "7dtd-server";

    const [cpuRes, memRes] = await Promise.all([
      fetch(`${VICTORIA_URL}/api/v1/query?query=rate(kubevirt_vmi_vcpu_seconds%7Bname%3D%22${vm}%22%7D%5B5m%5D)*100`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=kubevirt_vmi_memory_resident_bytes%7Bname%3D%22${vm}%22%7D`),
    ]);

    const cpu = cpuRes.ok ? (await cpuRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const mem = memRes.ok ? (await memRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;

    return NextResponse.json({
      cpuPercent: cpu !== null ? Math.round(parseFloat(cpu) * 10) / 10 : null,
      memoryMb: mem !== null ? Math.round(parseInt(mem) / 1024 / 1024) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

Änderungen gegenüber vorher:
- `ns`-Variable entfernt (kubevirt_vmi_* nutzen `name`-Label, nicht `namespace`)
- CPU-Query: `kubevirt_vmi_vcpu_seconds{name="${vm}"}` statt `container_cpu_usage_seconds_total{namespace=...,pod=~...}`
- Memory-Query: `kubevirt_vmi_memory_resident_bytes{name="${vm}"}` statt `container_memory_working_set_bytes{...}`

URL-codierte Queries:
- CPU: `rate(kubevirt_vmi_vcpu_seconds%7Bname%3D%22${vm}%22%7D%5B5m%5D)*100`  
  (dekodiert: `rate(kubevirt_vmi_vcpu_seconds{name="${vm}"}[5m])*100`)
- Memory: `kubevirt_vmi_memory_resident_bytes%7Bname%3D%22${vm}%22%7D`  
  (dekodiert: `kubevirt_vmi_memory_resident_bytes{name="${vm}"}`)

- [ ] **Step 2: TypeScript-Build prüfen**

```bash
cd apps/gameserver-ui && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` (oder ähnlich ohne Errors). Warnings über pre-existing lint-Fehler sind ok.

- [ ] **Step 3: Tests laufen lassen**

```bash
cd apps/gameserver-ui && npx vitest run 2>&1 | tail -20
```

Expected: Alle bestehenden Tests grün. Keine neuen Failures.

- [ ] **Step 4: Committen**

```bash
cd apps/gameserver-ui && git add src/app/api/metrics/route.ts
git commit -m "fix(gameserver-ui): use kubevirt_vmi_* metrics for CPU/RAM tiles"
```

---

## Task 4: PR erstellen und CI prüfen

**Files:** (keine Code-Änderungen)

- [ ] **Step 1: Push**

```bash
git push -u origin feat/kubevirt-monitoring
```

- [ ] **Step 2: PR erstellen**

```bash
gh pr create \
  --title "feat(monitoring): KubeVirt VM monitoring — scraping + dashboard + UI tiles" \
  --body "$(cat <<'EOF'
## Summary

- Scrapt `kubevirt-prometheus-metrics` Service via VMServiceScrape (HTTPS, insecureSkipVerify)
- Deployed KubeVirt VM Info Community-Dashboard (Grafana ID 11748) als ConfigMap
- Gameserver-UI Metrics-Route auf kubevirt_vmi_vcpu_seconds / kubevirt_vmi_memory_resident_bytes umgestellt

Closes #(falls Issue existiert)

## Test plan

- [ ] CI lint grün (yamllint, helm lint, actionlint)
- [ ] Nach ArgoCD-Sync (~3 min): `kubevirt_vmi_vcpu_seconds{name="7dtd-server"}` in VictoriaMetrics abfragen → Ergebnisse vorhanden
- [ ] Grafana: Dashboard „KubeVirt VM Info" erscheint automatisch
- [ ] Gameserver-UI Dashboard: CPU- und RAM-Kacheln zeigen Zahlen statt `—`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: CI-Status prüfen**

```bash
gh pr checks --watch
```

Expected: Alle 6 Checks grün (yamllint, ansible-lint, helm lint, actionlint, trivy).

---

## Task 5: Post-Deploy-Verifikation

**Voraussetzung:** PR ist gemerged, ArgoCD hat synced (ca. 3 min warten).

- [ ] **Step 1: ArgoCD-Sync prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n monitoring get vmservicescrape kubevirt 2>&1'
```

Expected: VMServiceScrape `kubevirt` vorhanden und `AGE` < 10 Minuten.

- [ ] **Step 2: VictoriaMetrics-Query prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver-ui exec deploy/gameserver-ui -- \
   wget -qO- "http://vmsingle-monitoring-victoria-metrics-k8s-stack.monitoring.svc.cluster.local:8428/api/v1/query?query=kubevirt_vmi_vcpu_seconds%7Bname%3D%227dtd-server%22%7D" 2>&1'
```

Expected: JSON mit `"result":[{...}]` (nicht leer). Kann 1–2 Minuten dauern bis VMAgent erste Scrape-Daten liefert.

- [ ] **Step 3: Grafana-Dashboard prüfen (Playwright)**

Navigiere zu `http://grafana.homeserver` → Dashboards → „KubeVirt VM Info" muss erscheinen. Variable `datasource=VictoriaMetrics` und `namespace=gameserver` setzen, `vm=7dtd-server` wählen → Panels mit Daten.

- [ ] **Step 4: Gameserver-UI-Tiles prüfen (Playwright)**

Navigiere zu `http://gameserver.homeserver` → Dashboard → CPU- und RAM-Kacheln zeigen Zahlenwerte (z. B. `2.3` % CPU, `1024` MB RAM) statt `—`.

Falls die Tiles nach 5 Minuten immer noch `—` zeigen:
```bash
# API direkt aufrufen:
curl -s http://gameserver.homeserver/api/metrics
```
Expected: `{"cpuPercent":2.3,"memoryMb":1024}` (konkrete Zahlen, nicht null).

Falls `null`: VMAgent braucht ggf. einen weiteren Scrape-Zyklus (30s Intervall). Nochmals warten und `/api/metrics` erneut aufrufen.
