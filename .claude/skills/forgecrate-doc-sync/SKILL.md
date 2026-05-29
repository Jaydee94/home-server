# Doc Sync

Gleicht alle Dokumentationsdateien im Repo mit dem aktuellen Code-Stand ab
und aktualisiert veraltete Abschnitte direkt. Kein interaktiver Modus —
der Skill arbeitet durch und liefert am Ende einen kompakten Report.

## Scope

| Doku-Typ | Verhalten |
|---|---|
| `docs/*.md` | Analysiert; veraltete Abschnitte werden neu geschrieben |
| `README.md` | Wie `docs/*.md`; Fokus auf Installation, Konfiguration, Beispiele |
| `CHANGELOG.md` | Kein Auto-Edit; Warnung wenn Commits seit letztem Eintrag existieren |
| `*.go` GoDoc | Exportierte Symbole ohne Kommentar werden ergänzt; veraltete Kommentare korrigiert |

## Ablauf

**Vor Phase 1 — immer ausführen: CHANGELOG-Check**

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  COUNT=$(git log "${LAST_TAG}..HEAD" --oneline | wc -l | tr -d ' ')
  echo "CHANGELOG.md: $COUNT Commits seit $LAST_TAG"
else
  echo "CHANGELOG.md: kein Tag gefunden — manuell prüfen"
fi
```

**Phase 1 — Git-Delta-Filter**

Für jede Doku-Datei den Zeitstempel des letzten Commits ermitteln und
Code-Dateien identifizieren die danach geändert wurden:

```bash
for doc in docs/*.md README.md; do
  [ -f "$doc" ] || continue
  newer=$(find . -name "*.go" -not -path "./.git/*" -newer "$doc" 2>/dev/null | head -5)
  [ -n "$newer" ] && echo "VERDÄCHTIG: $doc" && echo "$newer"
done
```

GoDoc-Filter — exportierte Symbole in `.go`-Dateien ohne Kommentar direkt
davor:

```bash
find . -name "*.go" -not -path "./.git/*" | while read f; do
  grep -n "^func [A-Z]\|^type [A-Z]\|^var [A-Z]\|^const [A-Z]" "$f" | while IFS=: read lineno content; do
    prev_line=$(( lineno - 1 ))
    if [ "$prev_line" -gt 0 ]; then
      comment=$(sed -n "${prev_line}p" "$f")
      echo "$comment" | grep -q "^//" || echo "KEIN GODOC: $f:$lineno — $content"
    fi
  done
done
```

Dateien die älter als 90 Tage sind aber keine verdächtigen Code-Änderungen
haben, separat markieren:

```bash
NOW=$(date +%s)
for doc in docs/*.md README.md; do
  [ -f "$doc" ] || continue
  doc_ts=$(git log -1 --format="%ct" -- "$doc" 2>/dev/null || echo 0)
  age=$(( (NOW - doc_ts) / 86400 ))
  [ "$age" -gt 90 ] && echo "ALT (${age}d): $doc"
done
```

**Phase 2 — KI-Analyse**

Für jedes verdächtige Code/Doku-Paar (aus Phase 1):

1. Code-Datei lesen (Read-Tool)
2. Korrespondierende Doku-Datei lesen (Read-Tool)
3. Inhaltliche Abweichungen identifizieren:
   - Veraltete Beschreibungen (Funktion umbenannt, Signatur geändert)
   - Fehlende Abschnitte für neue Features oder Flags
   - Nicht mehr existierende Symbole oder Kommandos in Beispielen

**Mapping Code → Doku** (forgecrate-spezifisch, für andere Repos über
Schlagwörter erschließen):

| Code-Pfad | Betroffene Doku |
|---|---|
| `internal/compose/` | `docs/layer-system.md` |
| `internal/deploy/` | `docs/flows.md`, `docs/architecture.md` |
| `internal/extensions/` | `docs/architecture.md` |
| `cmd/forgecrate/` | `README.md`, `docs/flows.md` |
| `profiles/`, `flavors/` | `docs/profiles-flavors.md` |
| `base/hooks/` | `docs/hooks.md` |

Für Repos ohne dieses Mapping: Paket-Name oder Dateiname der Code-Datei als
Suchbegriff in allen docs/*.md und README.md verwenden. Wird der Begriff in
einer Doku-Datei gefunden, gilt diese als potenzielle Entsprechung.

Für GoDoc-Treffer aus Phase 1: Den umliegenden Code-Kontext lesen (2–3 Zeilen
vor und nach dem Symbol) und einen präzisen Ein-Satz-Kommentar ableiten, der
beschreibt was die Funktion/Typ tut.

**Phase 3 — Gezieltes Rewrite**

Für jeden als veraltet identifizierten Abschnitt:

- Nur den betroffenen Abschnitt neu schreiben (Edit-Tool)
- Niemals die ganze Datei ersetzen — `old_string` muss den exakten
  veralteten Abschnitt enthalten, `new_string` den aktualisierten
- Bestehende Überschriften, Formatierung und Dateistruktur beibehalten
- Sprache: automatisch aus bestehendem Dateiinhalt erkennen und beibehalten
- Ton: präzise und technisch, keine Marketing-Sprache
- Länge: so kurz wie möglich ohne Informationsverlust

GoDoc-Kommentare direkt in `.go`-Dateien ergänzen oder korrigieren:

```
// FunctionName beschreibt in einem Satz was die Funktion tut.
func FunctionName(...) ...
```

CHANGELOG.md nicht editieren — Ergebnis des CHANGELOG-Checks (vor Phase 1)
in den Ausgabe-Report übernehmen.

Der Skill läuft ohne Unterbrechung durch. Keine Rückfragen an den Nutzer.

## Ausgabe

```
## Doc Sync — Ergebnis

### Aktualisiert
- docs/architecture.md — Abschnitt "Architektur" (internal/deploy geändert)
- README.md — Abschnitt "Installation" (cmd/forgecrate geändert)
- internal/deploy/deploy.go — GoDoc für CopyDir, MergeFiles

### Keine Änderung nötig
- docs/layer-system.md
- docs/profiles-flavors.md

### Hinweise
- CHANGELOG.md: 12 Commits seit v0.9.0
- docs/hooks.md: keine verdächtigen Code-Änderungen, aber 95 Tage alt — manuell prüfen empfohlen
```
