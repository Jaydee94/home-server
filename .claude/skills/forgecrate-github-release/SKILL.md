# GitHub Release

Wird **nach** dem `release`-Skill aufgerufen. Erstellt ein GitHub Release für den soeben erstellten Tag.

## Voraussetzung

`gh` CLI ist installiert und authentifiziert (`gh auth status`).

## Ablauf

1. **Letzten Tag ermitteln**
   ```bash
   TAG=$(git describe --tags --abbrev=0)
   echo "Release für: $TAG"
   ```

2. **Changelog-Abschnitt extrahieren** — suche in `CHANGELOG.md` den Abschnitt zwischen dem aktuellen und dem vorherigen Tag-Header:
   ```bash
   NOTES=$(awk "/^## \[$TAG\]|^## $TAG/{found=1; next} found && /^## /{exit} found{print}" CHANGELOG.md)
   ```
   Falls kein CHANGELOG vorhanden oder `$NOTES` leer: frage nach Release Notes.

3. **GitHub Release erstellen**
   ```bash
   gh release create "$TAG" \
     --title "$TAG" \
     --notes "$NOTES"
   ```

4. **Assets anhängen** — prüfe ob `dist/`, `build/` oder `*.tar.gz`-Dateien vorhanden sind:
   ```bash
   gh release upload "$TAG" dist/* 2>/dev/null || true
   ```

5. **Release-URL ausgeben**
   ```bash
   gh release view "$TAG" --json url -q .url
   ```

## Hinweise

- Läuft erst nach erfolgreichem base-`release`-Skill (Tag bereits gepusht).
- Bei Fehler (`gh` nicht installiert, nicht authentifiziert): Fehlermeldung ausgeben, Schritt überspringen.
