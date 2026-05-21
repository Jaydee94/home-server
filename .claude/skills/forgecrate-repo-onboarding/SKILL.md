# Repo Onboarding

Erkundet das Repo nach `forgecrate run` und erstellt einen strukturierten Überblick für `CLAUDE.md`.

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

5. **CLAUDE.md-Vorschlag erstellen** — erzeuge Text für den `<!-- GENERATED:BEGIN -->…<!-- GENERATED:END -->`-Block:

```markdown
## Projekt-Übersicht

**Sprache:** Go 1.24 | **Framework:** — | **Einstiegspunkt:** `cmd/myapp/main.go`

## Struktur

- `internal/` — Business-Logik
- `internal/deploy/` — Deployment-Pipeline
- `cmd/` — CLI-Einstiegspunkte

## Workflow

- Build: `go build ./...`
- Test: `go test ./...`
- Lint: `golangci-lint run`

## Externe Abhängigkeiten

- GitHub API (gh CLI)
```

6. **Übergabe** — zeige den Vorschlag und frage: "Soll ich den GENERATED-Block in `CLAUDE.md` damit ersetzen?"
