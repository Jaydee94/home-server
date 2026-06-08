# Design: Home Assistant auf k3s

**Datum:** 2026-06-08  
**Status:** Approved  
**Scope:** Home Automation Plattform — Philips Hue Integration, k3s/ArgoCD Deployment

---

## Ziel

Eine vollständige Open-Source-Heimautomatisierungsplattform im bestehenden k3s-Cluster betreiben. Einstieg mit Philips Hue (via vorhandener Bridge), poliertes Mobile-Dashboard, GitOps-managed via ArgoCD. Direkte Zigbee-Unterstützung (ohne Bridge) als spätere Erweiterungsoption.

---

## Architektur

### Deployment-Struktur

```
argocd/apps/home-assistant/
├── Chart.yaml          # Helm-Dependency: pajikos/home-assistant
├── values.yaml         # Config, Ingress, PVC, Timezone
└── templates/
    └── sealedsecret.yaml  # Optional: API-Token für externe Services
```

ArgoCD erkennt das Verzeichnis automatisch via Root-ApplicationSet. Namespace `home-assistant` wird auto-erstellt. Kein manueller ArgoCD-Eintrag nötig.

### Komponenten

| Komponente | Details |
|---|---|
| Image | `homeassistant/home-assistant:stable` |
| Persistent Storage | PVC `home-assistant-config`, 10 Gi, `local-path` → `/config` |
| Ingress | Traefik IngressRoute, Host: `homeassistant.homeserver` |
| DNS | Pi-hole-Wildcard `*.homeserver → 192.168.178.127` deckt den Host bereits ab |
| Timezone | `TZ: Europe/Berlin` via Env-Var |

### Helm Chart

- **Chart:** `pajikos/home-assistant` (Community, weit verbreitet für k3s)
- **Repository:** `https://pajikos.github.io/home-assistant-helm-chart/`
- **Version:** `0.2.x` (Renovate hält aktuell)

```yaml
# Chart.yaml
apiVersion: v2
name: home-assistant
version: 0.1.0
dependencies:
  - name: home-assistant
    version: "0.2.x"
    repository: https://pajikos.github.io/home-assistant-helm-chart/
```

```yaml
# values.yaml (Kern)
home-assistant:
  image:
    tag: stable
  persistence:
    config:
      enabled: true
      storageClass: local-path
      size: 10Gi
  ingress:
    enabled: true
    ingressClassName: traefik
    hosts:
      - host: homeassistant.homeserver
        paths:
          - path: /
            pathType: Prefix
  env:
    TZ: Europe/Berlin
```

---

## Philips Hue Integration

- HA erkennt die Hue Bridge automatisch via mDNS/UPnP im LAN
- Einmalig: physischer Button-Druck auf der Bridge zum Pairen (kein API-Token nötig)
- Alle Hue-Lampen, -Gruppen und -Szenen erscheinen danach als HA-Entities
- Automationen direkt im HA-UI konfigurieren (kein YAML zwingend nötig)

### Day-1 Automation-Ideen

- Zeit-basiertes Dimmen: Abends → warm/dunkel, Morgens → hell/kalt
- Sonnenauf/-untergang als Trigger (HA kennt konfigurierten Standort)
- Gotify-Webhook bei Events (HA → `http://gotify.homeserver/message?token=...`)

---

## Secrets & Zugang

- **HA-Admin-Account:** Beim First-Run im UI setzen (kein SealedSecret für den Start nötig)
- **Externe Service-Tokens** (z.B. Gotify, Wetter-API): Als `SealedSecret` in `templates/sealedsecret.yaml` wenn benötigt
- **Remote-Zugriff:** HA Companion App (iOS/Android) verbindet via Tailscale direkt mit `homeassistant.homeserver` — kein Nabu Casa / Cloud-Account nötig

---

## Homepage-Integration

Widget in `argocd/apps/homepage/values.yaml` ergänzen:

```yaml
- Home Assistant:
    href: http://homeassistant.homeserver
    icon: home-assistant.png
    widget:
      type: homeassistant
      url: http://home-assistant.home-assistant.svc.cluster.local:8123
      key: <long-lived-access-token>  # aus HA UI generieren, als SealedSecret
```

---

## Zigbee-Erweiterung (Future, nicht Day 1)

Falls ein USB-Zigbee-Dongle (z.B. Sonoff Zigbee 3.0 USB Plus, ConBee II) am Server eingesteckt wird:

1. `values.yaml` erweitern:
   ```yaml
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
2. ZHA (Zigbee Home Automation, HA-nativ) oder Zigbee2MQTT als separaten Pod hinzufügen
3. Hue Bridge bleibt parallel aktiv — beide Zigbee-Stacks koexistieren in HA

---

## Monitoring (Optional)

HA exponiert einen Prometheus-Endpoint. Später ergänzbar:

```yaml
# templates/vmservicescrape.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMServiceScrape
metadata:
  name: home-assistant
  namespace: home-assistant
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: home-assistant
  endpoints:
    - port: http
      path: /api/prometheus
      bearerTokenSecret:
        name: ha-prometheus-token
        key: token
```

---

## Nicht im Scope

- HAOS (Home Assistant Operating System) — nicht nötig, Container-HA reicht für alle geplanten Features
- Bluetooth-Integration — kein Hardware-Zugang geplant
- Nabu Casa Cloud — Remote-Zugriff via Tailscale ist ausreichend
- Node-RED — HA's eingebauter Automations-Editor ist für den Start ausreichend
