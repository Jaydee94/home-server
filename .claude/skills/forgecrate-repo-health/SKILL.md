# Repo Health

Analysiert das Repo auf Verbesserungspotenzial und gibt eine priorisierte Liste zurück.

## Ablauf

Führe die folgenden Checks der Reihe nach durch und sammle Befunde:

1. **Testabdeckung** — prüfe ob öffentliche Funktionen/Methoden Testfälle haben. Suche nach Dateien ohne zugehörige `_test`-Datei. Melde fehlende Tests mit Dateipfad.

2. **Veraltete Abhängigkeiten**
   - Go: `go list -m -u all 2>/dev/null | grep '\[v'`
   - Node: `npm outdated 2>/dev/null`
   - Python: `pip list --outdated 2>/dev/null`

3. **Dead Code / ungenutzte Exports** — suche nach exportierten Symbolen, die im Repo nicht referenziert werden:
   - Go: `grep -r "^func [A-Z]" --include="*.go" -h | awk '{print $2}' | cut -d'(' -f1` und prüfe Verwendung
   - Melde auffällige Kandidaten (kein automatischer False-Positive-Filter nötig)

4. **Dokumentation** — prüfe ob `README.md` vorhanden und nicht älter als 6 Monate (letzter Commit auf diese Datei). Prüfe ob `CHANGELOG.md` existiert.

5. **Sicherheitsmuster** — suche nach:
   - Hardcoded Secrets: `grep -rn "password\|secret\|api_key\|token" --include="*.go" --include="*.ts" --include="*.py" -i`
   - Unsichere Patterns: `exec.Command` mit String-Konkatenation, `fmt.Sprintf` in SQL-Queries

## Ausgabe

Nummerierte Liste, priorisiert nach Schwere (kritisch → wichtig → nice-to-have):

```
1. [KRITISCH] Hardcoded secret in internal/config/config.go:42
2. [WICHTIG] 3 öffentliche Funktionen ohne Tests: deploy.CopyDir, deploy.CopyFile, …
3. [WICHTIG] 5 Abhängigkeiten veraltet (go.sum): golang.org/x/net v0.0.1 → v0.38.0
4. [NICE] README.md zuletzt geändert vor 8 Monaten
```

Maximal 10 Punkte — lieber weniger, dafür präzise mit Datei- und Zeilenverweis.
