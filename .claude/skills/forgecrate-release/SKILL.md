# Release

Führt einen vollständigen Release-Zyklus durch.

## Ablauf

1. **Tests ausführen** — erkenne Build-System (`go.mod` → `go test ./...`, `package.json` → `npm test`, `Makefile` → `make test`) und führe die Tests aus. Schlägt ein Test fehl, stoppe und melde den Fehler.

2. **Changelog prüfen** — suche nach `CHANGELOG.md` oder `CHANGES.md`. Prüfe ob der geplante Release bereits eingetragen ist. Falls nicht: frage nach der Version und trage sie ein (Datum, Änderungen seit letztem Tag).

3. **Version bestimmen** — frage nach der neuen Version (SemVer: `MAJOR.MINOR.PATCH`), wenn nicht angegeben. Prüfe ob der Tag bereits existiert (`git tag -l vX.Y.Z`).

4. **Tag erstellen**
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```

5. **Tag pushen**
   ```bash
   git push origin vX.Y.Z
   ```

6. **CI-Status prüfen** — falls `.github/workflows/` vorhanden: warte auf CI-Ergebnis mit `gh run list --limit 3` und melde den Status.

## Hinweise

- Stoppe bei Testfehlern — niemals einen Release mit roten Tests.
- Prüfe vor dem Tag-Push dass alle Commits auf `origin` gepusht sind.
- Bei Monorepos: frage welches Paket released werden soll.
