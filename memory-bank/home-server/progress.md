# Progress

## Recent Activity

### fix/remove-tinyteller (offen 2026-06-12)
TinyTeller vollständig aus dem Repo entfernt: Ansible-Rolle, Playbook,
host_vars, group_vars, Homepage-Kachel, CLAUDE.md, memory-bank.

### PR #159 gemergt (2026-06-12) — Homepage Layout-Redesign
7 Sektionen → 4 (Cluster, Media, NAS, Tools). Icon-Fixes für Semaphore,
OpenCode, Day Pilot, Gameserver-UI (alle mdi-* Icons).

### feat/ugreen-nas-migration (PR #47 gemergt)
Migration ugreen-paperless → home-server: alle NAS-Dienste (Paperless-NGX,
OpenCode, Day Pilot) jetzt aus diesem Repo verwaltbar.

## NAS-Dienste (aktiv)
- Paperless-NGX (Port 8000)
- OpenCode (Port 4096)
- Day Pilot (Port 3003)
- Node Exporter + cAdvisor

## Known Issues
- TinyTeller läuft noch auf NAS unter /opt/tinyteller — manuell stoppen/entfernen
- Nach Merge: `make semaphore-bootstrap` ausführen (Template-Description aktualisieren)

## Was als nächstes kommt
1. fix/remove-tinyteller mergen
2. TinyTeller auf NAS manuell abschalten
3. `make semaphore-bootstrap` ausführen
