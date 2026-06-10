# Mosquitto Upstream Chart Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom Mosquitto Helm Chart durch helmforgedev/mosquitto v1.3.1 als Wrapper-Dependency ersetzen.

**Architecture:** Wrapper-Chart-Pattern (identisch zu argocd/apps/home-assistant). helmforgedev übernimmt StatefulSet, ConfigMap, PVC, ClusterIP-Service. Zwei eigene Templates: SealedSecret (username+password) und service-lan.yaml (LoadBalancer + MetalLB). Kein Docker, kein lokales mosquitto_passwd nötig — das Chart generiert die passwd-Datei selbst per Init-Container.

**Tech Stack:** Helm 3, helmforgedev/mosquitto v1.3.1, SealedSecrets (bitnami), MetalLB, k3s

---

## File Map

| Aktion | Pfad |
|---|---|
| Löschen | `argocd/apps/mosquitto/templates/deployment.yaml` |
| Löschen | `argocd/apps/mosquitto/templates/configmap.yaml` |
| Löschen | `argocd/apps/mosquitto/templates/pvc.yaml` |
| Löschen | `argocd/apps/mosquitto/templates/service.yaml` |
| Löschen | `argocd/apps/mosquitto/templates/serviceaccount.yaml` |
| Löschen | `argocd/apps/mosquitto/templates/_helpers.tpl` |
| Löschen | `argocd/apps/mosquitto/templates/sealedsecret.yaml` |
| Neuschreiben | `argocd/apps/mosquitto/Chart.yaml` |
| Neuschreiben | `argocd/apps/mosquitto/values.yaml` |
| Erstellen | `argocd/apps/mosquitto/charts/mosquitto-1.3.1.tgz` (via helm dep update) |
| Erstellen | `argocd/apps/mosquitto/templates/sealedsecret.yaml` |
| Erstellen | `argocd/apps/mosquitto/templates/service-lan.yaml` |
| Aktualisieren | `docs/18-nuki-mqtt.md` |

---

### Task 1: Alten Chart-Inhalt entfernen

**Files:**
- Delete: `argocd/apps/mosquitto/templates/deployment.yaml`
- Delete: `argocd/apps/mosquitto/templates/configmap.yaml`
- Delete: `argocd/apps/mosquitto/templates/pvc.yaml`
- Delete: `argocd/apps/mosquitto/templates/service.yaml`
- Delete: `argocd/apps/mosquitto/templates/serviceaccount.yaml`
- Delete: `argocd/apps/mosquitto/templates/_helpers.tpl`
- Delete: `argocd/apps/mosquitto/templates/sealedsecret.yaml`
- Delete: `argocd/apps/mosquitto/values.yaml`
- Delete: `argocd/apps/mosquitto/Chart.yaml`

- [ ] **Alte Templates und Chart-Dateien löschen**

```bash
rm argocd/apps/mosquitto/templates/deployment.yaml \
   argocd/apps/mosquitto/templates/configmap.yaml \
   argocd/apps/mosquitto/templates/pvc.yaml \
   argocd/apps/mosquitto/templates/service.yaml \
   argocd/apps/mosquitto/templates/serviceaccount.yaml \
   argocd/apps/mosquitto/templates/_helpers.tpl \
   argocd/apps/mosquitto/templates/sealedsecret.yaml \
   argocd/apps/mosquitto/values.yaml \
   argocd/apps/mosquitto/Chart.yaml
```

- [ ] **Prüfen dass nur `templates/` (leer) noch vorhanden**

```bash
find argocd/apps/mosquitto -type f
```

Erwartet: keine Ausgabe (nur leeres `templates/`-Verzeichnis).

---

### Task 2: Chart.yaml mit helmforgedev-Dependency schreiben

**Files:**
- Create: `argocd/apps/mosquitto/Chart.yaml`

- [ ] **Schreibe `argocd/apps/mosquitto/Chart.yaml`**

```yaml
---
apiVersion: v2
name: mosquitto
description: |
  Eclipse Mosquitto MQTT broker — wrapper around helmforgedev/mosquitto.
  Dedicated MetalLB LAN IP 192.168.178.4:1883 for Nuki Smart Lock Pro.
  HA connects internally via ClusterIP. Setup: docs/18-nuki-mqtt.md.
type: application
version: 0.2.0
appVersion: "2.0.22"
keywords:
  - mosquitto
  - mqtt
  - home-assistant
  - nuki
home: https://mosquitto.org
sources:
  - https://github.com/eclipse/mosquitto
  - https://github.com/helmforgedev/charts/tree/main/charts/mosquitto
maintainers:
  - name: home-server-admin
dependencies:
  # renovate: datasource=helm depName=mosquitto registryUrl=https://repo.helmforge.dev
  - name: mosquitto
    repository: https://repo.helmforge.dev
    version: "1.3.1"
```

