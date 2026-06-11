# 17 – Home Assistant

Home Assistant läuft als ArgoCD-App im k3s-Cluster (pajikos Helm-Chart, Config
auf `local-path`-PVC). Erweiterungen (Lovelace-Karten, Custom-Integrationen,
Themes) werden **GitOps-reproduzierbar per Init-Container bzw. ConfigMap**
eingebracht – bewusst **ohne HACS**, damit jede Version dem Git-Stand entspricht
und Renovate Updates automatisiert.

| | |
|---|---|
| URL | <http://homeassistant.homeserver> (LAN + Tailnet, von Pi-hole aufgelöst) |
| Namespace | `home-assistant` |
| Chart | `argocd/apps/home-assistant/` (pajikos `home-assistant` 0.3.64, App 2025.6) |

## Erweiterungs-Architektur

```
k3s ─ home-assistant Pod
   ├─ initContainer "install-bubble-card"            → /config/www/bubble-card.js
   ├─ initContainer "install-hourly-weather"         → /config/www/hourly-weather/hourly-weather.js
   ├─ initContainer "install-ai-automation-suggester" → /config/custom_components/ai_automation_suggester
   ├─ initContainer "install-dreame-vacuum"          → /config/custom_components/dreame_vacuum
   ├─ ConfigMap "ha-theme-midnight" (subPath-Mount)  → /config/themes/midnight.yaml
   ├─ HA-Container (lädt Karten/Integrationen/Themes beim Start)
   └─ config-PVC (local-path, 10Gi) → /config  (DB, .storage, www, custom_components, themes)
```

Jeder Init-Container nutzt `alpine:3.24`, lädt das **gepinnte** Release und kopiert
es idempotent in den geteilten `/config`-PVC (Ziel wird vorher überschrieben bzw.
gelöscht). Die `# renovate:`-Annotation über jedem Container sorgt dafür, dass
Renovate (regex-Manager in `renovate.json`) bei neuen Releases automatisch PRs für
das `VERSION=`-Pin öffnet.

**Update einer Erweiterung:** `VERSION` in `values.yaml` anheben (oder den
Renovate-PR mergen) → push → ArgoCD synct → Pod startet neu → der Init-Container
kopiert die neue Version.

> **Lovelace-Ressourcen registrieren (einmalig):** HA läuft im Storage-/UI-Modus.
> Frontend-Karten (Bubble-Card, Hourly Weather) müssen nach dem ersten Pod-Start
> **einmal manuell** als Ressource hinterlegt werden:
> *Einstellungen → Dashboards → ⋮ → Ressourcen → Hinzufügen*. Die Registrierung
> persistiert in `/config/.storage` auf dem PVC und überlebt Pod-Restarts.

## Bubble-Card (Lovelace) — #86

Modernes Bubble-UI mit Pop-up-Overlays, Button-Stacks und Media-Controls.

- Init-Container `install-bubble-card`, bezieht die gebaute
  `dist/bubble-card.js` aus dem Repo-Tree am Tag (`Clooos/Bubble-Card`). Bubble-Card
  v3 liefert **kein** Release-Asset mehr – die Datei liegt im `dist/`-Ordner
  (so installiert auch HACS gemäß `hacs.json`).
- Lovelace-Ressource registrieren: URL `/local/bubble-card.js`, Typ
  **JavaScript-Modul**.
- Danach im Dashboard verfügbar unter *Karte hinzufügen → Bubble Card*.

## Hourly Weather Card (Lovelace) — #88

Visualisiert die kommenden Wetterbedingungen als farbigen Balken.

- Init-Container `install-hourly-weather`, Asset `hourly-weather.js`
  (`decompil3d/lovelace-hourly-weather`). **Hinweis:** dieses Repo taggt **ohne**
  `v`-Präfix (z. B. `6.8.0`), die Download-URL ist entsprechend ohne `v`.
- Lovelace-Ressource registrieren: URL `/local/hourly-weather/hourly-weather.js`,
  Typ **JavaScript-Modul**.
- Beispiel-Konfiguration (benötigt eine Wetter-Entity):

  ```yaml
  type: custom:hourly-weather
  entity: weather.dein_wetter
  num_segments: 12
  name: Nächste 12 Stunden
  ```

## AI Automation Suggester (Integration) — #89

LLM-gestützte Automatisierungsvorschläge auf Basis der eigenen Entities, Geräte
und Bereiche.

- Init-Container `install-ai-automation-suggester`, kopiert das
  `custom_components/ai_automation_suggester`-Verzeichnis aus dem Release-Tarball
  (`ITSpecialist111/ai_automation_suggester`).
- Config-Flow: *Einstellungen → Geräte & Dienste → + Integration hinzufügen →
  AI Automation Suggester*. Dort Provider + API-Key wählen.
- **Provider:** Da der Stack ohnehin Claude nutzt, bietet sich **Anthropic**
  (`claude-sonnet-4-6`) an. Der API-Key wird **nicht** in Git gehalten – er wird
  einmalig im UI-Config-Flow eingetragen und von HA in `/config/.storage`
  persistiert.

## Dreame Vacuum (Integration) — #90

Vollständige Steuerung für Dreame-Saugroboter (Live-Karte, Zimmer-Cleaning,
Automations-Events). Getestet für den **Dreame D9 Max** (`dreame.vacuum.p2259`).

- Init-Container `install-dreame-vacuum`, kopiert
  `custom_components/dreame_vacuum` aus dem Release-Tarball (`Tasshack/dreame-vacuum`).
