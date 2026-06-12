# Homepage Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Konsolidiert 7 Homepage-Sektionen auf 4, fixiert kaputte Icons und optimiert die Spaltenanzahl für sparse Sektionen.

**Architecture:** Alle Änderungen in einer einzigen Datei (`argocd/apps/homepage/values.yaml`). Keine neuen Templates oder Helm-Charts nötig. ArgoCD synct die Änderungen automatisch nach dem Merge.

**Tech Stack:** homepage Helm Chart, ArgoCD GitOps, Playwright MCP für visuelle Verifikation.

---

## Voraussetzung

PR #159 (`fix/homepage-gameserver-tile`) muss in `main` gemergt sein, bevor dieser Branch angelegt wird. Der PR enthält den `mdi-zombie`-Icon-Fix für Gameserver-UI, auf dem dieser Plan aufbaut.

---

## Betroffene Dateien

| Datei | Aktion |
|---|---|
| `argocd/apps/homepage/values.yaml` | Modify — `config.settings.layout` + `config.services` |

---

### Task 1: Branch anlegen

**Files:**
- Keine Dateiänderungen

- [ ] **Schritt 1: Sicherstellen dass PR #159 gemergt und main aktuell ist**

```bash
git checkout main && git pull origin main
git log --oneline -3
# Erwartete Ausgabe: fix/homepage-gameserver-tile Commit an erster Stelle
```

- [ ] **Schritt 2: Feature-Branch anlegen**

```bash
git checkout -b feat/homepage-layout-redesign
```

---

### Task 2: Before-Screenshot für Vergleich

**Files:**
- Keine Dateiänderungen

- [ ] **Schritt 1: Playwright-Screenshot aufnehmen**

Via Playwright MCP in Claude:
```
browser_resize(width=1400, height=3000)
browser_navigate("http://home.homeserver")
browser_take_screenshot(filename="docs/screenshots/homepage-before-redesign.png")
```

Bewahrt den Ist-Zustand für den visuellen Vergleich nach der Umsetzung.

---

### Task 3: Layout-Sektion umschreiben

**Files:**
- Modify: `argocd/apps/homepage/values.yaml`

- [ ] **Schritt 1: Alten `layout`-Block ersetzen**

Den Abschnitt `layout:` unter `config.settings` vollständig ersetzen:

```yaml
      layout:
        Cluster:
          style: row
          columns: 3
        Media:
          style: row
          columns: 2
        NAS:
          style: row
          columns: 4
        Tools:
          style: row
          columns: 4
```

Entfernte Einträge: `Kubernetes`, `Monitoring`, `"GitOps & CI/CD"`, `Gaming`.

- [ ] **Schritt 2: YAML-Syntax prüfen**

```bash
python3 -c "import yaml; yaml.safe_load(open('argocd/apps/homepage/values.yaml'))" && echo "OK"
# Erwartete Ausgabe: OK
```

- [ ] **Schritt 3: Commit**

```bash
git add argocd/apps/homepage/values.yaml
git commit -m "refactor(homepage): layout auf 4 Sektionen reduziert"
```

---

### Task 4: Services — Cluster-Sektion anlegen

**Files:**
- Modify: `argocd/apps/homepage/values.yaml`

- [ ] **Schritt 1: Alle drei alten Sektionen durch eine `Cluster:`-Sektion ersetzen**

Den gesamten `services:`-Block unter `config:` ersetzen. Die drei Sektionen `GitOps & CI/CD:`, `Kubernetes:` und `Monitoring:` werden zu einer einzigen `Cluster:`-Sektion zusammengeführt.

Neue Reihenfolge in `Cluster:` (wichtigste Dienste in Reihe 1):

```yaml
    services:
      - Cluster:
          - ArgoCD:
              href: http://192.168.178.127:30080
              description: GitOps Controller
              icon: argo-cd.svg
              widget:
                type: argocd
                url: http://argocd-server.argocd.svc.cluster.local
                key: "{{HOMEPAGE_VAR_ARGOCD_TOKEN}}"
                fields: ["apps", "synced", "healthy", "outOfSync"]
          - Grafana:
              href: http://grafana.homeserver
              description: Metriken & Dashboards
              icon: grafana.svg
              widget:
                type: grafana
                version: 2
                url: http://monitoring-grafana.monitoring.svc.cluster.local
                username: admin
                password: "{{HOMEPAGE_VAR_GRAFANA_PASSWORD}}"
          - Headlamp:
              href: http://headlamp.homeserver
              description: Kubernetes Dashboard
              icon: headlamp.svg
          - Argo Workflows:
              href: http://argo-workflows.homeserver
              description: Private CI
              icon: https://raw.githubusercontent.com/argoproj/argo-workflows/main/docs/assets/logo.png
          - Semaphore:
              href: http://semaphore.homeserver
              description: Ansible UI
              icon: mdi-ansible
          - kubeseal-webgui:
              href: http://kubeseal-webgui.homeserver
              description: Sealed Secrets UI
              icon: kubernetes.svg
```

- [ ] **Schritt 2: YAML prüfen**

```bash
python3 -c "import yaml; yaml.safe_load(open('argocd/apps/homepage/values.yaml'))" && echo "OK"
```

- [ ] **Schritt 3: Commit**

```bash
git add argocd/apps/homepage/values.yaml
git commit -m "refactor(homepage): GitOps + Kubernetes + Monitoring → Cluster-Sektion"
```

---

### Task 5: Services — Media, NAS, Tools + Icon-Fixes

**Files:**
- Modify: `argocd/apps/homepage/values.yaml`

- [ ] **Schritt 1: Restliche Sektionen anpassen**

