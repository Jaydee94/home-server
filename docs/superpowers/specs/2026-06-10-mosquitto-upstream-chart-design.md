# Design: Mosquitto – Wechsel auf helmforgedev/mosquitto Upstream Chart

**Datum:** 2026-06-10
**Status:** Approved

## Ziel

Ablösung des eigenen Custom Helm Charts durch den gepflegten Upstream-Chart von
helmforgedev. Ein einziger MQTT-User (`mqtt`) für HA und Nuki.

## Architektur

Wrapper-Chart-Pattern (identisch zu `argocd/apps/home-assistant/`):

```
argocd/apps/mosquitto/
  Chart.yaml                       ← depends on helmforgedev/mosquitto v1.3.1
  Chart.lock
  values.yaml                      ← helmforgedev-Schema unter mosquitto: Key
  charts/mosquitto-1.3.1.tgz       ← vendored chart
  templates/
    sealedsecret.yaml              ← SealedSecret mit username + password
    service-lan.yaml               ← LoadBalancer + MetalLB (kein loadBalancerClass im upstream)
```

Alle alten Templates (deployment, configmap, pvc, service, serviceaccount, _helpers)
werden gelöscht — das übernimmt helmforgedev.

## Helm Chart Dependency

```yaml
dependencies:
  - name: mosquitto
    repository: https://repo.helmforge.dev
    version: "1.3.1"
```

Renovate erkennt diese Dependency automatisch und öffnet PRs für neue Versionen.

## Auth

Das helmforgedev-Chart liest `username` + `password` (Klartext) aus einem Kubernetes
Secret und ruft intern `mosquitto_passwd -b -c /work/passwordfile` im Init-Container auf.
Kein lokales Docker / kein `mosquitto_passwd` auf dem Rechner nötig.

SealedSecret-Inhalt:
- Key `username`: Wert `mqtt`
- Key `password`: Wert `<gewähltes Passwort>`

Versiegelung via kubeseal-webgui:
- Namespace: `mosquitto`
- Name: `mosquitto-auth`
- Zweimal je einen Key versiegeln → zwei verschlüsselte Strings

In `values.yaml`:
```yaml
mosquitto:
  auth:
    enabled: true
    existingSecret: mosquitto-auth
```

SealedSecret-Template in `templates/sealedsecret.yaml`:
```yaml
{{- if and .Values.sealedSecret.encryptedUsername .Values.sealedSecret.encryptedPassword }}
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
spec:
  encryptedData:
    username: <encrypted>
    password: <encrypted>
{{- end }}
```

## Services

| Service | Typ | Genutzt von |
|---|---|---|
| `mosquitto` (helmforgedev) | ClusterIP | HA intern: `mosquitto.mosquitto.svc.cluster.local:1883` |
| `mosquitto-lan` (custom) | LoadBalancer `192.168.178.4` | Nuki (LAN-Gerät) |

Das helmforgedev-Chart unterstützt kein `loadBalancerClass`, weshalb ein eigenes
`service-lan.yaml` mit `loadBalancerClass: metallb.universe.tf/metallb` nötig ist.
Das verhindert, dass k3s Klipper den Service beansprucht.

## Nicht-Ziele

- Kein TLS (Nuki unterstützt es nicht)
- Kein zweiter User — HA und Nuki teilen denselben `mqtt`-User
- Kein WebSocket-Listener aktiviert

## Migrations-Schritte

1. Branch `feat/mosquitto-upstream-chart` anlegen
2. Alten Chart-Inhalt entfernen (alle `templates/` Files + `values.yaml` + `Chart.yaml`)
3. Neues `Chart.yaml` mit helmforgedev-Dependency schreiben
4. `helm dependency update argocd/apps/mosquitto` ausführen → `.tgz` wird vendored
5. Neues `values.yaml` schreiben (helmforgedev-Schema)
6. `templates/sealedsecret.yaml` schreiben
7. `templates/service-lan.yaml` schreiben
8. `helm template` lokal testen
9. Credentials in kubeseal-webgui versiegeln → Werte in `values.yaml` eintragen
10. PR erstellen, CI grün, ArgoCD synct

## Verifikation

```bash
# Pod läuft
kubectl -n mosquitto get pods

# Beide Services vorhanden
kubectl -n mosquitto get svc
# mosquitto: ClusterIP
# mosquitto-lan: LoadBalancer 192.168.178.4

# Auth erzwungen
mosquitto_sub -h 192.168.178.4 -p 1883 -t '#' -v          # Connection Refused
mosquitto_sub -h 192.168.178.4 -p 1883 -u mqtt -P <PW> -t '#' -v  # OK
```
