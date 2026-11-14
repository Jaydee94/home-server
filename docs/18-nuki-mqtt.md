# Nuki und MQTT

Das Nuki Smart Lock Pro (3.0 Pro / 4. Gen) spricht MQTT mit Home-Assistant-Auto-Discovery. Es meldet sich selbst unter `homeassistant/` an, eine Custom-Integration ist nicht nötig. Den Broker stellt die App `mosquitto`, die per MetalLB eine eigene LAN-IP bekommt, weil das Schloss als WLAN-Gerät keine ClusterIP erreicht.

| | |
|---|---|
| Broker (LAN) | `192.168.178.4:1883`, Service `mosquitto-lan` |
| Broker (Cluster) | `mosquitto.mosquitto.svc.cluster.local:1883`, Service `mosquitto` |
| Namespace | `mosquitto` |
| Quelle | [`argocd/apps/mosquitto/`](../argocd/apps/mosquitto/) (eigene Templates, StatefulSet `mosquitto`) |
| Image | `eclipse-mosquitto` (Tag in [`values.yaml`](../argocd/apps/mosquitto/values.yaml), Renovate) |
| Auth | `allow_anonymous false`, User `mqtt` aus SealedSecret `mosquitto-auth` |

## Architektur

```text
Nuki (WLAN) ──MQTT 1883──> 192.168.178.4 (MetalLB-Pool "mosquitto")
                                  │
                           mosquitto-0 ── PVC 1Gi /mosquitto/data (retained Discovery-Messages)
                                  ▲
home-assistant-0 ──MQTT 1883──────┘  (MQTT-Integration, Auto-Discovery -> lock.nuki_*)
```

Der Init-Container `generate-runtime-files` liest `username` und `password` aus dem Secret `mosquitto-auth` und erzeugt daraus die Passwortdatei. Die NetworkPolicy `mosquitto-broker` lässt Ingress von überall zu, aber nur auf Port 1883. Eine Einschränkung per `namespaceSelector` würde den LAN-Verkehr des Schlosses blockieren.

> [!WARNING]
> MQTT läuft authentifiziert, aber unverschlüsselt, weil das Nuki-Schloss kein TLS kann. Der Broker bleibt deshalb LAN-intern, ohne Tailnet-Listener.

## Einrichtung bei Neuinstallation

1. Nur bei neuem Sealed-Secrets-Schlüssel: In http://kubeseal-webgui.homeserver für Namespace `mosquitto`, Secret `mosquitto-auth` (Typ `Opaque`) die Keys `username` (`mqtt`) und `password` einzeln versiegeln. Die Strings als `sealedSecret.encryptedUsername` und `sealedSecret.encryptedPassword` in `values.yaml` eintragen.
2. Home Assistant: Einstellungen, Geräte & Dienste, Integration „MQTT" hinzufügen. Broker `mosquitto.mosquitto.svc.cluster.local`, Port `1883`, User `mqtt`. Discovery mit Präfix `homeassistant` aktiv lassen.
3. Nuki-App (Firmware ab 4.0.28): Schloss, Features & Konfiguration, Smart Home, MQTT. WLAN einrichten, MQTT aktivieren, Broker `192.168.178.4`, User `mqtt`, Auto-Discovery an.

Nach wenigen Sekunden erscheint in Home Assistant `lock.nuki_*` mit Sensoren für Akku, Türstatus und letzte Aktion.

## Betrieb

```bash
sudo kubectl -n mosquitto get pods,svc        # mosquitto-lan: EXTERNAL-IP 192.168.178.4
sudo kubectl -n mosquitto logs mosquitto-0    # "New client connected ... as Nuki_..."

# vom LAN aus: anonym muss scheitern, mit User klappen
mosquitto_sub -h 192.168.178.4 -p 1883 -t '#' -v
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P '<passwort>' -t 'homeassistant/#' -v
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P '<passwort>' -t 'nuki/#' -v
```

## Fallstricke

- Sind `encryptedUsername` oder `encryptedPassword` leer, rendert kein SealedSecret und der Pod bleibt in `ContainerCreating`.
- In der Nuki-App nur die IP eintragen. Mit `192.168.178.4:1883` meldet die App „Hostname nicht auflösbar"; den Port 1883 setzt sie selbst.
- Fehlercode `8E` nach dem Aktivieren ist ein Anzeigefehler der App. Steht im Broker-Log die Nuki-Verbindung, funktioniert alles.
- Die IP muss außerhalb des FritzBox-DHCP-Bereichs liegen. Bei einem Wechsel anpassen: [`ipaddresspool-mosquitto.yaml`](../argocd/apps/metallb/templates/ipaddresspool-mosquitto.yaml), `loadBalancerIP` in [`service-lan.yaml`](../argocd/apps/mosquitto/templates/service-lan.yaml) und die Nuki-App.
- `mosquitto-lan` braucht `loadBalancerClass: metallb.universe.tf/metallb`, sonst greift Klipper. Hängt der Service nach einer Änderung in `<pending>`: siehe [gotchas.md](gotchas.md#metallb--networking).
