# Active Context

## Aktueller Branch
feat/ugreen-nas-migration

## Aktueller Fokus
Migration des ugreen-paperless Repos: alle NAS-Rollen in home-server integriert,
sodass UGREEN NAS und Home-Server aus einem einzigen Repo gepflegt werden.

## Erledigt in diesem Branch
- Inventory erweitert: `ugreen-nas` in Gruppe `ugreen_nas`, auch in `semaphore_targets`
- `ansible/host_vars/ugreen-nas/vars.yml` mit allen Service-Variablen angelegt
- `ansible/host_vars/ugreen-nas/vault.yml.example` als Dokumentations-Template
- `.gitignore` um `ansible/host_vars/*/vault.yml` erweitert
- 5 Rollen migriert: `paperless`, `node_exporter_nas`, `opencode`, `tinyteller`, `day_pilot`
- Sicherheits-Fix: paperless_db_password/secret_key Defaults auf "" + assert-Guard
- Neues Playbook `ansible/ugreen-nas.yml` (hosts: ugreen_nas)
- Makefile: `make nas` und `make nas-check` Targets
- ArgoCD Monitoring: `VMStaticScrape` für NAS Node-Exporter (9100) und cAdvisor (18080)
- Semaphore: `semaphore_projects` in group_vars/all.yml — ugreen-paperless → ugreen-nas
- CLAUDE.md: Commands und Service URLs aktualisiert

## Nicht migriert (gefallene Entscheidungen)
- `gotify` — läuft als k8s-App im Cluster
- `monitoring` — NAS-Metriken via VMStaticScrape in bestehenden Stack integriert
- `paperless-ai` — kubepi existiert nicht mehr
- `scanner-pi` — kubepi existiert nicht mehr

## Offene Punkte nach Merge
- vault.yml für ugreen-nas mit echten Secrets befüllen (vault.yml.example als Vorlage)
- `make semaphore-bootstrap` ausführen um Semaphore-Projekt ugreen-nas zu erstellen
- `make nas` erstmalig gegen NAS ausführen
- ugreen-paperless Repo auf GitHub archivieren (read-only)
- node_exporter_nas Idempotenz: changed_when: false + force-recreate (pre-existing, separater Task)
