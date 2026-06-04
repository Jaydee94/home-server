# Catch-up

Kurzer Aktivitäts-Digest der letzten N Tage (Default 7) — Git-Commits,
Projekt-Kontext und GitHub-Aktivität — damit man nach einer Pause sofort auf dem
aktuellen Stand ist. **Reiner Lese-Skill**, schreibt nichts.

Leitprinzip: **kurz und verdichtet, nicht ausführlich**. Keine Roh-Logs dumpen,
nur das Wesentliche.

## Ablauf

**Schritt 0 — Zeitfenster bestimmen:**

Default ist `7` Tage. Nennt der Nutzer beim Aufruf eine Angabe (z.B. „3 Tage",
„seit gestern", „14d", „2 Wochen"), diese in eine Tageszahl `N` umsetzen. Daraus
ableiten:

```bash
N=7   # bzw. vom Nutzer angegeben
git log -1 --format=%cd --date=short   # Orientierung: jüngster Commit
date -d "$N days ago" "+%Y-%m-%d" 2>/dev/null || date -v-"${N}"d "+%Y-%m-%d"
```

Das berechnete Anker-Datum dient als „seit"-Marke in der Überschrift.

**Schritt 1 — Git-Aktivität (lokal, immer verfügbar):**

```bash
git log --since="$N days ago" --no-merges --pretty=format:'%h %ad %s' --date=short
git shortlog -sn --since="$N days ago" --no-merges   # Beitragende
```

Commits semantisch gruppieren nach Conventional-Commit-Präfix
(`feat`/`fix`/`docs`/`refactor`/`chore`/`test`/sonstige) und je Gruppe **nur die
Anzahl** plus 1–2 auffällige Datei-/Verzeichnisbereiche nennen (aus den
Commit-Messages oder `git diff --stat` ableitbar). Bei 0 Commits im Fenster den
Abschnitt komplett weglassen.

**Schritt 2 — Projekt-Kontext (memory-bank):**

Via `mcp__memory-bank__memory_bank_read` lesen:

- `activeContext.md` → aktuelle Blocker / offene Fragen
- `progress.md` → „In Arbeit" und „Was als nächstes kommt"

Nur die **Kernpunkte** extrahieren (Stichworte), nicht den Dateiinhalt zitieren.
Direktes Lesen der `memory-bank/`-Dateien via Read-Tool ist laut CLAUDE.md
verboten — ausschließlich das MCP-Tool nutzen. Fehlt die memory-bank oder ist sie
leer, den Abschnitt überspringen.

**Schritt 3 — GitHub-Aktivität (best-effort):**

Über die `github`-MCP-Tools, bezogen auf das Anker-Datum aus Schritt 0:

- gemergte/geschlossene PRs seit dem Fenster — `mcp__github__list_pull_requests`
  (state `closed`), nach `updated`/`merged` im Fenster filtern
- offene PRs mit Review-Bedarf — `mcp__github__list_pull_requests` (state `open`)
- neue/aktualisierte Issues — `mcp__github__search_issues` mit
  `updated:>=<anker-datum>` (oder `mcp__github__list_issues`)

Das Repo (`owner/name`) aus dem git-Remote ableiten
(`git remote get-url origin`). Steht kein GitHub-Zugang / Token zur Verfügung
oder schlägt ein Aufruf fehl, den Abschnitt **still überspringen** (fail-open) —
der Digest funktioniert auch ohne GitHub.

**Schritt 4 — Ausgabe (kurz halten — Pflicht):**

Kompakter Markdown-Digest, Zielmarke **≤ ~15 Zeilen**, Bullet-Form, jede Quelle
ein Block, leere Blöcke weglassen, abschließend ein **TL;DR** in genau einem Satz.
Schablone:

```
## 📋 Catch-up — letzte 7 Tage (seit 2026-05-23)

**Code (12 Commits)** — feat ×3 · fix ×5 · docs ×2 · Schwerpunkt: internal/deploy
**Kontext** — In Arbeit: … · Blocker: … · Nächstes: …
**GitHub** — ✅ gemergt: #12, #15 · 🔓 offen/Review: #18 · 🆕 neu: #20

**TL;DR**: <ein Satz>.
```

Nicht ausführlich werden, keine vollständigen Commit-Listen oder Roh-Ausgaben
einfügen — nur das Verdichtete.
