# Progress

## Recent Activity
Batch-PR auf branch `claude/open-issues-batch-pr-rNHG0`: 9 Review-Issues aus
Epic #34 in einem PR adressiert (Details in activeContext.md).

## Verifikation (lokal)
- `.claude/hooks/pre-tool-test.sh`: 22/22 grün (inkl. neuer 2>&1-/`>&2`-Regression).
- `yamllint -c .yamllint ansible/ argocd/`: nur vorbestehende Warnungen
  (gotify line-length); generiertes Manifest hat `---`.
- `ansible-lint ansible/`: 0 Fehler (60 var-naming[no-role-prefix] als Warnung
  via warn_list — repo-weite Konvention, separater Refactor).
- `make render-bootstrap`-Template == committed root-applicationset.yaml
  (diff: IDENTICAL, kein Drift).
- Lint-Loop erkennt alle 8 Charts; 4 mit deps (headlamp, kubeseal-webgui,
  monitoring, sealed-secrets) lösen `helm dependency build` aus.

## Known Issues
- helm lokal nicht installierbar -> `helm lint` nur über CI gedeckt.
- 60 vorbestehende var-naming[no-role-prefix] bewusst als Warnung belassen.

## Was als nächstes kommt
PR reviewen/mergen; GitHub schliesst #35/#37/#38/#39/#40/#42/#43/#44/#45 via
"Closes" automatisch. Epic #34 danach manuell schliessen.
