# Active Context

## Aktueller Branch
fix/remove-tinyteller (PR offen)

## Aktueller Fokus
TinyTeller vollständig aus dem Repo entfernt — Ansible-Rolle, Playbook-Eintrag,
host_vars, group_vars, Homepage-Kachel, CLAUDE.md, memory-bank.

## Erledigt in diesem Branch
- `ansible/roles/tinyteller/` gelöscht
- `ansible/ugreen-nas.yml`: tinyteller-Rolle entfernt
- `ansible/host_vars/ugreen-nas/vars.yml`: TinyTeller-Abschnitt entfernt
- `ansible/group_vars/all.yml`: TinyTeller aus Semaphore-Template-Description entfernt
- `argocd/apps/homepage/values.yaml`: TinyTeller-Kachel aus NAS-Sektion entfernt
- `CLAUDE.md`: TinyTeller aus Service-URLs-Tabelle entfernt
- memory-bank aktualisiert

## Zuletzt vor diesem Branch
### PR #159 gemergt (Homepage Layout-Redesign)
- 7 Sektionen → 4: Cluster, Media, NAS, Tools
- Icons gefixt: mdi-ansible, mdi-robot, mdi-calendar-clock, mdi-zombie
- Spec + Plan unter docs/superpowers/

## Offene Punkte
- TinyTeller auf NAS manuell stoppen/entfernen (Docker Compose down, /opt/tinyteller löschen)
- `make semaphore-bootstrap` ausführen um Semaphore-Template neu zu deployen (ohne TinyTeller)
