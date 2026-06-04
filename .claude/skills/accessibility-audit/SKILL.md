# Accessibility Audit

Prüft Barrierefreiheit in geänderten UI-Komponenten.

## Ablauf

1. **Geänderte Dateien ermitteln** — nur existierende Dateien (keine gelöschten):
   ```bash
   git diff --name-only --diff-filter=d | grep -E '\.(tsx?|jsx?|vue|svelte|html|css|scss)$'
   ```
   Falls keine UI-Dateien geändert wurden: "Keine UI-Dateien geändert — Audit übersprungen."

2. **Für jede Datei prüfen:**

   **Fehlende `alt`-Attribute:**
   ```bash
   grep -nE '<img[[:space:]>]' <datei> | grep -v 'alt='
   ```

   **Interaktive Elemente ohne Label:**
   ```bash
   grep -nE '<(button|a)[[:space:]>]' <datei> | grep -vE 'aria-label|aria-labelledby'
   ```
   Prüfe zusätzlich ob der Button/Link sichtbaren Textinhalt hat (kein reines Icon ohne Label). Multiline-JSX (Attribute auf Folgezeilen) manuell prüfen.

   **Formular-Inputs ohne `<label>`:**
   ```bash
   grep -nE '<(input|textarea|select)[[:space:]>]' <datei> | grep -vE 'type="hidden"|aria-label|aria-labelledby'
   ```
   Für jeden Fund mit einer `id`-Attribut: prüfe ob ein `<label for="<id>">` existiert:
   ```bash
   grep -oE 'id="[^"]+"' <datei> | while read id_attr; do
     id="${id_attr#id=\"}"; id="${id%\"}"
     grep -q "for=\"$id\"" <datei> || echo "KEIN LABEL für id='$id'"
   done
   ```

   **Inline-Farbkontrast-Warnung:**
   ```bash
   grep -nE 'color:\s*(#[fF]{3}[^0-9a-fA-F]|#[fF]{6}|white|rgb\(255,\s*255,\s*255\))' <datei>
   ```
   Warnung wenn sehr helle Textfarbe verwendet wird (möglicher Kontrast-Verlust auf hellem Hintergrund).

3. **Ausgabe** — Befunde mit Datei und Zeile:
   ```
   components/Button.tsx:12  <img> ohne alt-Attribut
   components/Nav.tsx:34     <button> ohne aria-label und ohne sichtbaren Text
   ```
   Bei keinen Befunden: "Keine Barrierefreiheitsprobleme gefunden."

## Hinweise

- Kein Ersatz für echte Screenreader-Tests — deckt die häufigsten statischen Fehler ab.
- Multiline-JSX-Attribute (Button-Label auf Folgezeile) können nicht per grep erkannt werden — manuell prüfen.
- Generierte Dateien (`*.min.js`, `dist/`, Build-Output) überspringen.