- Config-Flow: *Einstellungen → Geräte & Dienste → + Integration → Dreame Vacuum*.
- **Lokale Verbindung (empfohlen):** Geräte-IP (FritzBox-DHCP-Reservierung) +
  Miio-Token. Token einmalig extrahieren:

  ```bash
  pip install python-miio
  miiocli discover --handshake 1
  ```

  Alternativ Xiaomi-Cloud-Login (kein Token, aber Cloud-Abhängigkeit).

## Midnight Theme — #91

Dunkles Community-Theme
([home-assistant-community-themes/midnight](https://github.com/home-assistant-community-themes/midnight)).
Da es kein versioniertes Release-Artefakt gibt, wird das Theme-YAML **direkt im
Repo versioniert** und als ConfigMap bereitgestellt.

- `templates/midnight-theme-configmap.yaml` enthält das vollständige Theme-YAML
  (ConfigMap `ha-theme-midnight`).
- In `values.yaml` als `additionalVolumes`/`additionalMounts` per `subPath` nach
  `/config/themes/midnight.yaml` gemountet.
- `frontend.themes: !include_dir_merge_named themes` ist **bereits** im
  Chart-Default-`templateConfig` aktiv – es ist keine Config-Anpassung nötig.
- Aktivieren: *Profil → Theme → midnight* (oder Service-Call
  `frontend.set_theme`).

## Verifikation

```bash
# ArgoCD-App synced & healthy
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n argocd get applications home-assistant'

# Frontend-Karten im PVC vorhanden
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec deploy/home-assistant -- \
   ls -la /config/www/bubble-card.js /config/www/hourly-weather/hourly-weather.js'

# Custom-Integrations vorhanden
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec deploy/home-assistant -- \
   ls /config/custom_components/ai_automation_suggester/manifest.json \
      /config/custom_components/dreame_vacuum/manifest.json'

# Midnight-Theme + ConfigMap
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant get configmap ha-theme-midnight && \
   sudo kubectl -n home-assistant exec deploy/home-assistant -- \
   head -5 /config/themes/midnight.yaml'

# Init-Container-Logs (Pod-Name vorher mit `get pods` holen)
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant logs <pod> -c install-bubble-card'
```

## Zigbee via ZHA

Zigbee-Koordinator: **Sonoff Zigbee Dongle Plus MG24** (EFR32MG24-Chip, CP210x UART-Bridge).

| | |
|---|---|
| Host-Device | `/dev/serial/by-id/usb-SONOFF_SONOFF_Dongle_Plus_MG24_46718ac707a3ef11a29a8c6661ce3355-if00-port0` → `/dev/ttyUSB0` |
| Pod-Pfad | `/dev/ttyUSB0` (via `additionalVolumes`/`additionalMounts` im pajikos-Chart) |
| Protokoll | **EZSP** (EmberZNet Serial Protocol) |
| SecurityContext | `privileged: true` (nötig für USB-Device-Zugriff in k3s) |

**ZHA-Onboarding** (einmalig nach erstem Deploy):

1. <http://homeassistant.homeserver> → Settings → Devices & Services → **Add Integration** → ZHA
2. Serial Device Path: `/dev/ttyUSB0`
3. Radio type: **EZSP** (EmberZNet — nicht ZNP auswählen!)
4. Koordinator erscheint unter Devices & Services; Zigbee-Geräte können jetzt gepaired werden.

ZHA-Konfiguration persistiert in `/config/.storage/core.config_entries` auf dem PVC — überlebt Pod-Restarts.

**Verifikation:**

```bash
# Device im Pod prüfen
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec home-assistant-0 -- ls -la /dev/ttyUSB0'
# Erwartet: crw-rw---- 1 root dialout 188, 0 ...
```

**Gotchas:**

- `privileged: true` ist zwingend — k3s hat keinen USB-Device-Plugin; ohne Privilegien ist das CharDevice im Pod nicht zugänglich.
- Kein direkter `/dev/ttyUSB0`-Mount vom Host-Pfad verwenden — die Nummer ist nach Reboot instabil wenn weitere USB-Geräte vorhanden sind. Stattdessen den `by-id`-Symlink als `CharDevice` nutzen.
- Chip ist EFR32MG24 → **EZSP**-Protokoll. ZNP ist für Texas-Instruments-Chips (CC2652) — falsche Auswahl führt zu Verbindungsfehler.

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| Karte/Integration fehlt nach Deploy | Pod nicht neu gestartet oder Init-Container fehlgeschlagen → Init-Container-Log prüfen; Pod rollen: `kubectl -n home-assistant rollout restart deploy/home-assistant`. |
| Lovelace-Karte „Custom element doesn't exist" | Ressource nicht registriert oder falsche URL → *Einstellungen → Dashboards → Ressourcen* prüfen (`/local/...`, Typ JavaScript-Modul); Browser-Cache leeren. |
| Init-Container `cp: no such file` nach Major-Update | Bei einem Major-Release kann sich der Ordnername im Tarball ändern → Pfad in `values.yaml` an das neue Release anpassen. |
| `curl: not found` im Init-Container | `apk add --no-cache curl` fehlt — alpine bringt curl nicht mit. |
| Midnight-Theme nicht wählbar | ConfigMap nicht gemountet oder `frontend.themes` nicht aktiv → `kubectl get configmap ha-theme-midnight`; Datei im Pod prüfen (`/config/themes/midnight.yaml`). |