- [ ] **Syntax prüfen**

```bash
helm lint argocd/apps/mosquitto
```

Erwartet: `1 chart(s) linted, 0 chart(s) failed` (Chart.lock fehlt noch — das ist OK).

---

### Task 3: Helm Dependency vendoren

**Files:**
- Create: `argocd/apps/mosquitto/charts/mosquitto-1.3.1.tgz`
- Create: `argocd/apps/mosquitto/Chart.lock`

- [ ] **Dependency herunterladen und vendoren**

```bash
helm repo add helmforgedev https://repo.helmforge.dev
helm dependency update argocd/apps/mosquitto
```

Erwartet:
```
Saving 1 charts
Downloading mosquitto from repo https://repo.helmforge.dev
Deleting outdated charts
```

- [ ] **Prüfen dass .tgz vorhanden ist**

```bash
ls argocd/apps/mosquitto/charts/
```

Erwartet: `mosquitto-1.3.1.tgz`

- [ ] **Zwischencommit**

```bash
git add argocd/apps/mosquitto/Chart.yaml \
        argocd/apps/mosquitto/Chart.lock \
        argocd/apps/mosquitto/charts/mosquitto-1.3.1.tgz
git commit -m "chore(mosquitto): replace custom chart with helmforgedev wrapper skeleton"
```

---

### Task 4: values.yaml schreiben

**Files:**
- Create: `argocd/apps/mosquitto/values.yaml`

- [ ] **Schreibe `argocd/apps/mosquitto/values.yaml`**

```yaml
---
# Top-level: für die eigenen Templates (sealedsecret.yaml, service-lan.yaml).
# Solange leer, wird kein SealedSecret gerendert — erst nach Eintragen der
# versiegelten Werte (kubeseal-webgui, siehe docs/18-nuki-mqtt.md).
sealedSecret:
  encryptedUsername: ""
  encryptedPassword: ""

# Alles unter 'mosquitto:' wird an den helmforgedev/mosquitto Chart weitergegeben.
mosquitto:
  image:
    tag: "2.0.22"

  broker:
    replicaCount: 1
    listeners:
      websocketEnabled: false
    persistence:
      enabled: true
      storageClass: local-path
      size: 1Gi
      accessMode: ReadWriteOnce

  auth:
    enabled: true
    # existingSecret verweist auf den SealedSecret "mosquitto-auth".
    # Der Init-Container liest username + password daraus und ruft
    # mosquitto_passwd intern auf — kein lokales Docker nötig.
    existingSecret: mosquitto-auth
    existingSecretUsernameKey: username
    existingSecretPasswordKey: password

  # ClusterIP für HA-internen Zugriff (mosquitto.mosquitto.svc.cluster.local:1883).
  # Der LAN-LoadBalancer (Nuki) wird durch service-lan.yaml bereitgestellt.
  service:
    type: ClusterIP

  resources:
    requests:
      cpu: 20m
      memory: 32Mi
    limits:
      cpu: 200m
      memory: 128Mi
```

- [ ] **Prüfen: `helm template` rendert StatefulSet und ConfigMap**

```bash
helm template mosquitto argocd/apps/mosquitto | grep "^kind:" | sort | uniq
```

Erwartet (u.a.):
```
kind: ConfigMap
kind: ServiceAccount
kind: StatefulSet
kind: Service
```

---

### Task 5: sealedsecret.yaml schreiben

**Files:**
- Create: `argocd/apps/mosquitto/templates/sealedsecret.yaml`

- [ ] **Schreibe `argocd/apps/mosquitto/templates/sealedsecret.yaml`**

```yaml
{{- if and .Values.sealedSecret.encryptedUsername .Values.sealedSecret.encryptedPassword -}}
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: mosquitto-auth
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/name: mosquitto
    app.kubernetes.io/instance: {{ .Release.Name }}
    app.kubernetes.io/managed-by: {{ .Release.Service }}
spec:
  encryptedData:
    username: {{ .Values.sealedSecret.encryptedUsername | quote }}
    password: {{ .Values.sealedSecret.encryptedPassword | quote }}
  template:
    metadata:
      name: mosquitto-auth
      namespace: {{ .Release.Namespace }}
    type: Opaque
{{- end }}
```

- [ ] **Prüfen: ohne Werte kein SealedSecret gerendert**

```bash
helm template mosquitto argocd/apps/mosquitto | grep -c "SealedSecret"
```

Erwartet: `0`

- [ ] **Prüfen: mit Testwerten wird SealedSecret gerendert**

```bash
helm template mosquitto argocd/apps/mosquitto \
  --set sealedSecret.encryptedUsername="AgABC123" \
  --set sealedSecret.encryptedPassword="AgDEF456" \
  | grep "kind: SealedSecret"
```

Erwartet: `kind: SealedSecret`

