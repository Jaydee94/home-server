# Spec: Zigbee-Dongle (Sonoff MG24) in Home Assistant via ZHA

**Datum:** 2026-06-09  
**Status:** Approved  
**Scope:** USB-Passthrough des Sonoff Zigbee 3.0 Dongle Plus MG24 zum Home-Assistant-Pod + ZHA-Integration

---

## Ziel

Den am Home-Server gesteckten Sonoff Zigbee USB-Dongle (EFR32MG24, CP210x UART) dem
Home-Assistant-Kubernetes-Pod zugänglich machen, damit die eingebaute ZHA-Integration
(Zigbee Home Automation) Zigbee-Geräte steuern kann.

## Kontext

- HA läuft als Helm-Deployment via `pajikos/home-assistant-helm-chart` v0.3.63
- ArgoCD synct `argocd/apps/home-assistant/` automatisch bei Push auf `main`
- Device stabil sichtbar unter `/dev/serial/by-id/usb-SONOFF_SONOFF_Dongle_Plus_MG24_46718ac707a3ef11a29a8c6661ce3355-if00-port0`
- USB-ID: `10c4:ea60` (Silicon Labs CP210x UART Bridge → EFR32MG24 Zigbee-Chip)

---

## Architektur

```
Host (k3s Node)
  └── /dev/serial/by-id/usb-SONOFF_...-if00-port0  (CharDevice, stabil)
        │
        │  hostPath-Volume (type: Directory, /dev/serial/by-id)
        ▼
  HA-Pod (privileged: true)
    └── /dev/serial/by-id/usb-SONOFF_...-if00-port0
          │
          │  ZHA-Integration (EmberZNet / EZSP)
          ▼
      Zigbee-Koordinator
```

---

## Änderungen

### 1. `argocd/apps/home-assistant/values.yaml`

Drei Ergänzungen unter dem `home-assistant:`-Key:

**SecurityContext** (Container-Ebene, privileged für USB-Device-Zugriff):
```yaml
securityContext:
  privileged: true
```

**HostPath-Volume** (stabiler by-id-Verzeichnis-Mount statt fragiler `/dev/ttyUSBx`):
```yaml
extraVolumes:
  - name: zigbee-dongle
    hostPath:
      path: /dev/serial/by-id
      type: Directory

extraVolumeMounts:
  - name: zigbee-dongle
    mountPath: /dev/serial/by-id
```

> Der genaue Values-Key (`extraVolumes` / `hostPathMounts`) wird gegen die pajikos-Chart-Doku
> verifiziert, bevor `values.yaml` editiert wird.

### 2. `docs/17-homeassistant.md`

Neuer Abschnitt **Zigbee via ZHA** mit Device-Pfad, Onboarding-Schritten und Gotchas.

---

## ZHA-Onboarding (einmaliger manueller Schritt)

Nach ArgoCD-Sync (Pod-Neustart):

1. HA-UI → Settings → Devices & Services → Add Integration → **ZHA**
2. Device Path: `/dev/serial/by-id/usb-SONOFF_SONOFF_Dongle_Plus_MG24_46718ac707a3ef11a29a8c6661ce3355-if00-port0`
3. Radio type: **EZSP** (EFR32MG24 = EmberZNet Serial Protocol)

ZHA-Config wird in `/config/.storage/core.config_entries` auf dem PVC persistiert —
überlebt Pod-Restarts.

---

## Nicht im Scope

- Zigbee2MQTT (bewusst nicht gewählt: kein extra Pod/MQTT-Broker nötig)
- ser2net (kein Host-Service nötig)
- Pairen konkreter Zigbee-Geräte (HA-UI-Bedienung, kein GitOps-Change)

---

## Gotchas

- **`privileged: true` ist nötig**, da k3s keinen USB-Device-Plugin mitbringt und
  Kubernetes hostPath CharDevices ohne Privilegien nicht zugänglich macht.
- **Kein `/dev/ttyUSB0`-Mount**: Der numerische Device-Node ist nach Reboot instabil
  (weitere USB-Geräte können die Reihenfolge ändern). Stattdessen das gesamte
  `/dev/serial/by-id`-Verzeichnis mounten.
- **EZSP, nicht ZNP**: Der MG24-Chip nutzt EmberZNet Serial Protocol (EZSP), nicht den
  Texas Instruments ZNP-Stack. In ZHA explizit EZSP auswählen.
