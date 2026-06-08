# Home Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home Assistant auf k3s via ArgoCD deployen — Philips Hue Bridge integrieren, Traefik-Ingress einrichten, Homepage-Widget ergänzen.

**Architecture:** Helm-Chart `pajikos/home-assistant` als ArgoCD-App unter `argocd/apps/home-assistant/`. Persistenter Config-PVC (`local-path`, 10 Gi). Traefik-Ingress auf `homeassistant.homeserver` — Pi-hole-Wildcard deckt DNS bereits ab. Homepage-Widget mit Long-Lived Access Token (nach First-Run generiert).

**Tech Stack:** Helm 3, Kubernetes/k3s, ArgoCD, Traefik v2, `local-path` StorageClass, `homeassistant/home-assistant:stable` Image, Homepage Helm Chart

---

## Dateiübersicht

| Datei | Aktion | Zweck |
|---|---|---|
| `argocd/apps/home-assistant/Chart.yaml` | Erstellen | Helm-Wrapper, Dependency auf `pajikos/home-assistant` |
| `argocd/apps/home-assistant/values.yaml` | Erstellen | PVC, Ingress, Timezone, Resources |
| `argocd/apps/homepage/values.yaml` | Modifizieren | Home Assistant Widget ergänzen |

---

### Task 1: Branch anlegen

**Files:**
- (keine Dateiänderung)

- [ ] **Schritt 1: Feature-Branch erstellen**

```bash
git checkout -b feat/home-assistant
```

Expected: `Switched to a new branch 'feat/home-assistant'`

---

### Task 2: Chart.yaml anlegen

**Files:**
- Erstellen: `argocd/apps/home-assistant/Chart.yaml`

- [ ] **Schritt 1: Verzeichnis und Datei anlegen**

```bash
mkdir -p argocd/apps/home-assistant
```

Inhalt von `argocd/apps/home-assistant/Chart.yaml`:

```yaml
apiVersion: v2
name: home-assistant
description: |
  Home Assistant home automation platform. Integrates with Philips Hue Bridge
  via LAN mDNS discovery. Config persisted on local-path PVC. Accessible at
  http://homeassistant.homeserver (LAN + Tailnet via Pi-hole wildcard DNS).
type: application
version: 0.1.0
appVersion: "stable"
keywords:
  - home-assistant
  - automation
  - hue
home: https://www.home-assistant.io
sources:
  - https://github.com/pajikos/home-assistant-helm-chart
maintainers:
  - name: home-server-admin
dependencies:
  # Community Helm chart for Home Assistant. Renovate bumps patch/minor automatically.
  - name: home-assistant
    repository: https://pajikos.github.io/home-assistant-helm-chart/
    version: "0.2.x"
```

- [ ] **Schritt 2: Helm-Dependency pullen (lokal validieren)**

```bash
cd argocd/apps/home-assistant && helm dependency update && cd ../../..
```

Expected: `Saving 1 charts` und `charts/home-assistant-0.2.x.tgz` wird angelegt.

> Hinweis: `charts/` ist in `.gitignore` — tgz-Datei nicht committen.

---

### Task 3: values.yaml anlegen

**Files:**
- Erstellen: `argocd/apps/home-assistant/values.yaml`

- [ ] **Schritt 1: values.yaml schreiben**

```yaml
home-assistant:
  image:
    # Empty tag → chart default (stable). Pin to a digest here if reproducibility
    # is needed. Renovate watches the `appVersion` in Chart.yaml instead.
    tag: ""

  persistence:
    config:
      enabled: true
      storageClass: local-path
      accessMode: ReadWriteOnce
      size: 10Gi

  # Web UI at http://homeassistant.homeserver — Pi-hole wildcard *.homeserver
  # already resolves this to 192.168.178.127 (Traefik). No separate DNS entry needed.
  ingress:
    enabled: true
    ingressClassName: traefik
    annotations: {}
    hosts:
      - host: homeassistant.homeserver
        paths:
          - path: /
            pathType: Prefix
    tls: []

  env:
    TZ: Europe/Berlin

  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: "2"
      memory: 2Gi
```

