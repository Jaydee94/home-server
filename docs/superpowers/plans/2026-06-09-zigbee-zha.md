# Zigbee ZHA USB-Passthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sonoff Zigbee Dongle Plus MG24 via USB-Passthrough dem Home-Assistant-Pod zugänglich machen und ZHA konfigurieren.

**Architecture:** `securityContext.privileged: true` + `additionalVolumes`/`additionalMounts` im pajikos-Helm-Chart mounten das serielle Device als `CharDevice` vom Host in den Pod. ZHA wird danach einmalig in der HA-UI eingerichtet.

**Tech Stack:** Helm (pajikos/home-assistant-helm-chart v0.3.63), Kubernetes hostPath, ArgoCD GitOps, Home Assistant ZHA (EZSP/EmberZNet)

---

## Dateien

| Datei | Änderung |
|-------|----------|
| `argocd/apps/home-assistant/values.yaml` | `securityContext`, `additionalVolumes`, `additionalMounts` ergänzen |
| `docs/17-homeassistant.md` | Abschnitt „Zigbee via ZHA" hinzufügen |

---

## Task 1: Baseline verifizieren — Device im aktuellen Pod NICHT vorhanden

- [ ] **Step 1: Prüfen dass das Device aktuell NICHT im Pod erreichbar ist**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec deploy/home-assistant -- \
   ls /dev/ttyUSB0 2>&1 || true'
```

Erwartetes Ergebnis: `ls: /dev/ttyUSB0: No such file or directory`

- [ ] **Step 2: Device-Pfad auf dem Host nochmals bestätigen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'ls -la /dev/serial/by-id/ && ls -la /dev/ttyUSB* 2>/dev/null || echo "kein ttyUSB"'
```

Erwartetes Ergebnis:
```
lrwxrwxrwx ... usb-SONOFF_SONOFF_Dongle_Plus_MG24_46718ac707a3ef11a29a8c6661ce3355-if00-port0 -> ../../ttyUSB0
```

---

## Task 2: `values.yaml` — USB-Passthrough konfigurieren

**Datei:** `argocd/apps/home-assistant/values.yaml`

- [ ] **Step 1: Aktuelle `values.yaml` lesen**

```bash
cat argocd/apps/home-assistant/values.yaml
```

- [ ] **Step 2: Drei Blöcke unter `home-assistant:` ergänzen**

Direkt nach dem `env:`-Block einfügen:

```yaml
  securityContext:
    privileged: true

  additionalVolumes:
    - name: zigbee-dongle
      hostPath:
        path: /dev/serial/by-id/usb-SONOFF_SONOFF_Dongle_Plus_MG24_46718ac707a3ef11a29a8c6661ce3355-if00-port0
        type: CharDevice

  additionalMounts:
    - name: zigbee-dongle
      mountPath: /dev/ttyUSB0
```

- [ ] **Step 3: YAML-Lint lokal prüfen**

```bash
yamllint argocd/apps/home-assistant/values.yaml
```

Erwartetes Ergebnis: keine Fehler (leere Ausgabe oder nur Warnings)

- [ ] **Step 4: Helm-Template rendern und Device-Mount prüfen**

```bash
helm template home-assistant argocd/apps/home-assistant \
  --dependency-update 2>/dev/null | \
  grep -A5 "zigbee-dongle"
```

Erwartetes Ergebnis: Volume und VolumeMount tauchen im gerenderten StatefulSet auf.

- [ ] **Step 5: Committen und pushen**

```bash
git add argocd/apps/home-assistant/values.yaml
git commit -m "feat(home-assistant): add Zigbee dongle USB passthrough via ZHA

Mounts Sonoff Zigbee Dongle Plus MG24 (/dev/serial/by-id/usb-SONOFF_...)
as /dev/ttyUSB0 into the HA pod via privileged securityContext +
additionalVolumes/additionalMounts (pajikos chart).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

---

## Task 3: ArgoCD-Sync und Pod-Neustart verifizieren

- [ ] **Step 1: ArgoCD-Sync abwarten (max. 3 Minuten)**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant rollout status statefulset/home-assistant --timeout=180s'
```

Erwartetes Ergebnis: `statefulset rolling update complete 1 pods at revision home-assistant-...`

- [ ] **Step 2: Device im Pod vorhanden prüfen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec deploy/home-assistant -- \
   ls -la /dev/ttyUSB0'
```

Erwartetes Ergebnis: `crw-rw---- 1 root dialout 188, 0 ... /dev/ttyUSB0`

- [ ] **Step 3: ZHA-fähige Geräte aus dem Container heraus sehen**

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec deploy/home-assistant -- \
   ls /dev/ttyUSB0 /dev/serial/by-id/ 2>&1'
```

Erwartetes Ergebnis: Device sichtbar, kein Fehler.

---

## Task 4: ZHA in Home Assistant einrichten (einmaliger UI-Schritt)

- [ ] **Step 1: HA-UI öffnen**

  http://homeassistant.homeserver → Settings → Devices & Services

- [ ] **Step 2: ZHA-Integration hinzufügen**

  „Add Integration" → Suche: **ZHA** → auswählen

- [ ] **Step 3: Device-Pfad eintragen**

  - Serial Device Path: `/dev/ttyUSB0`
  - Radio type: **EZSP** (EFR32MG24 = EmberZNet Serial Protocol, NICHT ZNP auswählen)

- [ ] **Step 4: Integration bestätigen**

  HA zeigt „ZHA" mit dem Koordinator-Device an. Kein Fehler „Connection refused" oder „No such file".

> ZHA-Konfiguration persistiert in `/config/.storage/core.config_entries` auf dem PVC — überlebt Pod-Restarts automatisch.

---

## Task 5: Dokumentation aktualisieren

**Datei:** `docs/17-homeassistant.md`

- [ ] **Step 1: Abschnitt „Zigbee via ZHA" ans Ende der Datei anhängen**

```markdown
## Zigbee via ZHA

Zigbee-Koordinator: **Sonoff Zigbee Dongle Plus MG24** (EFR32MG24, CP210x UART).

**USB-Passthrough:** Das Device ist im Home-Assistant-Pod unter `/dev/ttyUSB0`
eingehängt (stabiler Symlink vom Host: `/dev/serial/by-id/usb-SONOFF_...-if00-port0`).
Konfiguration in `argocd/apps/home-assistant/values.yaml` unter
`additionalVolumes` / `additionalMounts` + `securityContext.privileged: true`.

**ZHA-Onboarding** (einmalig nach erstem Deploy):
1. HA-UI → Settings → Devices & Services → Add Integration → ZHA
2. Serial Device Path: `/dev/ttyUSB0`
3. Radio type: **EZSP** (EmberZNet — nicht ZNP!)

**Gotchas:**
- `privileged: true` ist zwingend — k3s hat keinen USB-Device-Plugin.
- Kein direkter `/dev/ttyUSB0`-Mount vom Host (Nummer nach Reboot instabil) —
  stattdessen `by-id`-Symlink als `CharDevice` im hostPath.
- Chip ist EFR32MG24 (EZSP-Protokoll) — wer ZNP auswählt bekommt keine Verbindung.
```

- [ ] **Step 2: Committen und pushen**

```bash
git add docs/17-homeassistant.md
git commit -m "docs(home-assistant): add Zigbee ZHA setup documentation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```
