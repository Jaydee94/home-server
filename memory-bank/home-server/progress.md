# Progress

## Recent Activity

### feat/ugreen-nas-migration (PR #47 offen, CI-Fix gepusht 2026-05-26)
Migration ugreen-paperless → home-server: alle NAS-Dienste (Paperless-NGX,
OpenCode, TinyTeller, Day Pilot) jetzt aus diesem Repo verwaltbar.
17 Commits, PR #47 erstellt, CI-Fixes für ansible-lint gepusht.

CI-Fixes:
- `ansible.builtin.yum` → `ansible.builtin.dnf` (fqcn[action-core])
- Lange `when:`-Bedingung in opencode gesplittet (yaml[line-length])

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
1. CI auf PR #47 abwarten und mergen
2. vault.yml für ugreen-nas mit echten Secrets befüllen
3. `make semaphore-bootstrap` ausführen
4. `make nas` erstmalig gegen NAS ausführen
5. ugreen-paperless Repo auf GitHub archivieren