Nach dem `Cluster:`-Block die weiteren Sektionen eintragen. `Gaming:` entfällt; `Gameserver-UI` wird zu `Tools:` verschoben. Drei Icons werden geändert: `Semaphore` (bereits in Task 4), `OpenCode` und `Day Pilot`:

```yaml
      - Media:
          - Jellyfin:
              href: http://jellyfin.homeserver
              description: Media-Server & Live-TV
              icon: jellyfin.svg
          - Home Assistant:
              href: http://homeassistant.homeserver
              description: Home Automation
              icon: home-assistant.png
      - NAS:
          - Paperless-NGX:
              href: http://jays-ugreen:8000
              description: Dokumenten-Management
              icon: paperless-ngx.svg
          - OpenCode:
              href: http://jays-ugreen:4096
              description: KI-Coding-Assistent
              icon: mdi-robot
          - TinyTeller:
              href: http://jays-ugreen:3002
              description: Finanzen
              icon: https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/actual-budget.svg
          - Day Pilot:
              href: http://jays-ugreen:3003
              description: Tagesplanung
              icon: mdi-calendar-clock
      - Tools:
          - Pi-hole:
              href: http://pihole.homeserver/admin/login
              description: LAN-Adblock & DNS
              icon: pi-hole.svg
          - Gotify:
              href: http://gotify.homeserver
              description: Push-Notifications
              icon: gotify.svg
          - MinIO:
              href: http://minio.homeserver
              description: S3 Artifact Store
              icon: minio.svg
          - Gameserver-UI:
              href: http://gameserver.homeserver
              description: 7DTD KubeVirt VM-Verwaltung
              icon: mdi-zombie

    bookmarks: []
```

- [ ] **Schritt 2: Vollständige Datei-Struktur prüfen — alle 4 Sektionen vorhanden, Gaming weg**

```bash
python3 -c "
import yaml
v = yaml.safe_load(open('argocd/apps/homepage/values.yaml'))
svc = v['homepage']['config']['services']
sections = [list(s.keys())[0] for s in svc]
print('Sektionen:', sections)
layout = list(v['homepage']['config']['settings']['layout'].keys())
print('Layout:', layout)
assert sections == layout, 'Mismatch!'
print('OK — Services und Layout stimmen überein')
"
```

Erwartete Ausgabe:
```
Sektionen: ['Cluster', 'Media', 'NAS', 'Tools']
Layout: ['Cluster', 'Media', 'NAS', 'Tools']
OK — Services und Layout stimmen überein
```

- [ ] **Schritt 3: Commit**

```bash
git add argocd/apps/homepage/values.yaml
git commit -m "refactor(homepage): Media/NAS/Tools bereinigt, Gaming → Tools, Icons gefixt"
```

---

### Task 6: Visuelle Verifikation via Playwright

**Files:**
- Keine Dateiänderungen

> **Hinweis:** ArgoCD synct nur von `main`. Lint läuft vor dem PR; Screenshot und Rollout-Check laufen **nach dem Merge**.

- [ ] **Schritt 1: Lint lokal ausführen (vor dem PR)**

Aus dem Repo-Root:

```bash
make lint
# Erwartet: yamllint + helm lint grün, keine Fehler
```

- [ ] **Schritt 2: Nach Merge — ArgoCD-Sync abwarten**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n homepage rollout status deployment homepage-homepage --timeout=120s'
# Erwartet: deployment "homepage-homepage" successfully rolled out
```

- [ ] **Schritt 3: After-Screenshot aufnehmen**

Via Playwright MCP:
```
browser_resize(width=1400, height=3000)
browser_navigate("http://home.homeserver")
browser_take_screenshot(filename="docs/screenshots/homepage-after-redesign.png")
```

- [ ] **Schritt 4: Checkliste visuell abhaken**

Anhand des Screenshots prüfen:

| Prüfpunkt | Erwartet |
|---|---|
| Erste Sektion | `Cluster` mit 2 Reihen à 3 Kacheln |
| Reihe 1 | ArgoCD (mit Widget), Grafana (mit Widget), Headlamp |
| Reihe 2 | Argo Workflows, Semaphore (⚙️ Ansible-Icon), kubeseal-webgui |
| Semaphore-Icon | Ansible-Zahnrad, kein ⋮ |
| Media | 2 Kacheln nebeneinander (nicht 4 Spalten) |
| NAS | 4 Kacheln, Day Pilot mit Kalender-Icon, OpenCode mit Robot-Icon |
| Tools | 4 Kacheln, letzter Eintrag: Gameserver-UI mit Zombie-Icon |
| Gaming-Sektion | nicht vorhanden |

---

### Task 7: PR erstellen

**Files:**
- Keine Dateiänderungen

- [ ] **Schritt 1: PR öffnen**

```bash
gh pr create \
  --title "refactor(homepage): Layout-Redesign — 7 Sektionen → 4, Icon-Fixes" \
  --body "## Was
- GitOps & CI/CD + Kubernetes + Monitoring → **Cluster** (columns: 3)
- Media: columns 4 → 2
- Tools: Gameserver-UI aufgenommen (columns: 4)
- Gaming-Sektion entfernt

## Icon-Fixes
| Dienst | Alt | Neu |
|---|---|---|
| Semaphore | selfhst CDN (rendert als ⋮) | \`mdi-ansible\` |
| OpenCode | walkxcode CDN (403) | \`mdi-robot\` |
| Day Pilot | \`homer.svg\` (falsch) | \`mdi-calendar-clock\` |

## Getestet
- [ ] Playwright-Screenshots vor/nach
- [ ] \`make lint\` grün
- [ ] ArgoCD-Sync erfolgreich

Closes #<issue>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Schritt 2: CI abwarten**

```bash
gh run list --branch feat/homepage-layout-redesign --limit 3
# Erwartet: lint ✓, security ✓
```
