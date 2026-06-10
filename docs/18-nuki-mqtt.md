# 18 – Nuki Smart Lock Pro via MQTT in Home Assistant

Das **Nuki Smart Lock Pro** (3.0 Pro / 4. Gen) hat **nativen MQTT-Support mit
Home-Assistant-Auto-Discovery**: Wird MQTT in der Nuki-App aktiviert, publiziert
das Schloss seine Entities selbst auf das `homeassistant/`-Discovery-Topic. Home
Assistant erkennt das Schloss dann automatisch – **keine Custom-Integration, kein
Init-Container** (anders als bei Solakon ONE, siehe `docs/17-homeassistant.md`).

Das einzig fehlende Stück war ein **MQTT-Broker im Cluster**. Dieser wird als
eigene ArgoCD-App **`mosquitto`** deployt und ist im LAN über eine dedizierte
**MetalLB-IP** erreichbar, weil das Nuki-Schloss ein **physisches LAN-Gerät** ist
(ein ClusterIP wäre von außerhalb des Clusters nicht erreichbar).

| | |
|---|---|
| Broker | Eclipse Mosquitto, `argocd/apps/mosquitto/` (helmforgedev/mosquitto) |
| Namespace | `mosquitto` |
| Broker-Endpoint (LAN) | `192.168.178.4:1883` (MetalLB, für das Nuki-Schloss) |
| Broker-Endpoint (Cluster) | `mosquitto.mosquitto.svc.cluster.local:1883` (für HA) |
| Auth | `allow_anonymous false`; User `mqtt` (SealedSecret) |
| HA-Integration | native **MQTT**-Integration (UI-Config-Entry, kein YAML) |
| Verbindung | Nuki (WLAN) → Mosquitto ← Home Assistant; MQTT Auto-Discovery |

## Architektur

```
Nuki Smart Lock Pro (WLAN, 192.168.178.x)
        │ MQTT (Port 1883, auth, unverschlüsselt)
        ▼
192.168.178.4  ← MetalLB L2 (IPAddressPool "mosquitto")
        │
k3s ─ mosquitto Pod (helmforgedev/mosquitto)
   ├─ ConfigMap  → /mosquitto/config/mosquitto.conf  (allow_anonymous false)
   ├─ SealedSecret "mosquitto-auth" → Credentials (username/password)
   └─ PVC (local-path, 1Gi) → /mosquitto/data  (retained Discovery-Messages)
        ▲
        │ MQTT (Cluster-intern, Port 1883)
home-assistant Pod
   └─ MQTT-Integration → erkennt `lock.nuki_*` per Auto-Discovery
```

Der Broker hat **keine NetworkPolicy** – das Nuki-Schloss erreicht ihn als
externes LAN-Gerät über die MetalLB-IP; eine `namespaceSelector`-Ingress-Policy
würde diesen LAN-Traffic blocken. Sicherheitsgrenze ist `allow_anonymous false`
plus User/Passwort. HA-Egress ins Cluster ist erlaubt (die HA-NetworkPolicy
beschränkt nur Ingress auf 8123).

> **Hinweis:** Der MQTT-Verkehr ist authentifiziert, aber **unverschlüsselt** –
> das Nuki-Schloss unterstützt kein TLS. Der Broker bleibt deshalb bewusst
> LAN-intern (keine öffentliche Exposition, kein Tailnet-Listener).

## Broker-Credentials erzeugen & versiegeln

Der helmforgedev-Chart generiert die `mosquitto_passwd`-Datei intern per Init-Container —
kein lokales Docker oder `mosquitto_passwd` nötig.

