# Spec: CLAUDE.md drastisch reduzieren

**Datum:** 2026-07-27  
**Ziel:** ~85 % Reduktion (600 → ~90 Zeilen) zur Senkung von Context-Kosten und Verbesserung der Lesbarkeit.

## Problem

Die `CLAUDE.md` ist ~600 Zeilen lang und wird bei jedem Session-Start vollständig in den Context geladen. Zwei Hauptursachen:

1. **forgecrate GENERATED-Block** (Zeilen 1–313): Workflow-Regeln, Team-Rollen, MCP-Server-Details — diese werden bereits durch den `forgecrate`-system-reminder jede Session geliefert. **Doppelt im Context.**
2. **Gotchas-Sektion** (~30 Einträge, ~200 Zeilen): Service-spezifische Fallstricke, die größtenteils in den jeweiligen `docs/`-Dateien dokumentiert sind.

## Entscheidungen

- **Workflow-Regeln (B) > Gotchas (A)** — Prozessregeln sind wertvoller im direkten Context als Fallstricke.
- **Gotchas → `docs/gotchas.md`** — eigene Datei, Verweis in CLAUDE.md.
- **GENERATED-Block entfernen** — redundant zum system-reminder.

## Was entfernt wird

| Abschnitt | Begründung |
|---|---|
| forgecrate GENERATED-Block (313 Zeilen) | Identisch im system-reminder vorhanden |
| Gotchas (~200 Zeilen) | → `docs/gotchas.md` ausgelagert |
| Scanner/Paperless-Ingestion | Steht vollständig in `docs/10-scanner.md` |
| Monitoring-Details | Im Code (`argocd/apps/monitoring/`) nachlesbar |
| Key configuration variables | In `ansible/group_vars/all.yml` direkt einsehbar |
| Automatic dependency updates (Renovate) | Nicht täglich gebraucht; `renovate.json` ist selbstdokumentierend |
| Service URLs: Notes-Spalte | Zu lang; Details in den jeweiligen `docs/`-Dateien |

## Was bleibt (Ziel-Struktur)

```
What this repo is       — 2 Sätze
Commands                — alle make-Targets
Architecture            — komprimiert, ~10 Zeilen
Server Access           — SSH + kubectl, 4 Zeilen
Service URLs            — Name + URL, keine Notes
Secrets                 — 3 Zeilen
Lint / CI               — zusammengefasst, 4 Zeilen
Claude Skills           — Tabelle
Gotchas                 — Einzeiler: "→ docs/gotchas.md"
Networking              — 2 Sätze
```

**Ziel:** ~90 Zeilen

## Neue Datei: docs/gotchas.md

Alle ~30 Gotcha-Einträge werden unverändert nach `docs/gotchas.md` verschoben. Die Datei wird nach Themen gruppiert:

- MetalLB / Networking
- Pi-hole / DNS
- KubeVirt / Gameserver
- Scanner / SANE
- Semaphore / Bootstrap
- Media-Stack / Recyclarr
- Home Assistant / HA-MCP
- Tooling (Memory MCP, kubectl context, Helm OCI)

## Nicht geändert

- `CUSTOM:BEGIN`/`CUSTOM:END`-Marker entfallen (kein GENERATED-Block mehr nötig)
- Alle `docs/`-Dateien bleiben unverändert
- `.mcp.json`, Skills, Settings — keine Änderung