- [ ] **Schritt 2: Helm-Template lokal rendern und prüfen**

```bash
helm template home-assistant argocd/apps/home-assistant/ --debug 2>&1 | grep -E "kind:|name:|host:" | head -30
```

Expected: Zeilen mit `kind: Deployment`, `kind: PersistentVolumeClaim`, `kind: Ingress`, `host: homeassistant.homeserver`

- [ ] **Schritt 3: Helm lint ausführen**

```bash
make lint
```

Expected: Keine Fehler, evtl. Warnungen zu `appVersion` sind ok.

- [ ] **Schritt 4: Committen**

```bash
git add argocd/apps/home-assistant/
git commit -m "feat(home-assistant): add Helm chart and values for k3s deployment"
```

---

### Task 4: ArgoCD-Sync beobachten und HA erreichbar machen

**Files:**
- (keine Dateiänderung)

- [ ] **Schritt 1: Branch pushen**

```bash
git push -u origin feat/home-assistant
```

- [ ] **Schritt 2: PR erstellen und mergen**

```bash
gh pr create \
  --title "feat(home-assistant): deploy Home Assistant via ArgoCD" \
  --body "$(cat <<'EOF'
## Summary
- Adds `argocd/apps/home-assistant/` with Helm chart + values
- PVC 10 Gi local-path for `/config`
- Traefik Ingress auf `homeassistant.homeserver`
- Timezone: Europe/Berlin

## Test plan
- [ ] ArgoCD App `home-assistant` erscheint und wird `Healthy`/`Synced`
- [ ] `http://homeassistant.homeserver` lädt das HA-Onboarding
- [ ] PVC `home-assistant-config` ist `Bound`

Closes # (kein Issue, Design-Spec: docs/superpowers/specs/2026-06-08-home-assistant-design.md)
EOF
)"
```

- [ ] **Schritt 3: Nach dem Merge — ArgoCD-App-Status prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant get pods,pvc,ingress'
```

Expected:
```
NAME                                  READY   STATUS    RESTARTS   AGE
pod/home-assistant-...                1/1     Running   0          Xm

NAME                                                STATUS   VOLUME   CAPACITY
persistentvolumeclaim/home-assistant-config         Bound    ...      10Gi

NAME                                      CLASS     HOSTS
ingress.networking.k8s.io/home-assistant  traefik   homeassistant.homeserver
```

- [ ] **Schritt 4: HA im Browser öffnen**

URL: `http://homeassistant.homeserver`

Expected: Home Assistant Onboarding-Seite ("Welcome to Home Assistant")

---

### Task 5: First-Run Setup — HA konfigurieren

**Files:**
- (keine Dateiänderung — alles im HA-UI)

- [ ] **Schritt 1: Admin-Account anlegen**

Im Browser unter `http://homeassistant.homeserver`:
1. Name, Benutzername, Passwort setzen
2. Standort setzen (für Sonnenauf/-untergang-Trigger): z.B. Berlin

- [ ] **Schritt 2: Philips Hue Bridge integrieren**

`Einstellungen → Geräte & Dienste → Integration hinzufügen → Philips Hue`

HA erkennt die Bridge automatisch im LAN. Wenn nicht:
- Bridge-IP manuell eingeben (FritzBox → verbundene Geräte → "Philips-hue")
- Button auf der Bridge drücken wenn aufgefordert

Expected: Alle Hue-Lampen erscheinen als Entities unter `Einstellungen → Geräte & Dienste → Philips Hue`

- [ ] **Schritt 3: Long-Lived Access Token generieren**

`http://homeassistant.homeserver/profile` → "Sicherheit" → "Long-lived access tokens" → Token erstellen, **sofort kopieren** (wird nur einmal angezeigt)

Diesen Token für Task 6 (Homepage-Widget) aufbewahren.

---

### Task 6: Homepage-Widget ergänzen

**Files:**
- Modifizieren: `argocd/apps/homepage/values.yaml`

