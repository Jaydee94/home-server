# Homepage Layout Redesign

**Datum:** 2026-06-12  
**Status:** Approved  
**Branch:** fix/homepage-gameserver-tile (Icon-Fix bereits in PR #159)

## Ziel

Das Layout der homepage (`argocd/apps/homepage/values.yaml`) konsolidieren:
- Sparse Sektionen (1–2 Items) zusammenführen
- Broken Icons durch zuverlässige `mdi-`-Icons ersetzen
- Sektionsreihenfolge nach Nutzungshäufigkeit optimieren (GitOps-first)

## Neue Sektionsstruktur

### Vorher → Nachher

| Alt | Items | → | Neu | Items | Cols |
|---|---|---|---|---|---|
| GitOps & CI/CD | 3 | → | **Cluster** | 6 | 3 |
| Kubernetes | 2 | → | (in Cluster) | — | — |
| Monitoring | 1 | → | (in Cluster) | — | — |
| Media | 2 | → | **Media** | 2 | 2 |
| NAS | 4 | → | **NAS** | 4 | 4 |
| Tools | 3 | → | **Tools** | 4 | 4 |
| Gaming | 1 | → | (in Tools) | — | — |

### Sektionen im Detail

**1. Cluster** (`columns: 3`, 2 Reihen)

```
Reihe 1: ArgoCD (Widget)   Grafana (Widget)   Headlamp
Reihe 2: Argo Workflows    Semaphore          kubeseal-webgui
```

Wichtigste Dienste in Reihe 1, Widgets bleiben bei ArgoCD und Grafana.

**2. Media** (`columns: 2`, 1 Reihe)

```
Jellyfin   Home Assistant
```

**3. NAS** (`columns: 4`, 1 Reihe)

```
Paperless-NGX   OpenCode   TinyTeller   Day Pilot
```

**4. Tools** (`columns: 4`, 1 Reihe)

```
Pi-hole   Gotify   MinIO   Gameserver-UI
```

## Icon-Fixes

| Dienst | Alt | Neu | Grund |
|---|---|---|---|
| Semaphore | `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/semaphore-ui.svg` | `mdi-ansible` | Rendert als ⋮, CDN unzuverlässig |
| Day Pilot | `homer.svg` | `mdi-calendar-clock` | Falsches Icon (Homer-Dashboard) |
| OpenCode | `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/opencode.svg` | `mdi-robot` | 403 auf CDN |
| Gameserver-UI | CDN 403 | `mdi-zombie` | Bereits in PR #159 |

## Keine Änderungen an

- Widgets: ArgoCD und Grafana behalten ihre Widgets; keine neuen werden hinzugefügt
- Top-Bar-Widgets: k3s, Host, Datetime, Search bleiben unverändert
- Service-Konfiguration (href, description): nur Icon und Sektionszugehörigkeit ändern sich
- NAS-Spaltenanzahl bleibt 4 (bereits voll belegt)

## Betroffene Datei

`argocd/apps/homepage/values.yaml`

- `config.settings.layout`: 7 Einträge → 4 Einträge
- `config.services`: Reihenfolge und Gruppierung der Dienste anpassen
- Kein neuer Helm-Chart, kein neues Template nötig

## Abgrenzung zu PR #159

PR #159 fixiert nur `mdi-zombie` für Gameserver-UI und den fehlenden `Gaming`-Layout-Eintrag.
Dieses Redesign ersetzt den `Gaming`-Eintrag vollständig (Gaming fällt als Sektion weg).
PR #159 wird **zuerst in main gemergt**; der Implementierungs-Branch für dieses Redesign basiert auf dem aktualisierten main. Alternativ: Redesign-Branch von `fix/homepage-gameserver-tile` ableiten und die `Gaming`-Sektion dort direkt entfernen.
