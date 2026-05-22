---
name: forgecrate-issue-resolver
description: Use when starting autonomous end-to-end work on a GitHub issue — from first analysis to a merge-ready pull request, without interrupting the user.
---

# Issue-Resolver

Autonomer Senior-Entwickler-Workflow: Issue `$ARGUMENTS` end-to-end bearbeiten — von Analyse bis Merge-Ready-PR — ohne Rückfragen.

Superpowers-Skills sind **verpflichtende Workflows**, keine Vorschläge. Fortschritt wird als Issue-Kommentare dokumentiert.

---

## Ablauf

### 1. Verstehen (`using-superpowers`)
Issue als Assignee beanspruchen, Status auf „in progress" setzen. Issue vollständig lesen: Body, Labels, Sub-Issues, Kommentare, Querverweise. Betroffene Codepfade analysieren (`git log`, `git blame`, Tests, Patterns).

### 2. Brainstormen (`brainstorming`)
Mindestens 2–3 grundlegend verschiedene Lösungsansätze entwickeln. Für jeden: Kurzbeschreibung, Trade-offs (Komplexität, Performance, Wartbarkeit, Risiko), Aufwand (S/M/L).

**→ Issue-Kommentar `🧠 Brainstorming`** mit Optionen, Trade-offs, finalem Design.

### 3. Planen (`writing-plans`)
Besten Ansatz wählen. Plan mit 2–5-Minuten-Tasks erstellen: exakte Datei-/Funktionspfade, Code-Stubs, Verifikationsschritte.

Teststrategie als eigener Abschnitt:
- **Regressionstest(s):** welche Datei, welche Behauptung, Bezug zu Issue
- **Neue Tests:** Unit / Integration / E2E pro Ebene, Edge-Cases
- **Coverage-Ziel:** Vorher/Nachher für geänderte Pfade, nie regressieren
- **Akzeptanzkriterien:** prüfbare Checkliste inkl. „Regressionstest failt ohne Fix"

Branch-Name: `<type>/<issue-id>-<kurz>` — Conventional Commits mit Issue-Referenz.

**→ Issue-Kommentar `📋 Plan`** mit Ansatz, Schritten, Teststrategie, Coverage-Ziel, Akzeptanzkriterien.

### 4. Worktree (`using-git-worktrees`)
Isolierten Worktree auf neuem Branch anlegen. Projekt-Setup ausführen. Test-Baseline (alle Tests grün) verifizieren — **vor** jeder Änderung.

**Multiagent:** Parallelisierung und Subagenten proaktiv einsetzen.
- Task >1 min oder Ergebnis nicht sofort nötig → `run_in_background: true`
- Feature-Branch, Multi-File, langer Plan → `isolation: "worktree"`
- Mehrere unabhängige Tasks → beides kombinieren

### 5. Umsetzen (`subagent-driven-development` oder `executing-plans`)
Plan strikt umsetzen. Atomare Commits, finaler Commit mit `closes #<issue>`. Linting/Formatting/Type-Checks einhalten.

Bei unerwarteten Fehlern: `systematic-debugging` (vierphasige Root-Cause-Analyse). Intern replanen, im Issue dokumentieren — **nicht** den User fragen.

### 6. Tests (`test-driven-development`)
Strikt RED-GREEN-REFACTOR. Code vor Test = löschen und neu anfangen.

- **Regressionstest:** fehlschlagenden Test **vor** dem Fix committen (RED→GREEN in Git-History sichtbar)
- **Boundary/Edge-Cases:** Null/Empty, Race Conditions, Timeouts, negative Eingaben
- **Mutation-Sanity-Check:** zentrale Bedingung invertieren → mindestens ein Test muss fallen
- **Keine flakigen Tests:** kein `sleep`, keine Reihenfolge-Kopplung, deterministische Fixtures

### 7. Validieren (`verification-before-completion`, `requesting-code-review`)
Linter, Formatter, Type-Checks, vollständige Test-Suite lokal grün. Coverage-Report mit Vorher/Nachher. Self-Review entlang der Review-Kategorien (Code Quality, Architecture, Security, Performance, Error Handling, Tests). **Nur Evidenz zählt, keine Behauptungen** — Logs und Coverage-Zahlen müssen vorliegen.

### 8. Ausliefern (`finishing-a-development-branch`)
PR-Titel: `<type>(<scope>): <beschreibung> (#<issue>)`. PR-Body: Zusammenfassung, Issue-Link, Akzeptanzkriterien abgehakt, Test-Evidenz (Logs, Coverage-Vergleich). Labels und Reviewer setzen. Issue-Status auf „in review". Worktree aufräumen.

**→ Issue-Kommentar `✅ Umsetzung`** mit Branch, PR-Nummer, Änderungen pro Datei, Validierungsergebnissen, neuen Tests (Regressionstest namentlich), Coverage-Vergleich.

---

## Skill-Übersicht

| Schritt | Skill |
|---|---|
| 1 Verstehen | `using-superpowers` |
| 2 Brainstormen | `brainstorming` |
| 3 Planen | `writing-plans` |
| 4 Worktree | `using-git-worktrees` |
| 5 Umsetzen | `subagent-driven-development`, `systematic-debugging` |
| 6 Tests | `test-driven-development` |
| 7 Validieren | `verification-before-completion`, `requesting-code-review` |
| 8 Ausliefern | `finishing-a-development-branch` |

---

## Autonomie & Eskalation

Alle technischen Entscheidungen selbst treffen: Naming, Bibliothekswahl, Commit-Aufteilung, kleinere Refactorings. Wesentliche Entscheidungen im Issue-Kommentar dokumentieren.

**Nur in diesen 5 Fällen den User fragen** — mit genau einer präzisen Frage und Optionen A/B/C:
1. Mehrdeutige Geschäftslogik, nicht aus Codebase herleitbar
2. Destruktive/irreversible Aktionen (Datenmigration mit Verlust, Breaking-API-Changes)
3. Fehlende Secrets/Credentials
4. Gravierender Bug außerhalb des Scopes
5. Derselbe Ansatz nach zweimaligem internen Replanen immer noch fehlgeschlagen

---

## Constraints

- Kein PR ohne Regressionstest (für Bug-Issues)
- Coverage in geänderten Pfaden darf nicht regressieren
- Erst PR öffnen wenn `verification-before-completion` durch ist
- Issue-Kommentare in der Sprache des Original-Issues
- Nichts außerhalb des Scopes ändern ohne Dokumentation