Zwei Keys per **kubeseal-webgui** (<http://kubeseal-webgui.homeserver>) versiegeln:

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
  secretName: mosquitto-auth
  encryptedUsername: "AgB..."   # ← String aus kubeseal-webgui (Key: username)
  encryptedPassword: "AgB..."   # ← String aus kubeseal-webgui (Key: password)
```

Nach Commit + Push synct ArgoCD das SealedSecret und der Broker-Pod startet.

**Rotation:** Neue Werte in kubeseal-webgui erzeugen, `encryptedUsername`/`encryptedPassword`
ersetzen, push. ArgoCD aktualisiert das Secret automatisch.

## Home Assistant: MQTT-Integration aktivieren

Die native MQTT-Integration wird **über die UI** konfiguriert (Config-Entry,
kein YAML mehr) und persistiert in `/config/.storage` auf dem HA-PVC. **Kein
Code-Change an der home-assistant-App nötig.**

1. <http://homeassistant.homeserver> → Einstellungen → Geräte & Dienste →
   *Integration hinzufügen* → **MQTT**.
2. Broker: `mosquitto.mosquitto.svc.cluster.local` (oder `192.168.178.4`),
   Port `1883`.
3. Benutzername `mqtt`, Passwort `<dein Passwort>`.
4. MQTT-Discovery aktiviert lassen (Default-Präfix `homeassistant`).

## Nuki-App konfigurieren

> Voraussetzung: Smart Lock Pro mit **Firmware ≥ 4.0.28** (sonst kein WLAN-MQTT).

1. Nuki-App → Schloss auswählen → *Features & Konfiguration → Smart Home →
   **MQTT***.
2. WLAN einrichten und MQTT aktivieren.
3. Broker-Host `192.168.178.4`, Port `1883`, Benutzer `mqtt`, Passwort `<dein Passwort>`.
4. **Auto-Discovery** aktiviert lassen (Discovery-Topic `homeassistant`).

Nach wenigen Sekunden erscheint in HA automatisch ein `lock.nuki_*`-Entity samt
Sensoren (Akku, Türstatus, letzte Aktion).

## Verifikation

```bash
# 1. ArgoCD-Apps synced & healthy
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n argocd get applications mosquitto metallb'

# 2. Broker-Pod läuft, Service hat die EXTERNAL-IP .4
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n mosquitto get pods,svc'
# Erwartet: pod Running; service mosquitto LoadBalancer 192.168.178.4

# 3. Auth erzwungen (anonym muss scheitern, mit User klappen)
mosquitto_sub -h 192.168.178.4 -p 1883 -t '#' -v            # → Connection Refused
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P <dein Passwort> -t '#' -v

# 4. Nuki-Discovery & Status sichtbar
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P <dein Passwort> -t 'homeassistant/#' -v
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P <dein Passwort> -t 'nuki/#' -v
```

5. **HA-UI:** Die MQTT-Integration zeigt „verbunden"; unter Geräte & Dienste
   erscheint das Nuki-Schloss; `lock.nuki_*` reagiert auf Ver-/Entriegeln.

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| Broker-Pod `ContainerCreating`, Secret `mosquitto-auth` fehlt | `encryptedUsername`/`encryptedPassword` in `values.yaml` sind leer → Credentials via kubeseal-webgui versiegeln und Werte eintragen. |
| Service bleibt `<pending>` / bekommt zwei EXTERNAL-IPs | `loadBalancerClass` fehlt auf Service oder MetalLB-Controller → Klipper greift. IP `.4` muss im IPAddressPool `mosquitto` stehen (`argocd/apps/metallb/templates/ipaddresspool-mosquitto.yaml`). |
| ARP-Konflikt / IP nicht erreichbar | `192.168.178.4` liegt im FritzBox-DHCP-Bereich → andere freie IP außerhalb DHCP wählen (an 3 Stellen ändern: `ipaddresspool-mosquitto.yaml`, `mosquitto/values.yaml` `service.loadBalancerIP`, ggf. Nuki-App). |
| Nuki verbindet nicht | Firmware < 4.0.28, falsche Broker-IP/Port, oder User/Passwort falsch. WLAN-Empfang am Schloss prüfen. |
| Schloss erscheint nicht in HA | Auto-Discovery im Nuki-App deaktiviert oder MQTT-Integration in HA nicht verbunden. `mosquitto_sub -t 'homeassistant/#'` prüfen, ob Discovery-Configs ankommen. |
| `Connection Refused` trotz korrekter Credentials | Passwort-Datei im Secret stimmt nicht mit den App-Credentials überein → neu erzeugen/versiegeln. |
