---
name: forgecrate-batch-issues
description: Use when you want to autonomously resolve several open GitHub issues at once — assigns up to 5 issues to yourself, works them in parallel via isolated sub-agents, and opens one pull request per issue.
---

# Batch-Issue-Resolver

Bearbeitet bis zu 5 GitHub-Issues **parallel** mit isolierten Sub-Agenten. Jeder Sub-Agent
führt für genau ein Issue den vollständigen `forgecrate-issue-resolver`-Workflow aus —
von Analyse bis Merge-Ready-PR. Dieser Skill orchestriert nur; die eigentliche Arbeit pro
Issue macht der bestehende Issue-Resolver.

Superpowers-Skills sind **verpflichtende Workflows**, keine Vorschläge. Fortschritt wird je
Issue als Issue-Kommentar dokumentiert.

---

## Argumente (`$ARGUMENTS`)

Alle optional, frei kombinierbar:

- `count:N` — Anzahl parallel zu bearbeitender Issues. **Default 5, Maximum 5.**
- `label:<name>` — nur Issues mit diesem Label berücksichtigen.
- explizite Issue-Nummern (z. B. `12 15 18`) — diese haben Vorrang vor der Auto-Auswahl.

Ohne Argumente werden automatisch die nächsten sinnvollen Issues gewählt (siehe Phase A).

---

## Ablauf

### Phase A — Auswahl & Zuweisung (Hauptagent)

1. **Eigenen Account ermitteln:** `mcp__github__get_me` → Login für die Zuweisung.
2. **Kandidaten holen:** `mcp__github__list_issues` (`state: open`, ggf. `labels` aus
   `label:`-Argument). Reihenfolge: **nicht zugewiesene zuerst, ältester zuerst.**
   Überspringen: Issues, die bereits einen Assignee haben, mit einem offenen PR verknüpft
   sind oder als `blocked`/`wontfix` gelabelt sind. Explizit übergebene Nummern immer
   einbeziehen (auch ohne weitere Filter).
3. **Auf N begrenzen** (Default 5, hart gedeckelt bei 5). Sind weniger sinnvolle Issues
   vorhanden, mit der kleineren Menge weitermachen und das vermerken.
4. **Zuweisen:** jedes ausgewählte Issue dem aktuellen User zuweisen via
   `mcp__github__issue_write` (`assignees: [<login>]`).
5. **→ Kurzkommentar je Issue** (`🤖 Batch gestartet`) via `mcp__github__add_issue_comment`,
   in der Sprache des Issues.

### Phase B — Parallele Bearbeitung (ein Sub-Agent pro Issue)

Pro ausgewähltem Issue **einen Sub-Agenten über das Agent-Tool** starten — **alle in einer
einzigen Nachricht** dispatchen, damit sie echt parallel laufen:

- `isolation: "worktree"` — jeder Issue bekommt einen eigenen, isolierten Worktree/Branch.
- `run_in_background: true` — Hintergrund-Ausführung, kein Blockieren.
- Eindeutige `description` je Agent, z. B. `Issue-Resolver #<nr>: <kurz>` (3–5 Wörter,
  Rolle + Aufgabe) — verhindert Verwechslungen im FleetView-Dashboard.
- `model: sonnet` für die Umsetzung (gemäß Rollen-Tabelle „Entwickler" in `CLAUDE.md`).

**Sub-Agent-Prompt** (je Issue) weist an:

> Führe den `forgecrate-issue-resolver`-Workflow für Issue #<nr> end-to-end aus:
> Verstehen → Brainstorming → Plan → TDD → Verifikation → PR. Die verpflichtenden
> Superpowers-Skills (`brainstorming`, `test-driven-development`,
> `verification-before-completion`, bei Bugs `systematic-debugging`) sind Pflicht.
> Erstelle am Ende einen PR mit `Closes #<nr>` und gib **PR-Nummer und PR-URL** zurück.
> Bleibe strikt im Scope dieses einen Issues.

Vgl. Base-Matrix „Parallelisierung & Isolation" in `CLAUDE.md` sowie
`flavors/github/CLAUDE.md` („Multiagent & Subagenten").

### Phase C — Aggregation (Hauptagent)

1. Auf Abschluss **aller** Sub-Agenten warten.
2. Pro Issue PR-Erstellung bestätigen (jeder Sub-Agent öffnet seinen PR via
   `mcp__github__create_pull_request` mit `Closes #<nr>`). Endet ein Sub-Agent **ohne** PR:
   Ursache prüfen, einmal gezielt nachfassen, sonst als Fehlschlag melden.
3. **Abschluss-Übersicht** als Tabelle ausgeben:

   | Issue | Branch | PR | Status |
   |---|---|---|---|
   | #12 | fix/12-… | #34 | ✅ offen |
   | #15 | feat/15-… | — | ⚠️ fehlgeschlagen |

---

## Tool-/Skill-Übersicht

| Phase | Tools / Skill |
|---|---|
| A Auswahl & Zuweisung | `mcp__github__get_me`, `list_issues`, `issue_write`, `add_issue_comment` |
| B Parallel-Dispatch | Agent-Tool (`isolation: "worktree"`, `run_in_background: true`) → `forgecrate-issue-resolver` |
| C Aggregation | `mcp__github__pull_request_read`, `create_pull_request` (durch Sub-Agent) |

---

## Constraints

- **Maximal 5** Issues parallel — `count:` wird hart bei 5 gedeckelt.
- Keine bereits zugewiesenen oder mit offenem PR verknüpften Issues kapern.
- Je Issue **separater** Branch, Worktree und PR — keine Sammel-PRs.
- Ein fehlschlagender Issue bricht die übrigen **nicht** ab; Fehlschlag pro Issue
  dokumentieren und in der Abschluss-Übersicht ausweisen.
- Eskalationsregeln des `forgecrate-issue-resolver` gelten je Sub-Agent (nur in den dort
  definierten Fällen rückfragen).
- Issue-Kommentare in der Sprache des Original-Issues.