---

### Task 6: service-lan.yaml schreiben

**Files:**
- Create: `argocd/apps/mosquitto/templates/service-lan.yaml`

Der helmforgedev-Chart unterstützt kein `loadBalancerClass` (nötig um k3s Klipper
vom Service fernzuhalten). Dieser Service ergänzt einen dedizierten LoadBalancer
für LAN-Geräte (Nuki Smart Lock Pro) mit korrektem MetalLB-Setup.

- [ ] **Schreibe `argocd/apps/mosquitto/templates/service-lan.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mosquitto-lan
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/name: mosquitto
    app.kubernetes.io/instance: {{ .Release.Name }}
    app.kubernetes.io/component: broker
    app.kubernetes.io/managed-by: {{ .Release.Service }}
  annotations:
    metallb.io/address-pool: mosquitto
spec:
  type: LoadBalancer
  # loadBalancerClass verhindert dass k3s Klipper diesen Service beansprucht.
  # Ohne diese Angabe würden Klipper und MetalLB beide versuchen die IP zuzuweisen
  # und der Service bliebe <pending> oder bekäme zwei EXTERNAL-IPs.
  loadBalancerClass: metallb.universe.tf/metallb
  loadBalancerIP: 192.168.178.4
  externalTrafficPolicy: Cluster
  ports:
    - name: mqtt
      port: 1883
      targetPort: 1883
      protocol: TCP
  selector:
    app.kubernetes.io/name: mosquitto
    app.kubernetes.io/instance: {{ .Release.Name }}
    app.kubernetes.io/component: broker
```

- [ ] **Prüfen: service-lan hat typ LoadBalancer und korrekte loadBalancerClass**

```bash
helm template mosquitto argocd/apps/mosquitto \
  | yq 'select(.kind == "Service" and .metadata.name == "mosquitto-lan") | .spec'
```

Erwartet:
```yaml
type: LoadBalancer
loadBalancerClass: metallb.universe.tf/metallb
loadBalancerIP: 192.168.178.4
```

Falls `yq` nicht vorhanden: `brew install yq`

- [ ] **Prüfen: ClusterIP-Service von helmforgedev KEIN loadBalancerClass**

```bash
helm template mosquitto argocd/apps/mosquitto \
  | yq 'select(.kind == "Service" and .metadata.name == "mosquitto") | .spec.type'
```

Erwartet: `ClusterIP`

---

### Task 7: Vollständiger helm-template und lint Test

- [ ] **Alle gerenderten Ressourcen prüfen**

```bash
helm template mosquitto argocd/apps/mosquitto \
  --set sealedSecret.encryptedUsername="AgABC123" \
  --set sealedSecret.encryptedPassword="AgDEF456" \
  | grep "^kind:" | sort | uniq
```

Erwartet:
```
kind: ConfigMap
kind: SealedSecret
kind: Service
kind: Service
kind: ServiceAccount
kind: StatefulSet
```

- [ ] **Helm lint**

```bash
helm lint argocd/apps/mosquitto
```

Erwartet: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Prüfen: Auth-Init-Container nutzt Secret mosquitto-auth**

```bash
helm template mosquitto argocd/apps/mosquitto \
  | yq 'select(.kind == "StatefulSet") | .spec.template.spec.initContainers[0].env[] | select(.name == "AUTH_USERNAME") | .valueFrom.secretKeyRef.name'
```

Erwartet: `mosquitto-auth`

- [ ] **Commit**

```bash
git add argocd/apps/mosquitto/
git commit -m "feat(mosquitto): migrate to helmforgedev upstream chart wrapper"
```

---

### Task 8: docs/18-nuki-mqtt.md aktualisieren

**Files:**
- Modify: `docs/18-nuki-mqtt.md`

Credentials-Workflow vereinfacht: kein Docker mehr, kein `mosquitto_passwd` lokal.
Nur noch zwei Keys per kubeseal-webgui versiegeln.

- [ ] **Abschnitt „Broker-Credentials erzeugen & versiegeln" ersetzen**

Den bisherigen Abschnitt (Docker-Befehl + kubeseal) durch folgenden Inhalt ersetzen:

```markdown
## Broker-Credentials erzeugen & versiegeln

Der Broker verlangt Authentifizierung. Der helmforgedev-Chart generiert die
`mosquitto_passwd`-Datei intern per Init-Container — kein lokales Docker nötig.

Zwei Keys per **kubeseal-webgui** versiegeln (<http://kubeseal-webgui.homeserver>):

| Feld | Wert |
|---|---|
| Namespace | `mosquitto` |
| Secret Name | `mosquitto-auth` |
| Secret Type | `Opaque` |

**Key 1:** `username` = `mqtt`
**Key 2:** `password` = `<dein Passwort>`

Jeden Key einzeln versiegeln → zwei verschlüsselte Strings erhalten.

Die Strings in `argocd/apps/mosquitto/values.yaml` eintragen:

```yaml
sealedSecret:
  encryptedUsername: "AgB..."   # ← String aus kubeseal-webgui (Key: username)
  encryptedPassword: "AgB..."   # ← String aus kubeseal-webgui (Key: password)
