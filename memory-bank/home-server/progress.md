# Progress

## Recent Activity

### feat/ugreen-nas-migration (offen, PR ausstehend)
Migration ugreen-paperless → home-server: alle NAS-Dienste (Paperless-NGX,
OpenCode, TinyTeller, Day Pilot) jetzt aus diesem Repo verwaltbar.
16 Commits, branch gepusht, Review-Issues behoben.

### claude/open-issues-batch-pr-rNHG0 (gemergt via PR #46)
9 Review-Issues aus Epic #34 in einem PR adressiert.

## Verifikation (feat/ugreen-nas-migration)
- yamllint: nur Pre-existing-Warnings (opencode line-length, gotify line-length)
- ansible-playbook --syntax-check: PASS (site.yml + ugreen-nas.yml)
- Alle 5 Rollen vorhanden und lint-sauber

## Known Issues
- helm lokal nicht installierbar → `helm lint` nur über CI gedeckt
- 60 vorbestehende var-naming[no-role-prefix] als Warnung (Konvention)
- node_exporter_nas: changed_when: false + force-recreate (pre-existing, kein Blocker)

## Was als nächstes kommt
1. PR feat/ugreen-nas-migration reviewen/mergen
2. vault.yml für ugreen-nas mit echten Secrets befüllen
3. `make semaphore-bootstrap` ausführen
4. `make nas` erstmalig gegen NAS ausführen
5. ugreen-paperless Repo auf GitHub archivieren
