# Home Assistant

Home Assistant läuft im Cluster und steuert Zigbee-Geräte (ZHA), das Nuki-Schloss ([MQTT](18-nuki-mqtt.md)) und weitere Integrationen. Erweiterungen kommen ohne HACS über gepinnte Init-Container und eine ConfigMap ins PVC, damit jede Version dem Git-Stand entspricht und Renovate sie aktualisiert.

| | |
|---|---|
| URL | http://homeassistant.homeserver |
| Namespace | `home-assistant` |
| Quelle | [`argocd/apps/home-assistant/`](../argocd/apps/home-assistant/) |
| Chart | `pajikos/home-assistant` (Version in [`Chart.yaml`](../argocd/apps/home-assistant/Chart.yaml)), StatefulSet `home-assistant`, Pod `home-assistant-0` |
| Cluster-intern | `http://home-assistant.home-assistant.svc.cluster.local:8080` |

## Architektur

```text
home-assistant-0
 ├─ init install-bubble-card             -> /config/www/bubble-card.js
 ├─ init install-hourly-weather          -> /config/www/hourly-weather/hourly-weather.js
 ├─ init install-ai-automation-suggester -> /config/custom_components/ai_automation_suggester
 ├─ init install-dreame-vacuum           -> /config/custom_components/dreame_vacuum
 ├─ ConfigMap ha-theme-midnight (subPath) -> /config/themes/midnight.yaml
 ├─ hostPath Zigbee-Dongle (by-id)        -> /dev/ttyUSB0
 └─ PVC 10Gi local-path                   -> /config
```

Die Konfiguration (Integrationen, Dashboards, Tokens) liegt im UI-/Storage-Modus in `/config/.storage` auf dem PVC. Die NetworkPolicy `home-assistant-ingress` erlaubt Port 8123 nur aus `kube-system` (Traefik) und `ha-mcp`. `trusted_proxies` umfasst das Pod-Netz `10.42.0.0/16`.

## Erweiterungen

| Erweiterung | Typ | Upstream | Lovelace-Ressource |
|---|---|---|---|
| Bubble Card | Frontend | `Clooos/Bubble-Card` (Datei aus `dist/`, kein Release-Asset) | `/local/bubble-card.js` |
| Hourly Weather | Frontend | `decompil3d/lovelace-hourly-weather` (Tags ohne `v`) | `/local/hourly-weather/hourly-weather.js` |
| AI Automation Suggester | Integration | `ITSpecialist111/ai_automation_suggester` | |
| Dreame Vacuum | Integration (Dreame D9 Max) | `Tasshack/dreame-vacuum` | |
| Midnight | Theme | im Repo versioniert ([`midnight-theme-configmap.yaml`](../argocd/apps/home-assistant/templates/midnight-theme-configmap.yaml)) | |

Jeder Init-Container (`alpine:3.24`) lädt das gepinnte Release nach `/tmp`, ersetzt das Ziel erst nach erfolgreichem Download und schreibt die Version nach `/config/.extension-versions/<name>`. Stimmt der Marker mit dem Pin überein, lädt er nichts. Home Assistant startet deshalb auch ohne Internet oder DNS, etwa nach einem Stromausfall, solange Pi-hole im selben Cluster noch nicht läuft. Scheitert ein Download, bleibt die alte Kopie und der nächste Pod-Start versucht es erneut. Nur ohne vorhandene Kopie endet der Init-Container mit `Init:Error`.

Ein Update ist ein höheres `VERSION=` in `values.yaml` oder ein gemergter Renovate-PR. Die Zeile `# renovate:` über dem Container und die erste `VERSION=`-Zuweisung im Skript gehören für den Regex-Manager in `renovate.json` zusammen und dürfen nicht umformatiert werden.

## Einrichtung bei Neuinstallation

Ist das PVC leer, sind diese Schritte in der UI nötig:

1. Frontend-Karten registrieren: Einstellungen, Dashboards, Ressourcen, „Hinzufügen". Beide URLs aus der Tabelle oben, Typ „JavaScript-Modul".
2. ZHA hinzufügen (Einstellungen, Geräte & Dienste): Serial Device `/dev/ttyUSB0`, Radio-Typ EZSP.
3. AI Automation Suggester hinzufügen und Provider samt API-Key eintragen. Der Key liegt nur in `/config/.storage`.
4. Dreame Vacuum hinzufügen, bevorzugt lokal mit Geräte-IP (DHCP-Reservierung in der FritzBox) und Miio-Token (`pip install python-miio`, dann `miiocli discover --handshake 1`).
5. MQTT für das Nuki-Schloss: siehe [Nuki und MQTT](18-nuki-mqtt.md).
6. Theme wählen: Profil, Theme `midnight`. Der Chart lädt `themes/` bereits per `frontend.themes: !include_dir_merge_named themes`.

## Zigbee

Koordinator ist ein Sonoff Zigbee Dongle Plus MG24 (EFR32MG24, EZSP). Der Chart mountet den stabilen `by-id`-Pfad `/dev/serial/by-id/usb-SONOFF_SONOFF_Dongle_Plus_MG24_…-if00-port0` als `CharDevice` nach `/dev/ttyUSB0` im Pod. Der vollständige Pfad steht unter `additionalVolumes` in `values.yaml`.

## Betrieb

```bash
sudo kubectl -n home-assistant get pods
# installierte Versionen der Erweiterungen
sudo kubectl -n home-assistant exec home-assistant-0 -- sh -c 'head /config/.extension-versions/*'
# Log eines Init-Containers
sudo kubectl -n home-assistant logs home-assistant-0 -c install-bubble-card
# Download erzwingen: Marker löschen, Pod neu starten
sudo kubectl -n home-assistant exec home-assistant-0 -- rm /config/.extension-versions/bubble-card
sudo kubectl -n home-assistant rollout restart statefulset/home-assistant
# Zigbee-Device im Pod
sudo kubectl -n home-assistant exec home-assistant-0 -- ls -la /dev/ttyUSB0
```

## Fallstricke

- `securityContext.privileged: true` ist für den USB-Zugriff nötig, k3s hat kein Device-Plugin.
- Nie `/dev/ttyUSB0` vom Host mounten. Die Nummer ändert sich nach einem Reboot, wenn weitere USB-Geräte stecken.
- Der MG24 spricht EZSP. ZNP ist für TI-Chips (CC2652) und scheitert beim Verbinden.
- „Custom element doesn't exist": Ressource fehlt oder URL falsch. Ressourcen prüfen, Browser-Cache leeren.
- `cp: no such file` im Init-Container nach einem Major-Update: Der Ordnername im Tarball hat sich geändert. `SRC=` im Skript anpassen.
- Weitere Punkte: [gotchas.md](gotchas.md#home-assistant--ha-mcp).

## Siehe auch

- [Nuki und MQTT](18-nuki-mqtt.md)
- [HA-MCP für Claude Code](22-ha-mcp.md)
