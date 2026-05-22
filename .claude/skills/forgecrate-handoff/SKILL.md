# Handoff

Aktualisiert die memory-bank mit dem aktuellen Session-Kontext für AI-Modellwechsel oder Session-Übergabe. Kein externes Tool nötig, kein HANDOFF.md.

## Ablauf

**Schritt 1 — Daten sammeln (sequenziell ausführen):**

```bash
# Git-Info
git branch --show-current && git log --oneline -10 && git status --short
date "+%Y-%m-%d %H:%M:%S"

# TODOs und FIXMEs
grep -rEn '\b(TODO|FIXME)[:([ ]' \
  --include="*.go" --include="*.ts" --include="*.tsx" \
  --include="*.py" --include="*.rs" --include="*.js" \
  . 2>/dev/null | grep -v node_modules | grep -v ".git" | head -20
```

**Schritt 2 — `activeContext.md` via memory-bank MCP schreiben:**

Tool: `memory_bank_write` mit `file_name: "activeContext.md"` und folgendem Inhalt:

```
# Active Context

## Aktueller Branch
<Branch-Name>

## Uncommitted Changes
<git status --short Output, oder "Working tree clean">

## Offene Fragen / Blocker
<Leer lassen — wird manuell gepflegt>
```

**Schritt 3 — `progress.md` via memory-bank MCP schreiben:**

Tool: `memory_bank_write` mit `file_name: "progress.md"` und folgendem Inhalt:

```
# Progress

## Recent Activity
<Ausgabe von `git log --oneline -10`: je Zeile `<hash>` <message>>

## Known Issues
<TODO/FIXME mit file:line — Abschnitt weglassen wenn keine gefunden> (aus grep-Ausgabe Schritt 1)

## Was als nächstes kommt
<Leer lassen — wird manuell gepflegt>
```

**Schritt 4 — Abschluss:**

Dem Nutzer bestätigen: welche Dateien wurden in der memory-bank aktualisiert (ein Satz je Datei).
