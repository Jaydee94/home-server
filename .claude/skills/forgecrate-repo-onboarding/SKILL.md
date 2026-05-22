# Repo Onboarding

Erkundet das Repo nach `forgecrate init` und erstellt einen strukturierten Überblick für `CLAUDE.md`.

## Ablauf

1. **Sprachen und Frameworks erkennen** — prüfe `go.mod`, `package.json`, `Cargo.toml`, `pyproject.toml`, `pom.xml` o.ä. Notiere Hauptsprache, Framework, Go/Node/Python-Version.

2. **Projektstruktur kartieren** — finde:
   - Wo liegt Business-Logik (typisch `internal/`, `src/`, `lib/`)
   - Wo liegen Tests (Suffix `_test.go`, `*.test.ts`, `tests/`)
   - Wo liegt Konfiguration (`.env*`, `config/`, `*.yaml`)
   - Einstiegspunkt (`main.go`, `index.ts`, `app.py`)

3. **Build und Test-Workflow** — erkenne:
   - Build: `make build`, `go build`, `npm run build`, …
   - Test: `make test`, `go test ./...`, `npm test`, `pytest`, …
   - Lint: `golangci-lint`, `eslint`, `ruff`, …

4. **Externe Abhängigkeiten** — suche nach Datenbankverbindungen, externen APIs, Message-Queues in Imports und Konfigurationsfiles.

5. **memory-bank befüllen** — schreibe direkt (keine Rückfrage) auf Basis der Analyse:

   - **`memory-bank/projectbrief.md`** — ersetze die Platzhalter:
     - *Was ist dieses Projekt?* → Kurze Beschreibung aus README/go.mod/package.json
     - *Ziele* → Erkannter Mehrwert (CLI-Tool, API, Library, ...)
     - *Nicht-Ziele* → Was bewusst fehlt (z.B. kein Frontend, kein Auth)

   - **`memory-bank/techContext.md`** — ersetze die Platzhalter:
     - *Stack* → Sprache + Version, Framework, wichtige Libraries (aus go.mod/package.json/pyproject.toml)
     - *Tools & Infrastruktur* → Build-, Test-, Lint-Kommandos (aus Makefile/scripts)
     - *Constraints* → Erkannte Einschränkungen (z.B. Go-Version, Node-Version, kein CGO)

   - **`memory-bank/systemPatterns.md`** — ersetze die Platzhalter:
     - *Architektur-Entscheidungen* → Erkannte Struktur (z.B. `internal/` für Business-Logik, `cmd/` für Einstiegspunkte)
     - *Wiederkehrende Muster* → Coding-Conventions aus dem Code (z.B. error wrapping, interface-Design)
     - *Anti-Patterns* → Lass diesen Abschnitt leer wenn nichts klar erkennbar

   - **`memory-bank/activeContext.md`** und **`memory-bank/progress.md`** — nicht anfassen, Template bleibt leer.

   Lies jede Zieldatei zuerst via `mcp__memory-bank__memory_bank_read`, um bestehende Inhalte zu kennen. Schreibe neue Inhalte via `mcp__memory-bank__memory_bank_write` (vollständiger Ersatz) oder `mcp__memory-bank__memory_bank_update` (gezielte Ergänzung bestehender Abschnitte). Verwende keine Read/Write-Datei-Tools für memory-bank-Operationen.

   **Fertigstellung:** Gib aus welche memory-bank-Dateien befüllt wurden — ein Satz je Datei (projectbrief.md, techContext.md, systemPatterns.md). Damit ist der Skill abgeschlossen.
