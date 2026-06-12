# Gameserver-UI: Veraltete Properties entfernen

**Datum:** 2026-06-12
**Status:** Design genehmigt
**Branch:** `feat/gameserver-ui-remove-deprecated-props`

## Problem / Ziel

Die serverconfig.xml kann veraltete Properties enthalten, die das V2.6-Schema nicht
kennt (z. B. `ControlPanelEnabled/Port/Password` — in V2.6 durch `WebDashboard*`
ersetzt). Diese landen in der Config-UI in der Gruppe „Sonstige". Es soll möglich
sein, sie direkt aus der UI zu **entfernen**.

## Scope

Entfernen wird **nur für die Gruppe „Sonstige"** angeboten (unbekannte/veraltete
Properties, kein V2.6-Schema-Eintrag). Bekannte V2.6-Settings bleiben geschützt
(für sie wäre „Entfernen" = Rückfall auf Default, das ist hier nicht gewollt).

## Design

### `removeProperty(xml, name)` (`src/lib/serverconfig.ts`)

Pure-Function: entfernt die `<property name="…" value="…"/>`-Zeile (inkl. evtl.
nachgestelltem `<!-- … -->`-Kommentar bis Zeilenende). Nicht vorhandene Namen →
unverändert (no-op). Andere Properties bleiben unangetastet.

### UI (`config/page.tsx` + `ConfigFieldControl.tsx`)

- In der Gruppe „Sonstige" je Feld ein **🗑-Button**.
- Klick markiert die Property zum Entfernen: visuell durchgestrichen/abgeblendet,
  Button wechselt zu „↩ Rückgängig" (Undo). State: `removals: Set<string>`.
- Markierte Felder zählen als Änderung (Änderungszähler am Speichern-Button).
- Beim Speichern: zuerst `edits` via `serializeProperties` anwenden, dann für jede
  markierte Property `removeProperty`. Danach unverändert: XML schreiben →
  `docker restart` → NAS-Persist.
- `removeProperty` wird nur auf Namen angewandt, deren Feld-Gruppe „Sonstige" ist
  (UI bietet den Button nur dort an).

### Tests (TDD)

- `removeProperty`: entfernt die Ziel-Zeile (mit/ohne nachgestellten Kommentar),
  lässt andere Properties erhalten, no-op bei unbekanntem Namen, XML bleibt valide.

## Out of Scope (YAGNI)

- Entfernen bekannter V2.6-Properties / „Auf Default zurücksetzen".
- Bulk-„alle veralteten entfernen"-Aktion (einzeln reicht).
