# Design: Homepage Dashboard Deployment

**Datum:** 2026-06-04
**Status:** Approved
**GitHub-Issue:** _wird nach Spec-Commit angelegt_

---

## Ziel

Deployment von [gethomepage/homepage](https://github.com/gethomepage/homepage) als zentrales
Home-Server-Dashboard auf dem k3s-Cluster. Das Dashboard zeigt alle laufenden Dienste mit
Icons, Live-Widgets (Kubernetes-Metriken, ArgoCD-Status, Grafana) und ist unter
`http://home.homeserver` erreichbar.

---

## Architektur

### Deployment-Ansatz: Upstream Helm Chart Dependency (Ansatz A)

```
argocd/apps/homepage/
├── Chart.yaml      ← Dependency: jameswynn/homepage
└── values.yaml     ← Gesamte Homepage-Konfiguration (services, widgets, settings, RBAC)
```

ArgoCD erkennt den Ordner via Root ApplicationSet, legt Namespace `homepage` automatisch an
und synct bei jedem Push auf `main`. Kein eigenes `templates/`-Verzeichnis nötig — der
upstream Chart rendert RBAC, Deployment, ConfigMap, Service und Ingress vollständig.

**Helm Chart:**
- Repo: `https://jameswynn.github.io/helm-charts`
- Chart: `homepage`
- Aktuelle Version: zum Zeitpunkt der Implementierung via `helm search repo jameswynn/homepage` ermitteln

---

## Nebeneffekte außerhalb von `argocd/apps/homepage/`

| Datei | Änderung | Zweck |
|---|---|---|
| `ansible/group_vars/all.yml` | `dnsmasq_hosts` + `home.homeserver` | DNS-Auflösung im LAN/Tailnet |
| `argocd/apps/argocd/values.yaml` (falls vorhanden) | `configs.cm.accounts.readonly: apiKey` + RBAC-Policy | ArgoCD readonly-User für Widget-API-Key |
| `CLAUDE.md` | Service-Tabelle + `home.homeserver` | Dokumentation |
| `docs/01-overview.md` | Service-Tabelle | Dokumentation |
| `docs/14-homepage.md` | Neues Dokument | Setup + Konfigurationsanleitung |

---

## Homepage-Konfiguration

### Einstellungen (`settings`)

```yaml
settings:
  title: Home Server
  theme: dark
  color: slate
  headerStyle: boxed
  layout:
    Kubernetes:
      style: row
      columns: 3
    Monitoring:
      style: row
      columns: 2
    GitOps & CI/CD:
      style: row
      columns: 3
    NAS:
      style: row
      columns: 4
    Tools:
      style: row
      columns: 2
```

Dunkles Theme (`dark`) mit `slate`-Farbpalette — passt zur Kubernetes/DevOps-Ästhetik.

### Header-Widgets (`widgets`)

```yaml
widgets:
  - kubernetes:
      cluster:
        show: true
        cpu: true
        memory: true
        showLabel: true
        label: "cluster"
      nodes:
        show: true
        cpu: true
        memory: true
        showLabel: true
  - datetime:
      text_size: xl
      format:
        dateStyle: long
        timeStyle: short
        hour12: false
  - search:
      provider: duckduckgo
      target: _blank
```

### Dienste (`services`)

#### Gruppe: Kubernetes

| Service | URL | Widget |
|---|---|---|
| Headlamp | http://headlamp.homeserver | — |
| kubeseal-webgui | http://kubeseal-webgui.homeserver | — |

#### Gruppe: Monitoring

| Service | URL | Widget |
|---|---|---|
| Grafana | http://grafana.homeserver | `type: grafana` — zeigt dashboards, datasources, alerts |

Grafana-Credentials kommen via `envFrom` aus dem existierenden Secret `monitoring-grafana`
im Namespace `monitoring` (nicht Plaintext in `values.yaml`).

#### Gruppe: GitOps & CI/CD

| Service | URL | Widget |
|---|---|---|
| ArgoCD | http://\<server-ip\>:30080 | `type: argocd` — zeigt apps, synced, healthy, outOfSync |
| Argo Workflows | http://argo-workflows.homeserver | — |
| Semaphore | http://semaphore.homeserver | — |

ArgoCD-Widget braucht einen API-Key (readonly Local User in ArgoCD).

#### Gruppe: NAS

| Service | URL | Widget |
|---|---|---|
| Paperless-NGX | http://jays-ugreen:8000 | — |
| OpenCode | http://jays-ugreen:4096 | — |
| TinyTeller | http://jays-ugreen:3002 | — |
| Day Pilot | http://jays-ugreen:3003 | — |

NAS-Dienste laufen außerhalb des Clusters — kein Kubernetes-nativer API-Zugriff möglich,
daher keine Widgets.

#### Gruppe: Tools

| Service | URL | Widget |
|---|---|---|
| Gotify | http://gotify.homeserver | — (kein offizielles Gotify-Widget; optional via JSON-Widget) |
| MinIO | http://minio.homeserver | — |

---

## RBAC

Der upstream Chart erstellt bei `kubernetes.clusterRole: true` automatisch:
- `ServiceAccount` im Namespace `homepage`
- `ClusterRole` mit den nötigen Permissions
- `ClusterRoleBinding`
- `Secret` vom Typ `kubernetes.io/service-account-token`

Benötigte Permissions laut offizieller Dokumentation:

| API-Gruppe | Ressourcen | Verben |
|---|---|---|
| `""` (core) | namespaces, pods, nodes | get, list |
| `networking.k8s.io` | ingresses | get, list |
| `traefik.io` | ingressroutes | get, list |
| `metrics.k8s.io` | nodes, pods | get, list |

---

## Kritische Konfigurationsdetails

### `HOMEPAGE_ALLOWED_HOSTS` (Pflicht)

Ohne diese Env-Var schlägt der Kubernetes-Liveness-Probe fehl. Der Wert muss
Pod-IP + Domain enthalten:

```yaml
env:
  - name: HOMEPAGE_ALLOWED_HOSTS
    value: "home.homeserver"
```

Der Chart ergänzt die Pod-IP intern automatisch.

### Grafana-Credentials via envFrom

Das Secret `monitoring-grafana` im Namespace `monitoring` enthält `admin-password`.
Da Homepage im Namespace `homepage` läuft, muss das Secret entweder:
- per `kubectl get secret` exportiert und in `homepage` als neues SealedSecret angelegt, oder
- als Environment-Variable via Klartext in `values.yaml` mit Wert aus Ansible Vault

Empfehlung: **neues SealedSecret** `homepage-grafana-credentials` im Namespace `homepage`
mit Grafana-Admin-Passwort. Wird in `values.yaml` via `envFrom` referenziert.

### ArgoCD readonly-User für Widget

ArgoCD wird via Ansible installiert (`ansible/roles/argocd/templates/argocd-values.yaml.j2`).
Dort muss der readonly-User ergänzt werden:

```yaml
configs:
  cm:
    accounts.readonly: apiKey
  rbac:
    policy.csv: |
      g, readonly, role:readonly
  params:
    server.insecure: "{{ argocd_server_insecure | lower }}"
```

Danach `make argocd` ausführen um die geänderten Helm-Values zu applyen.

API-Key dann im ArgoCD-UI unter Settings → Accounts → readonly → Generate Token.
Key wird als SealedSecret `homepage-argocd-token` im Namespace `homepage` angelegt
und via `envFrom` in Homepage injiziert.

---

## DNS-Update

`ansible/group_vars/all.yml`, Abschnitt `dnsmasq_hosts`:

```yaml
- name: home
  ip: 192.168.178.127
```

Danach `make dnsmasq` ausführen.

---

## Docs-Updates

1. `docs/14-homepage.md` — Setup-Anleitung:
   - Deployment-Schritte
   - ArgoCD readonly-User anlegen + API-Key generieren
   - Grafana-SealedSecret erstellen
   - dnsmasq-Update
   - Konfiguration editieren (services.yaml, widgets.yaml via `values.yaml`)
   - Gotchas (HOMEPAGE_ALLOWED_HOSTS, cross-namespace Secrets)

2. `docs/01-overview.md` — Homepage zur Service-Tabelle ergänzen

3. `CLAUDE.md` — `home.homeserver` in die Service-URLs-Tabelle

---

## Gotchas

- **Cross-namespace Secrets**: Kubernetes erlaubt kein `envFrom` über Namespace-Grenzen.
  Grafana-Credentials und ArgoCD-Token müssen als eigene SealedSecrets im Namespace
  `homepage` neu erstellt werden.
- **ArgoCD NodePort**: Das ArgoCD-Widget-`url` muss auf `http://<server-ip>:30080` zeigen,
  nicht auf `argocd.homeserver` (kein Ingress auf dem Standard-Port).
- **metrics.k8s.io**: `metrics-server` läuft bereits im k3s-Bundle — Kubernetes-Widget
  sollte out-of-the-box funktionieren.
- **Renovate**: Die Chart-Version in `Chart.yaml` wird via `jameswynn/homepage`
  Renovate-Datasource automatisch aktualisiert (bestehende `renovate.json` erfasst
  Helm-Chart-Dependencies).

---

## Offene Entscheidungen

_Keine. Alle Punkte wurden im Brainstorming geklärt._
