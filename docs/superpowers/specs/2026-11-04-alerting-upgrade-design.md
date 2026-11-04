# Alerting Upgrade – Design

**Datum:** 2026-11-04  
**Status:** Entwurf, wartet auf Freigabe

---

## Intent & Why

Der Home-Server hat eine funktionierende Monitoring-Basis (VictoriaMetrics, 20+ VMRules, Alertmanager → Gotify-Bridge). Zwei Probleme bleiben:

1. **Gotify-Push erfordert VPN** – Benachrichtigungen kommen außerhalb des Heimnetzes nicht an.
2. **Kritische Lücken in den Alert-Rules** – VM-Startfehler nach Updates, Netzwerk-Ausfall, systemd-Unit-Crashes und HTTP-Nichterreichbarkeit von Services werden nicht erkannt.

Ziel: Vollständiges, VPN-unabhängiges Alerting – Benachrichtigung per Smartphone, auch wenn man unterwegs ist.

---

## Ziele

- Smartphone-Push ohne VPN, ohne laufende Kosten
- Lücken in VMRules schließen (systemd, KubeVirt, Netzwerk, HTTP-Verfügbarkeit)
- Aktive Alerts in Grafana sichtbar machen (Dashboard)
- Gotify-Bridge-Deployment entfernen (weniger Moving Parts)

## Nicht-Ziele

- Benachrichtigungen für mehrere Empfänger / Teams
- SMART-Monitoring auf dem NAS (separates Thema, braucht privilegierten Sidecar)
- Raw Kubernetes-Event-Export (zu hohe Cardinality für Home-Server; symptombasierte Alerts decken die Fälle ab)

## Anti-Ziele (würde das Projekt scheitern lassen)

- Benachrichtigungskanal der wieder VPN benötigt
- Alert-Spam durch virtuelle Netzwerk-Interfaces (veth/cni/flannel)

---

## Constraints

- Stack: VictoriaMetrics k8s-Stack (VMRule, VMAlert, Alertmanager)
- GitOps: alle Änderungen via ArgoCD, kein kubectl apply von Hand
- Secrets: SealedSecrets (kubeseal)
- Kein öffentlich erreichbarer Port auf dem Server (Tailscale-only)

---

## Entscheidungen

### Benachrichtigungskanal: ntfy.sh via xenrox/ntfy-alertmanager Bridge

**Begründung:** ntfy.sh (Public Cloud) ist VPN-unabhängig und kostenlos. Für schöne Formatierung (Titel = Alertname, Priorität = Severity, Body = Description) wird `xenrox/ntfy-alertmanager` als leichtgewichtiger Bridge-Pod deployed – ähnlich wie die Gotify-Bridge, aber mit Cloud-Ziel.

