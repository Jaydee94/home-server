# Test Coverage

Analysiert Testabdeckung und schlägt den nächsten konkreten Test vor.

## Ablauf

1. **Build-System erkennen** — prüfe in dieser Reihenfolge:
   - `go.mod` vorhanden → Go
   - `package.json` vorhanden → Node/Jest
   - `pyproject.toml` oder `pytest.ini` vorhanden → Python
   - Keines gefunden: frage "Welches Build-System/Test-Framework verwendest du?"

2. **Coverage-Report erzeugen**

   *Go:*
   ```bash
   go test -coverprofile=coverage.out ./...
   go tool cover -func=coverage.out | grep -v "100.0%"
   ```
   Bei Compile-Fehler: Fehler ausgeben, Skill beenden.

   *Node/Jest:*
   ```bash
   npx jest --coverage --coverageReporters=text 2>&1
   ```
   Bei fehlendem Jest: `npm test -- --coverage 2>&1`

   *Python:*
   ```bash
   pytest --cov --cov-report=term-missing 2>&1
   ```
   Bei fehlendem pytest-cov: `pip install pytest-cov` vorschlagen.

3. **Lücken auflisten** — sprachspezifisch:

   *Go:* Zeilen mit `0.0%` aus `go tool cover -func`-Output:
   ```
   internal/deploy/deploy.go:copyFile     0.0%
   ```

   *Jest:* Spalten "Uncovered Lines" aus der Coverage-Tabelle — Dateien mit nicht-leerer "Uncovered Lines"-Spalte.

   *Python:* Zeilen mit `MISS`-Spalte aus `--cov-report=term-missing`-Output.

   Top 5 nach Anzahl ungedeckter Zeilen (meiste zuerst). Falls alle Funktionen abgedeckt: "100% Coverage — nichts zu tun." und Skill beenden.

4. **Nächsten Test vorschlagen** — für die Funktion/Datei mit den meisten ungedeckten Zeilen:
   - Funktion/Methode benennen
   - Sinnvollen Testfall formulieren: Eingabe, Erwartung, Randfall
   - Dateiname und Testfunktionsname vorschlagen

   Beispiel (Go):
   ```go
   // internal/deploy/deploy_test.go
   func TestCopyFileCreatesParentDirs(t *testing.T) {
       // prüft ob copyFile fehlende Parent-Verzeichnisse anlegt
   }
   ```

5. **Fragen** — "Soll ich diesen Test anlegen?"

## Hinweise

- Manuell auslösen, kein automatischer Hook.
- Fokus auf Verhalten, nicht auf Line-Coverage als Selbstzweck.
- Partial Coverage (z.B. 20%) nicht ignorieren — diese Funktionen erscheinen nicht in der Top-5-Liste, können aber bei Bedarf explizit angefragt werden.