- [ ] **Schritt 1: Homepage values.yaml lesen**

```bash
grep -n "Media\|Jellyfin\|Smart\|Home" argocd/apps/homepage/values.yaml | head -20
```

- [ ] **Schritt 2: Home Assistant zur Homepage hinzufügen**

In `argocd/apps/homepage/values.yaml` den `Media`-Block um Home Assistant erweitern:

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
              widget:
                type: homeassistant
                url: http://home-assistant.home-assistant.svc.cluster.local:8123
                key: "{{HOMEPAGE_VAR_HA_TOKEN}}"
```

- [ ] **Schritt 3: Homepage SealedSecret für den Token anlegen**

Den Long-Lived Access Token aus Task 5 Schritt 3 als SealedSecret speichern:

```bash
# Token-Wert verschlüsseln (ersetze <TOKEN> durch den echten Wert)
echo -n "<TOKEN>" | kubeseal --raw \
  --namespace homepage \
  --name homepage-secrets \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets \
  --from-file=/dev/stdin
```

Den verschlüsselten Wert in `argocd/apps/homepage/templates/sealedsecret.yaml` unter dem Key `HA_TOKEN` ergänzen (analog zu `ARGOCD_TOKEN` falls vorhanden, sonst neues SealedSecret).

Existierenden SealedSecret-Aufbau prüfen:
```bash
cat argocd/apps/homepage/templates/sealedsecret.yaml 2>/dev/null || echo "noch kein SealedSecret"
```

- [ ] **Schritt 4: Lint + committen**

```bash
make lint
git add argocd/apps/homepage/values.yaml argocd/apps/homepage/templates/
git commit -m "feat(homepage): add Home Assistant widget"
git push
```

- [ ] **Schritt 5: Homepage neu laden und Widget prüfen**

`http://home.homeserver` — Home Assistant Widget sollte Geräte-Count und Status anzeigen.

---

### Task 7: Verifikation

**Files:**
- (keine Dateiänderung)

- [ ] **Schritt 1: Cluster-Health prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant get all,pvc'
```

Expected: Pod `1/1 Running`, PVC `Bound`, Service und Ingress vorhanden.

- [ ] **Schritt 2: HA-Logs auf Fehler prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant logs deployment/home-assistant --tail=50'
```

Expected: Keine `ERROR`-Zeilen, Meldungen wie `Starting Home Assistant` und `Connected to Philips Hue`

- [ ] **Schritt 3: Mobile-Zugriff testen**

iOS/Android: HA Companion App installieren → `http://homeassistant.homeserver` als Server eintragen.

Für Remote-Zugriff (außerhalb LAN): Tailscale einschalten → gleiche URL funktioniert.

- [ ] **Schritt 4: Erste Automation anlegen (optional, Day-1 Smoke-Test)**

`Einstellungen → Automationen → Neue Automation erstellen`:
- Trigger: Zeit (z.B. 22:00)
- Aktion: Licht ausschalten (eine Hue-Gruppe)
- Speichern und manuell auslösen zum Testen

---

## Hinweise

**Zigbee-Erweiterung (nicht jetzt):**  
Wenn ein USB-Dongle (z.B. Sonoff Zigbee 3.0 USB Plus) hinzukommt, `values.yaml` um folgendes ergänzen:
```yaml
home-assistant:
  securityContext:
    privileged: true
  hostNetwork: true
  extraVolumes:
    - name: usb
      hostPath:
        path: /dev/ttyUSB0
  extraVolumeMounts:
    - name: usb
      mountPath: /dev/ttyUSB0
```

**HA-Config liegt im PVC**, nicht im Git-Repo. Automationen, Integrationen und Dashboard-Layouts sind in `/config` im PVC gespeichert — kein GitOps für HA-interne Config.

**Monitoring (optional, später):**  
`VMServiceScrape` aus der Spec in `argocd/apps/home-assistant/templates/vmservicescrape.yaml` ergänzen sobald ein Prometheus-Token vorhanden ist.