**Notification-Format:**
- Titel: `alertname` (z.B. „HostDiskCritical")
- Nachricht: `annotations.description`
- Priorität: `critical` → `urgent`, `warning` → `high`, `info` → `default`
- Resolved-Notifications: `send_resolved: true`

**Topic-Name** in ConfigMap (kein Secret – Inhalt der Alerts ist nicht sensitiv).

**Alternative die verworfen wurde:** E-Mail (braucht persönliches SMTP-Passwort als Secret).

### Fritz!Box: nicht verwendbar

Fritz!Box Push-Services sind nur für eigene Router-Events (Anruf, Smart Home). Keine eingehende Webhook-API.

---

## Teile der Umsetzung

### 1 – Neue VMRules (Erweiterung `vmrule-homeserver.yaml`)

Vier neue Alerts in bestehende Gruppe einfügen:

| Alert | Expr | for | Severity | Warum |
|---|---|---|---|---|
| `SystemdUnitFailed` | `node_systemd_unit_state{state="failed"} == 1` | 2m | warning | Deckt direkt "VM/Service startet nach Update nicht" |
| `KubeVirtVMNotRunning` | `kubevirt_vmi_phase_count{phase=~"Failed\|Unknown"} > 0` | 5m | critical | VM in Fehler-/Unbekannt-Phase |
| `HostNetworkInterfaceDown` | `node_network_up{device!~"lo\|veth.*\|cni.*\|flannel.*\|tunl.*\|cali.*\|dummy.*"} == 0` | 5m | critical | Physisches NIC ausgefallen |
| `PodUnschedulable` | `kube_pod_status_unschedulable == 1` | 10m | warning | Pod kommt nicht auf einen Node (FailedScheduling) |

Neue Gruppe `homeserver.kubevirt` für den KubeVirt-Alert, da KubeVirt schon eine eigene Gruppe hat (`monitoring/templates/vmservicescrape-kubevirt.yaml`).

### 2 – Blackbox Exporter (neue ArgoCD-App `blackbox-exporter`)

**Helm:** `prometheus-community/prometheus-blackbox-exporter`  
**Namespace:** `monitoring`

Prüft, ob Traefik-Services tatsächlich HTTP 200 zurückgeben (nicht nur ob der Pod läuft).

Neue VMRule-Gruppe `homeserver.blackbox`:
```
alert: ServiceEndpointDown
expr: probe_success == 0
for: 2m
severity: critical
```

VMProbe-CRD mit `ingress.selector: {}` – erfasst automatisch alle Ingresses im `monitoring`-Namespace (erweiterbar).

**Builder-Entscheidung:** Welche Ingresses initial proben? Vorschlag: alle im Namespace `monitoring` (Grafana etc.) sowie Homepage, Pi-hole – als separate VMProbe-Objekte je Namespace oder per Label-Selector.

### 3 – Gotify-Bridge ersetzen durch E-Mail

**Entfernt:**
- `argocd/apps/monitoring/templates/alertmanager-gotify-bridge.yaml`
- `argocd/apps/monitoring/templates/sealedsecret-alertmanager-gotify-bridge.yaml`

**Hinzugefügt:**
- `argocd/apps/monitoring/templates/sealedsecret-alertmanager-smtp.yaml` (SealedSecret mit `smtp-username` und `smtp-password`)

**Geändert:**
- `argocd/apps/monitoring/values.yaml` – Alertmanager `receivers` Block:

```yaml
alertmanager:
  config:
    global:
      smtp_smarthost: "mail.gmx.net:587"
      smtp_require_tls: true
      smtp_auth_username: "janherber@gmx.de"
      smtp_auth_password_file: /etc/alertmanager/secrets/alertmanager-smtp/smtp-password
      smtp_from: "janherber@gmx.de"
    route:
      receiver: email
      group_by: ["alertname", "namespace"]
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      routes:
        - receiver: blackhole
          matchers:
            - severity="info"
    receivers:
      - name: email
        email_configs:
          - to: "janherber@gmx.de"
            send_resolved: true
      - name: blackhole
```

Alertmanager-Spec erhält `secrets: [alertmanager-smtp]` damit das Passwort-File gemountet wird.

### 4 – Grafana Dashboard "Homeserver Alerts" (neue ConfigMap)

**Datei:** `argocd/apps/monitoring/templates/dashboard-alerts.yaml`  
**Label:** `grafana_dashboard: "1"` (wird vom Grafana-Sidecar automatisch geladen)

Dashboard-Struktur:
- **Stat-Row:** Anzahl firing Critical / Warning / Total (je ein Stat-Panel)
- **Tabelle:** `ALERTS{alertstate="firing"}` – Spalten: alertname, namespace, severity, summary, seit wann
- **Zeitreihe:** `count(ALERTS{alertstate="firing"}) by (severity)` – Verlauf der letzten 24h

Dashboard als JSON in der ConfigMap (kein externer Download, vollständig im Repo).

---

## Offene Punkte (Builder-Entscheidungen)

1. **GMX App-Passwort:** GMX-Konto hat 2FA? Dann App-Passwort nötig. Sonst normales Passwort. (Bauherr muss das Secret kubeseal'en und committen)
2. **Blackbox-Probe-Scope:** Welche Services initial proben – nur `monitoring`-Namespace oder auch Homepage, Pi-hole, Jellyfin etc.? → Builder-Entscheidung: Start mit den wichtigsten 5–6 Services (Homepage, Grafana, Pi-hole, Jellyfin, ArgoCD, HA)
3. **E-Mail-Subject-Template:** Standard (`[FIRING:1] ...`) oder angepasst mit Grafana-Link? → Builder-Entscheidung: Standard-Template ist ausreichend

---

## Reihenfolge der Umsetzung

1. VMRules (kein neues Deployment, sofort aktiv nach Sync)
2. Telegram ersetzen (Gotify-Bridge weg, neuer Receiver)
3. Grafana-Dashboard (pure ConfigMap, kein Risiko)
4. Blackbox Exporter (neues Deployment, zuletzt)
