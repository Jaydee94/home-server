# 17 – Home Assistant: Solakon-ONE Solar-Integration (Balkonkraftwerk)

Home Assistant läuft als ArgoCD-App im k3s-Cluster (pajikos Helm-Chart, Config
auf `local-path`-PVC). Für das Balkonkraftwerk ist die Custom-Integration
[**Solakon ONE**](https://github.com/solakon-de/solakon-one-homeassistant)
eingebunden – sie liest den FoxESS-basierten Hybrid-Wechselrichter **lokal über
Modbus TCP** aus (PV-Strings, Batterie, Netz-Ein-/Einspeisung). **Keine Cloud,
kein API-Token.**

| | |
|---|---|
| URL | <http://homeassistant.homeserver> (LAN + Tailnet, von Pi-hole aufgelöst) |
| Namespace | `home-assistant` |
| Chart | `argocd/apps/home-assistant/` (pajikos `home-assistant` 0.3.63, App 2025.6) |
| Integration | `solakon_one` (Domain), gepinnt auf Release **1.5.4** |
| Verbindung | Modbus TCP → WLAN-Dongle des Wechselrichters, Port 502 |

## Architektur

```
Balkonkraftwerk (Solakon ONE / FoxESS-Hybrid-WR)
        ▲ Modbus TCP (Port 502)  ← WLAN-Dongle hängt im LAN (192.168.178.x)
        │
k3s ─ home-assistant Pod
   ├─ initContainer "install-solakon-one"
   │     └─ lädt Release 1.5.4 → /config/custom_components/solakon_one (idempotent)
   ├─ HA-Container (lädt die Integration beim Start)
   └─ config-PVC (local-path, 10Gi) → /config  (DB, .storage, custom_components)
```

Pod-Egress ins LAN ist erlaubt – die NetworkPolicy
(`templates/networkpolicy.yaml`) beschränkt nur **Ingress** (Port 8123 von
Traefik), nicht Egress. Kein `hostNetwork` nötig: Modbus TCP ist eine
ausgehende TCP-Verbindung zur Dongle-IP.

## GitOps-Installation der Integration

Statt HACS (manuell, nicht versioniert) wird die Integration reproduzierbar per
**Init-Container** eingebracht. In `argocd/apps/home-assistant/values.yaml`:

```yaml
  initContainers:
    # renovate: datasource=github-releases depName=solakon-de/solakon-one-homeassistant
    - name: install-solakon-one
      image: alpine:3.20
      command: ["/bin/sh", "-c"]
      args:
        - |
          set -eu
          VERSION=1.5.4
          apk add --no-cache curl tar
          rm -rf /config/custom_components/solakon_one
          mkdir -p /config/custom_components
          curl -fsSL "https://github.com/solakon-de/solakon-one-homeassistant/archive/refs/tags/${VERSION}.tar.gz" -o /tmp/s.tgz
          tar -xzf /tmp/s.tgz -C /tmp
          cp -r "/tmp/solakon-one-homeassistant-${VERSION}/custom_components/solakon_one" /config/custom_components/solakon_one
      volumeMounts:
        - name: home-assistant
          mountPath: /config
```

**Update der Integration:** `VERSION` in `values.yaml` anheben (oder den
Renovate-PR mergen) → push → ArgoCD synct → der Pod startet neu → der
Init-Container kopiert die neue Version. Da der Ziel-Ordner vorher gelöscht wird,
entspricht die installierte Version immer dem Git-Stand.

## Inverter-Onboarding

> Diese Schritte sind noch offen (IP/Modbus-Status unbekannt) und Voraussetzung
> für den Funktionstest.

1. **LAN-IP des WLAN-Dongles ermitteln** – FritzBox → Heimnetz → Netzwerk (oder
   DHCP-Lease-Liste). Die IP per FritzBox-Reservierung **fest vergeben**, damit
   sie sich nicht ändert.
2. **Modbus TCP am Dongle aktivieren** – in der FoxESS-Cloud/App bzw. der
   Dongle-Konfiguration. Ohne diese Freischaltung ist Port 502 geschlossen
   (`Connection refused`).
3. **Integration in HA hinzufügen** – <http://homeassistant.homeserver> →
   Settings → Devices & Services → *Add Integration* → „Solakon ONE". Eintragen:
   - **Host/IP:** die feste Dongle-IP
   - **Port:** `502`
   - **Modbus Device-ID:** meist `1` (Bereich 1–247)
   - **Update-Intervall:** z. B. `30` s (1–300)

Die Verbindungsdaten persistiert HA in `/config/.storage` auf dem PVC – das ist
UI-State und wird (wie üblich) nicht in Git gehalten.

## Verifikation

```bash
# 1. ArgoCD-App synced & healthy
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n argocd get applications home-assistant'

# 2. Init-Container-Log (Pod-Name vorher mit `get pods` holen)
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant logs <pod> -c install-solakon-one'

# 3. Dateien im PVC vorhanden
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n home-assistant exec <pod> -- ls /config/custom_components/solakon_one/manifest.json'
```

4. **UI:** „Solakon ONE" muss unter *Add Integration* auffindbar sein (HA hat die
   Custom-Component beim Start geladen).
5. **Live-Daten** (sobald der Config-Flow durch ist): Entities wie
   `sensor.solakon_one_battery_power`, PV-String- und Netz-Sensoren liefern Werte.

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
| „Solakon ONE" fehlt unter *Add Integration* | Pod nicht neu gestartet oder Init-Container fehlgeschlagen → Init-Container-Log prüfen; Pod rollen: `kubectl -n home-assistant rollout restart deploy/home-assistant`. |
| `Connection refused` / Timeout im Config-Flow | Modbus TCP am Dongle nicht aktiv, falsche IP oder Port ≠ 502. Dongle-IP per `nmap -p502 <ip>` testen. |
| Falsche/leere Werte | Falsche Modbus-Device-ID – andere ID (z. B. 1 vs. 247) probieren. |
| Init-Container `cp: no such file` nach Solakon-Update | Bei einem Major-Release kann sich der Ordnername im Tarball ändern → Pfad in `values.yaml` an das neue Release anpassen. |