```

Nach Commit + Push synct ArgoCD das SealedSecret und der Broker-Pod startet.

**Rotation:** Neue Werte in kubeseal-webgui erzeugen, `values.yaml` aktualisieren,
push. ArgoCD aktualisiert das Secret automatisch.
```

- [ ] **Abschnitt „Home Assistant: MQTT-Integration aktivieren" anpassen**

Den Broker-Hostnamen `mosquitto.mosquitto.svc.cluster.local` und User `mqtt`
(statt `homeassistant`) prüfen und ggf. korrigieren:

```markdown
1. http://homeassistant.homeserver → Einstellungen → Geräte & Dienste →
   *Integration hinzufügen* → **MQTT**
2. Broker: `mosquitto.mosquitto.svc.cluster.local`, Port `1883`
3. Benutzername `mqtt`, Passwort `<dein Passwort>`
4. MQTT-Discovery aktiviert lassen (Default-Präfix `homeassistant`)
```

- [ ] **Abschnitt „Nuki-App konfigurieren" anpassen**

User `mqtt` (statt `nuki`) — da wir nur einen gemeinsamen User haben:

```markdown
3. Broker-Host `192.168.178.4`, Port `1883`, Benutzer `mqtt`, Passwort `<dein Passwort>`
```

- [ ] **Verifikationsbefehl in docs anpassen**

```bash
# Auth erzwungen (anonym muss scheitern, mit User klappen)
mosquitto_sub -h 192.168.178.4 -p 1883 -t '#' -v            # → Connection Refused
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P <PW> -t '#' -v  # → OK
```

- [ ] **Commit**

```bash
git add docs/18-nuki-mqtt.md
git commit -m "docs(mosquitto): update credentials workflow for helmforgedev chart"
```

---

### Task 9: SealedSecret-Werte eintragen und PR erstellen

- [ ] **kubeseal-webgui öffnen: http://kubeseal-webgui.homeserver**

  - Namespace: `mosquitto`, Name: `mosquitto-auth`, Type: `Opaque`
  - Key `username` → Wert `mqtt` → verschlüsselten String kopieren
  - Key `password` → Wert `<dein Passwort>` → verschlüsselten String kopieren

- [ ] **Werte in values.yaml eintragen**

```yaml
# argocd/apps/mosquitto/values.yaml
sealedSecret:
  encryptedUsername: "AgB..."   # ← hier eintragen
  encryptedPassword: "AgB..."   # ← hier eintragen
```

- [ ] **Render prüfen: SealedSecret wird jetzt gerendert**

```bash
helm template mosquitto argocd/apps/mosquitto | grep "kind: SealedSecret"
```

Erwartet: `kind: SealedSecret`

- [ ] **Commit + Push**

```bash
git add argocd/apps/mosquitto/values.yaml
git commit -m "feat(mosquitto): add sealed credentials for mqtt user"
git push -u origin feat/mosquitto-upstream-chart
```

- [ ] **PR erstellen**

```bash
gh pr create \
  --title "feat(mosquitto): migrate to helmforgedev upstream chart" \
  --body "$(cat <<'EOF'
## Summary

- Ersetzt den eigenen Custom Helm Chart durch helmforgedev/mosquitto v1.3.1
- Wrapper-Pattern (wie home-assistant): zwei eigene Templates für SealedSecret + MetalLB-Service
- Ein gemeinsamer MQTT-User `mqtt` für Home Assistant und Nuki
- Kein lokales Docker / mosquitto_passwd mehr nötig — Init-Container im Chart erledigt das

## Was sich ändert

- `mosquitto` (ClusterIP) für HA-intern → `mosquitto.mosquitto.svc.cluster.local:1883`
- `mosquitto-lan` (LoadBalancer `192.168.178.4`) für Nuki
- HA und Nuki nutzen jetzt User `mqtt` statt separate User

## Test plan

- [ ] ArgoCD synct ohne Fehler
- [ ] Pod läuft (`kubectl -n mosquitto get pods`)
- [ ] `mosquitto-lan` hat EXTERNAL-IP `192.168.178.4`
- [ ] Anonyme Verbindung wird abgelehnt
- [ ] Verbindung mit `mqtt`/`<PW>` klappt
- [ ] HA MQTT-Integration verbindet sich
- [ ] Nuki erscheint in HA

Closes #<issue>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **CI Status prüfen**

```bash
gh run list --branch feat/mosquitto-upstream-chart
```

Erwartet: `lint` grün.
