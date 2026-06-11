<!-- GENERATED:BEGIN -->
# Claude-Konfiguration

Dieses Repository nutzt eine reproduzierbare forgecrate-Konfiguration. Die hier
beschriebenen Regeln gelten für alle Agenten (Claude Code, Codex, …) die im Repo
arbeiten. Die generierten Abschnitte werden bei `forgecrate update` überschrieben —
eigene Anpassungen gehören in den CUSTOM-Abschnitt der Root-`CLAUDE.md`.

## Pflicht-Skills

| Situation | Skill | Verhalten |
|---|---|---|
| Neues Feature / Bug-Fix | `superpowers:brainstorming` | MUSS vor Code aufgerufen werden |
| Nach Brainstorming | `forgecrate-roadmap-triage` | MUSS aufgerufen werden — entscheidet ob jetzt oder Future Feature |
| Implementierung | `superpowers:test-driven-development` | MUSS vor Code aufgerufen werden |
| Vor jeder nicht-trivialen Änderung | `forgecrate-research` | MUSS aufgerufen werden |
| Vor Commit/PR | `superpowers:verification-before-completion` | MUSS ausgeführt werden |
| Debug | `superpowers:systematic-debugging` | MUSS vor Fix aufgerufen werden |
| Bug gefunden (nach Debug) | `superpowers:test-driven-development` | Regressionstest schreiben, BEVOR der Fix committed wird |
| Session-Start | `mcp__memory__read_graph` | Projektübergreifendes Wissen laden |
| Architekturentscheidung / Debugging-Ergebnis | `mcp__memory__add_observations` | In memory MCP schreiben |

**Codegraph-Pflicht** (wenn codegraph-Flavor aktiv): Vor jeder nicht-trivialen Änderung `codegraph_node` + `codegraph_callers` für betroffene Symbole ausführen — kein Edit/Write ohne vorherige Codegraph-Abfrage.

## Recherche-Pflicht

**Alle** Rollen MÜSSEN vor jeder nicht-trivialen Code-Änderung mindestens ein
Recherche-Tool nutzen — statt aus gelerntem Wissen zu arbeiten. Raten ist verboten;
Quellen werden referenziert. Der `pre-tool.sh`-Hook **warnt** bei fehlender Recherche,
blockiert aber nicht.

| Frage-Typ | Tool | Beispiele |
|---|---|---|
| Library-/Framework-Doku | `context7` | API-Syntax, Migrationen, Versions-Updates |
| Spezifische URL aus Issue/Ticket | `fetch` MCP | RFCs, MDN, Changelogs |
| Allgemeine Web-Recherche | `WebSearch` | Best Practices, Vergleiche, aktuelle Probleme |

**Regeln:**

- Mindestens eine Quelle pro nicht-trivialer Entscheidung; eine Recherche pro Session
  schaltet weitere Warnungen für die Session ab
- Quellen im Plan-Dokument (`docs/superpowers/plans/*.md`) referenzieren
- Deaktivierbar via Flavor `no-research`

## Entwicklungs-Workflow

Für alle Features, Bugfixes und Änderungen:

1. **Brainstorming** — `superpowers:brainstorming` aufrufen, Design abstimmen
2. **Spec** — Branch anlegen (`git checkout -b feat/<thema>`); Spec in
   `docs/superpowers/specs/YYYY-MM-DD-<thema>-design.md` schreiben und committen;
   GitHub-Issue anlegen oder verlinken; Branch-Name im Issue vermerken; Kommentar
   im Issue: "Spec fertig"
3. **Plan** — in `docs/superpowers/plans/YYYY-MM-DD-<thema>.md` schreiben und
   committen; Plan-Pfad im Issue ergänzen; Kommentar: "Plan fertig"
4. **Implementierung** — nach jedem Task kurzer Kommentar im Issue
5. **PR & Abschluss** — Vor `gh pr create` diese Sequenz vollständig ausführen:
   1. `forgecrate-doc-sync` — Doku mit Code abgleichen
   2. `forgecrate-handoff` — memory-bank aktualisieren (`activeContext.md`, `progress.md`)
   3. `forgecrate-db-migration` — Migrations-Review
   4. `accessibility-audit` — A11y-Prüfung
   5. `ui-ux-audit` — UX-Review
   6. `forgecrate-pr-checklist` — Abschluss-Checkliste

   Dann PR erstellen, Issue im PR-Body verlinken ("Closes #N").
   Issue wird nach Merge automatisch geschlossen.

Ticket-Kommentare immer kurz (ein Satz): Fortschritt, Pfad oder Ergebnis.

## Session-Start

Beim Session-Start: aktuellen Projektkontext aus der memory-bank lesen.
**Pflicht:** `mcp__memory-bank__memory_bank_read` verwenden — direktes Lesen via
Read-Tool auf `memory-bank/`-Dateien ist verboten.

## Verhalten

- Antworte auf Deutsch
- Keine unnötigen Kommentare im Code
- YAGNI: keine ungefragten Features
- Änderungen immer über Branch + PR, nie direkt auf `main`

## Hook-Schutz: Hinweis

Der `pre-tool.sh`-Hook **warnt** bei destruktiven Bash-Befehlen und fehlender
Recherche — er blockiert nie. Die Verantwortung liegt beim Agenten: Warnungen
bewusst wahrnehmen, einschätzen und eine informierte Entscheidung treffen.

Für serverseitigen Schutz auf `main`: GitHub Branch Protection Rules konfigurieren.

Bei fehlender Binary, fehlendem oder kaputtem Transcript verhält sich der Hook
**fail-open** (keine Warnung).

## Team-Rollen & Subagent-Konfiguration

Der Hauptagent koordiniert als Team-Lead. Subagenten übernehmen Rollen
entsprechend ihrer Aufgabe. Der Hauptagent kann bei Bedarf eigenständig von
diesen Empfehlungen abweichen.

Das Hauptmodell der Session ist global (in `.claude/settings.json`). Die
`Modell`-Spalte nennt den empfohlenen Wert für den `model`-Parameter beim
Dispatch eines Subagenten über das Agent-Tool — gültig sind nur die Family-Aliase
`opus`/`sonnet`/`haiku`.

| Rolle | Superpowers-Skill | Modell | Recherche |
|---|---|---|---|
| Analyst / Product Owner | `superpowers:brainstorming` | `opus` | Pflicht |
| Tech Lead / Architekt | `superpowers:writing-plans` | `opus` | Pflicht |
| Entwickler | `superpowers:test-driven-development` | `sonnet` | Pflicht |
| Implementierer (mechanisch) | `superpowers:subagent-driven-development` | `haiku` | Pflicht |
| Reviewer | `superpowers:requesting-code-review` | `sonnet` | Pflicht |
| QA / Abschluss | `superpowers:verification-before-completion` | `sonnet` | Pflicht |
| Debugger | `superpowers:systematic-debugging` | `sonnet` | Pflicht |

## Parallelisierung & Isolation

Subagenten werden proaktiv parallelisiert und isoliert — ohne explizite
Aufforderung.

| Situation | Mechanismus | Anleitung |
|---|---|---|
| Task dauert >1 min oder Ergebnis nicht sofort nötig | `run_in_background: true` | `superpowers:dispatching-parallel-agents` |
| Feature-Branch, Multi-File-Änderung, langer Plan | `isolation: "worktree"` | `superpowers:using-git-worktrees` |
| Mehrere unabhängige Tasks gleichzeitig | beide kombinieren | beide Skills |

Im Zweifelsfall Background nutzen — warten ist kein Default.

### Agenten-Identität

Jeder Subagent bekommt eindeutige Identifikation:

- **Eindeutigen Namen** — via `description`-Parameter im Agent-Tool-Aufruf
  (3–5 Wörter, Rolle + Aufgabe)
- **Eindeutige Farbe** — dynamisch durch FleetView-Dashboard zugewiesen; keine
  zwei gleichzeitig laufenden Agenten teilen eine Farbe

Dies ermöglicht einfaches Tracking und verhindert Verwechslungen bei parallelen
Läufen.

## MCP-Server

Sechs MCP-Server stehen automatisch zur Verfügung. `.mcp.json` wird von forgecrate
generiert — nicht von Hand editieren; MCP-Server-Änderungen über einen erneuten
forgecrate-Lauf.

| Server | Transport | Zweck |
|---|---|---|
| `github` | stdio (`npx`) | Issues, PRs, Code-Suche, Branches, Labels |
| `fetch` | stdio (`npx`) | Externe Webinhalte: Docs, RFCs, Changelogs |
| `memory` | stdio (`npx`) | Projektübergreifende Architektur-Entscheidungen |
| `memory-bank` | stdio (`npx`) | Repo-spezifischer Projektkontext (laufender Stand) |
| `context-mode` | stdio (`npx`) | Automatisches Context-Budget und Session-History-Suche |
| `context7` | stdio (`npx`) | Aktuelle Bibliotheks-Dokumentation aus Source-Repos |

Routing-Grenzen (verhindern Falsch-Aufrufe):

- **`github`** — alle GitHub-Operationen (Issues, PRs, Code-Suche, Labels). NICHT für
  lokale Datei-/Git-Kommandos (→ Read/Edit/Bash). Voraussetzung:
  `GITHUB_PERSONAL_ACCESS_TOKEN`.
- **`fetch`** — externe Webinhalte (Docs, MDN, RFCs, Changelogs). NICHT für
  GitHub-Inhalte (→ `github`) oder lokale Dateien (→ Read).
- **`context-mode`** — sandboxt Tool-Output automatisch (kein Aufruf nötig). Explizit:
  `ctx_search` (History-Suche nach Kompaktierung), `ctx_stats`, `ctx_doctor`.
- **`context7`** — aktuelle Bibliotheks-Doku aus Source-Repos. NICHT für GitHub-Inhalte
  (→ `github`), lokale Dateien (→ Read) oder allgemeine Programmierkonzepte.

`memory` und `memory-bank` haben eigene Pflicht-Regeln — siehe unten.

## Claude Plugins

Vier Plugins werden automatisch via `forgecrate deploy` installiert (`claude plugin install --scope project`).

| Plugin | Zweck |
|---|---|
| `superpowers` | Skill-System: Workflows für TDD, Brainstorming, Debugging, Reviews |
| `commit-commands` | Slash-Commands für standardisierte Commits und PRs |
| `security-guidance` | Sicherheitshinweise und Best-Practices für Code-Reviews |
| `claude-md-management` | Verwaltung und Verbesserung von CLAUDE.md-Dateien |

Plugins stellen Slash-Commands und Skills bereit — sie sind nicht über MCP aufrufbar.

### Memory (`memory`)

Projektübergreifendes Wissen persistent speichern. Datei: `.claude/memory.json`
(versioniert).

**Schreiben nach:** Architekturentscheidungen, Begründungen für nicht-
offensichtliche Lösungen, Debugging-Ergebnisse, Brainstorming-Ergebnisse.

**Lesen am:** Sessionbeginn, nach Context-Kompaktierung, wenn unklar warum etwas
so gebaut wurde.

**Niemals speichern:** API-Keys, Tokens, Passwörter, temporären Zwischenstand,
Code-Details die direkt aus dem Code lesbar sind.

### Memory-Bank (`memory-bank`)

Repo-spezifischer, strukturierter Projektkontext im Verzeichnis `memory-bank/`
(versioniert, committed). Persistiert kontextuelles Wissen über Sessions hinweg.

**Dateien:**

- `projectbrief.md` — Projektziel und Scope
- `techContext.md` — Stack, Tools, technische Constraints
- `systemPatterns.md` — Architektur-Entscheidungen, ADRs, Anti-Patterns
- `activeContext.md` — Aktueller Fokus, offene Fragen, Blocker
- `progress.md` — Was fertig ist, was läuft, was als nächstes kommt

**Lesen** am Session-Start und bei Bedarf — **ausschließlich** via
`mcp__memory-bank__memory_bank_read`.

**Schreiben** wenn sich Fokus, Fortschritt oder Architektur-Kontext ändert —
**ausschließlich** via `mcp__memory-bank__memory_bank_write` oder
`mcp__memory-bank__memory_bank_update`.

> **Direkte Datei-Tools (Read/Write/Edit) auf `memory-bank/`-Dateien sind
> verboten.**

**Abgrenzung zu `memory`:** `memory-bank` ist repo-spezifisch und dateibasiert —
ideal für laufenden Projekt-Kontext. `memory` (`.claude/memory.json`) ist
graph-basiert und projektübergreifend — ideal für zeitlose
Architektur-Entscheidungen mit Begründung.

## Backend-Profil

- API-Design: REST-First, klare Fehlercodes, keine unnötige Abstraktion
- Datenbankzugriffe: typsicher, keine Raw-Queries ohne Parametrisierung
- Tests: Integrationstests bevorzugt gegenüber reinen Unit-Tests mit Mocks
- Kein ORM-Magic: explizite Queries sind verständlicher

## Frontend-Profil

- Komponenten: klein, fokussiert, eine Verantwortlichkeit
- State: lokal wenn möglich, global nur wenn nötig
- Kein CSS-in-JS ohne explizite Anforderung
- Barrierefreiheit: semantisches HTML, ARIA-Attribute wo nötig
- Tests: Behavior-Tests (was der Nutzer sieht), keine Implementierungsdetails

## UI-Reviews

- **`accessibility-audit`** — schnelle statische A11y-Checks pro geänderter Datei (alt, label, aria-*). Eignet sich für Pre-Commit / PR-Reviews.
- **`ui-ux-audit`** — tiefgehender Audit der gesamten UI, gruppiert nach Bereichen, mit Severity-Bewertung und automatischer Erstellung kleinteiliger GitHub-Issues. Für Major-Releases oder größere UI-Refactorings.

## Playwright MCP

Browser-Automatisierung direkt aus Claude heraus. Automatisch konfiguriert via `profiles/frontend/extensions.yaml`.

**Verwende es für:** UI-Tests, Screenshots, Formular-Interaktionen, visuelle Regressionstests, Debugging von Rendering-Problemen.

**Verwende es NICHT für:** API-Tests ohne UI-Beteiligung (→ direkte HTTP-Calls), GitHub-Operationen (→ github MCP).

## Design-Plugins

Fünf spezialisierte Plugins für UI/UX-Arbeit — optimal in diesen Situationen:

| Plugin | Optimal wenn… |
|---|---|
| `ui-ux-pro-max-skill` | Neue Komponente/Seite designen — generiert automatisch Design-System (Farben, Typografie, Spacing) passend zum Produkt; unterstützt React, Next.js, Vue, Tailwind, Flutter u.v.m. |
| `interface-design` | UI über mehrere Sessions konsistent halten — speichert Design-Entscheidungen (Spacing, Elevation, Farben) in `.interface-design/system.md` und wendet sie session-übergreifend an |
| `refactoring-ui-skill` | Bestehende UI überarbeiten — `/ui-refactor` verbessert Hierarchie, Spacing (8px-Raster), HSL-Farben und Schatten nach Refactoring-UI-Prinzipien |
| `agent-skills` | Vercel-Deployments oder React Composition Patterns — auto-detects 40+ Frameworks, hilft bei Compound Components, State-Lifting und Edge-Funktionen |
| `wondelai-skills` | UX-Strategie und Produktentscheidungen — 25 Skills nach Norman, Cialdini, Ries; deckt UX Design, Conversion-Optimierung und Produktstrategie ab |

## Fullstack-Profil

Kombiniert Backend- und Frontend-Anforderungen.

- API-Kontrakte explizit definieren bevor Implementierung auf beiden Seiten
- Shared Types: einmal definieren, in beiden Schichten nutzen
- End-to-End-Tests für kritische User-Flows (Playwright MCP siehe Frontend-Profil)

## GETBETTER-Flavor

Kontinuierliche Verbesserung durch Festhalten von Erkenntnissen aus jeder Session.

- Am Session-Start: `mcp__memory__read_graph` aufrufen, Entities vom Typ `session-reflection` lesen.
- Am Sessionende: `/forgecrate-getbetter` aufrufen um Erkenntnisse zu speichern.

**Was gespeichert wird (memory MCP, Entity `session-reflection`):**
- Wiederkehrende Fehler und deren Ursachen
- Patterns die gut funktioniert haben
- Entscheidungen die sich im Nachhinein als falsch erwiesen haben
- Projektspezifische Gotchas die nicht aus dem Code ersichtlich sind

**Format pro Erkenntnis:** `[YYYY-MM-DD] <Kategorie>: <Erkenntnis in einem Satz>`
Kategorien: `workflow`, `tooling`, `pattern`, `mistake`, `decision`.

## GitHub-Flavor

- Releases über `gh release create` veröffentlichen (nach `release`-Skill)
- PR-Templates in `.github/pull_request_template.md` pflegen
- CI-Status mit `gh run list` prüfen bevor ein Release getaggt wird

## Multiagent & Subagenten

Parallelisierung/Isolation gemäß Base-Layer-Tabelle gelten auch hier — gerade bei
Issue-Batches proaktiv Background-Mode und Worktrees nutzen.

## Strict-Review-Flavor

- Vor jedem Commit: `superpowers:requesting-code-review` aufrufen
- Keine direkten Commits auf main/master
- PR-Beschreibung enthält: Was, Warum, Wie getestet
- Breaking Changes werden explizit kommuniziert

## TDD-Flavor

- Test schreiben → ausführen (muss fehlschlagen) → implementieren → ausführen (muss bestehen) → committen
- Kein Produktionscode ohne vorherigen Test
- Test-Namen beschreiben Verhalten, nicht Implementierung
- Mocks nur an Systemgrenzen (externe APIs, Datenbanken)
- Für jeden gefundenen Bug: Regressionstest vor dem Fix
<!-- GENERATED:END -->

<!-- CUSTOM:BEGIN -->
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A fully automated, GitOps-driven home server. Ansible provisions the host (Ubuntu 26.04 LTS); k3s runs Kubernetes; ArgoCD continuously syncs everything under `argocd/apps/` to the cluster; Tailscale provides VPN access with no public ports exposed.

## Commands

```bash
make deps           # Install required Ansible Galaxy collections
make ping           # Verify Ansible can reach the server
make check          # Dry-run the full playbook (no changes applied)
make install        # Provision the home server end-to-end

# Run individual roles only
make common         # Base OS, firewall, packages
make tailscale      # VPN role
make k3s            # Kubernetes + Helm role
make argocd         # GitOps controller role
make host-dns       # Retire dnsmasq; point host resolver at Pi-hole (.2) + FritzBox fallback
make scanner        # Bare-metal Fujitsu scanner + scanbd + SMB mount
make semaphore      # Bootstrap Semaphore Secret on the home-server
make semaphore-targets  # Push Semaphore SSH key to all managed targets
make semaphore-bootstrap # Provision Projects/Repos/Inventories/Templates in Semaphore via API
make semaphore-bootstrap-local # Run semaphore-bootstrap natively on the home server (no SSH)
make nas             # Deploy alle Services auf dem UGREEN NAS
make nas-check       # Dry-run des NAS-Playbooks (keine Änderungen)

make lint           # yamllint + ansible-lint + helm lint
make vault-edit     # Edit vault-encrypted vars (ansible/group_vars/all.yml)
make clean          # Remove cached Ansible collections and temp artifacts
```

## Architecture

```
Ansible (provisioning)
  └── ansible/site.yml          ← entry point; roles run in this order:
        common → host_dns → tailscale → k3s → argocd → scanner → semaphore_secrets
  └── ansible/group_vars/all.yml ← ALL configuration knobs; vault-encrypted secrets live here
  └── ansible/inventory/hosts.yml ← server address

k3s (Kubernetes, single-node)
  └── bundles Traefik v2 (ingress), CoreDNS, local-path-provisioner, metrics-server

ArgoCD (GitOps)
  └── argocd/bootstrap/root-applicationset.yaml
        ← discovers every directory under argocd/apps/* automatically
        ← each directory becomes an ArgoCD Application named after the folder,
           deployed into a namespace of the same name
        ← auto-syncs with prune + selfHeal on every push to main
  └── argocd/apps/<name>/      ← plain Kubernetes YAML, kustomize, OR a Helm chart
```

### Adding an application

```bash
mkdir -p argocd/apps/my-app
# Add Kubernetes YAML, kustomization.yaml, or a Helm chart (Chart.yaml + values.yaml)
git add argocd/apps/my-app && git commit -m "feat(apps): add my-app" && git push
# ArgoCD picks it up within ~3 minutes; namespace "my-app" is created automatically
```

## Server Access

```bash
# SSH into the server
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127

# kubectl (local context may point elsewhere — always go via SSH)
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl ...'
```

## Service URLs

| Service   | URL                         | Notes                              |
|-----------|-----------------------------|------------------------------------|
| Grafana   | http://grafana.homeserver   | user: `admin`                      |
| ArgoCD    | http://\<server-ip\>:30080  | HTTPS on 30443                     |
| Headlamp  | http://headlamp.homeserver  | Kubernetes dashboard               |
| Semaphore | http://semaphore.homeserver | Ansible UI                         |
| Gotify    | http://gotify.homeserver    | Push notifications (docs/11-gotify.md) |
| Argo Workflows | http://argo-workflows.homeserver | Private CI (docs/13-argo-workflows.md) |
| MinIO     | http://minio.homeserver     | S3 artifact store for Argo Workflows |
| Homepage  | http://home.homeserver      | Zentrales Dashboard                |
| Pi-hole   | http://pihole.homeserver/admin/login | LAN-Adblock; DNS auf 192.168.178.2 (docs/15-pihole.md) |
| Jellyfin  | http://jellyfin.homeserver  | Media-Server; NAS via SMB; LAN/Smart-TV: http://192.168.178.3:8096 (MetalLB) (docs/16-jellyfin.md) |
| Home Assistant | http://homeassistant.homeserver | Home Automation; Philips Hue Bridge via mDNS; Solakon-ONE Solar via Modbus TCP (docs/17-homeassistant.md) |
| Mosquitto (MQTT) | mqtt://192.168.178.4:1883 | MQTT-Broker (MetalLB); Nuki Smart Lock Pro → Home Assistant (docs/18-nuki-mqtt.md) |
| 7 Days to Die | 100.x.x.x:26900 (Tailscale) | KubeVirt VM; Tailscale only; Node-Sharing für Kollegen (docs/19-gameserver.md) |
| Gameserver-UI | http://gameserver.homeserver | 7DTD-VM-Verwaltung (docs/20-gameserver-ui.md) |
| Paperless-NGX | http://jays-ugreen:8000  | NAS (Docker Compose)               |
| OpenCode      | http://jays-ugreen:4096  | NAS (Docker Compose)               |
| TinyTeller    | http://jays-ugreen:3002  | NAS (Docker Compose)               |
| Day Pilot     | http://jays-ugreen:3003  | NAS (Docker Compose)               |

```bash
# Retrieve Grafana admin password:
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n monitoring get secret monitoring-grafana \
   -o jsonpath="{.data.admin-password}" | base64 -d; echo'
```

## Secrets

All secrets are stored in `ansible/group_vars/all.yml` using Ansible Vault. To add or rotate a secret:

```bash
ansible-vault encrypt_string 'the-secret-value' --name 'variable_name'
# paste the resulting `!vault |` block into group_vars/all.yml
make vault-edit  # to open the file directly in your editor
```

The Tailscale auth key (`tailscale_auth_key`) must always be vault-encrypted. Never commit plaintext secrets.

## Lint rules

- `yamllint` config: `.yamllint` — applied to `ansible/` and `argocd/`
- `ansible-lint` config: `.ansible-lint`
- Helm charts are linted with `helm lint`
- `actionlint` lints the GitHub Actions workflows themselves (job in `.github/workflows/lint.yml`)
- `charts/`, `Chart.lock`, and `*.tgz` are git-ignored (vendored chart tarballs are the exception when checked in deliberately, e.g. `headlamp`)

## CI workflows

**Contribution policy**: changes land on `main` **only via pull request** — never by pushing directly to `main`. A PR may be merged **only when all CI pipelines are green** (Lint *and* Security). No merging on red or pending CI; fix the failing check or rebase first.

- **`.github/workflows/lint.yml`** — `yamllint`, `ansible-lint`, `helm lint (all charts)`, `actionlint`. The first and third names are *required* status checks on `main` (branch protection); keep them verbatim.
- **`.github/workflows/security.yml`** — Trivy filesystem scan (`misconfig,secret`) on push/PR + weekly cron; uploads SARIF to the GitHub Security tab. **Soft-launch / non-blocking** (`exit-code: "0"`) — it reports but does not fail PRs. To harden, set `exit-code: "1"` + `severity: HIGH,CRITICAL` and mark it required in branch protection. Reviewed false positives go in `.trivyignore`.
- **Action pinning**: all third-party actions are pinned to a full commit SHA (`@<sha> # vX.Y.Z`), never a bare tag. `trivy-action` and the trivy binary (`version:`) are pinned to documented-safe references because both were tag-compromised in 2026.

## Key configuration variables (ansible/group_vars/all.yml)

| Variable | Purpose |
|---|---|
| `hostname` | Server hostname |
| `timezone` | IANA timezone, e.g. `Europe/Berlin` |
| `auto_upgrade` | Keep OS + components on latest (default: true) |
| `auto_reboot_if_required` | Auto-reboot when APT marks `/var/run/reboot-required` |
| `k3s_channel` / `k3s_version` | Pin or float k3s version |
| `helm_version` / `argocd_version` | Pin Helm 3 / Argo Helm chart, empty = latest |
| `local_subnet` | Home LAN CIDR used in UFW rules |
| `argocd_repo_url` / `argocd_repo_revision` | Git repo + revision ArgoCD syncs from |
| `tailscale_auth_key` | Vault-encrypted WireGuard auth key |
| `tailscale_hostname` | Tailnet name (defaults to `hostname`) |
| `pihole_dns_ip` | Dedicated MetalLB LAN IP Pi-hole's DNS service owns; `host_dns` points the host resolver here (default `192.168.178.2`) |
| `semaphore_vault_password` | Vault-encrypted Ansible Vault password Semaphore uses to decrypt secrets in triggered playbooks |
| `semaphore_projects` | Optional list of additional Semaphore projects/templates to bootstrap |
| `scanner_smb_share` | NAS share path for the Paperless consume directory |
| `scanner_smb_username` | SMB user (password is vault-encrypted) |
| `scanner_smb_password` | Vault-encrypted SMB password for the share |
| `scanner_usb_vendor_id` / `scanner_usb_product_id` | USB IDs of the scanner (`lsusb`) |
| `scanner_gotify_enabled` | Toggle Gotify push notifications from the scan pipeline |
| `scanner_gotify_url` / `scanner_gotify_token` | Gotify endpoint + (vault-encrypted) app token |
| `gotify_admin_password` | Optional vault-stored copy of the Gotify admin password |

## Scanner / Paperless Ingestion

- Fujitsu USB-Scanner sits directly on the home-server; `scanbd` runs as a
  bare-metal systemd service hardened via drop-in (`User=saned`, `Group=scanner`,
  `ProtectSystem=strict`, etc.) and the host's udev rule grants USB access via
  `GROUP=scanner, MODE=0660, TAG+="uaccess"` instead of root.
- Hardware button → `scanbd` detects → `scan_button.sh` touches trigger flag →
  `scanner-trigger.path` (inotify) → `scanner-trigger.service` stops scanbd, runs
  `scan-trigger.sh` as `saned`, restarts scanbd via `trap EXIT` → PDF lands on
  `/mnt/paperless-consume` (UGREEN NAS).
- Paperless-NGX still runs on the UGREEN NAS and ingests from that directory.
- An hourly `scanner-healthcheck.timer` re-mounts the share if it disappears
  and probes the scanner via `scanimage -L`.
- Full setup + verification + troubleshooting checklist: [`docs/10-scanner.md`](docs/10-scanner.md).

## Monitoring

`argocd/apps/monitoring/` — deployed automatically by ArgoCD.

- **VMSingle** — TSDB (15-day retention, 10 Gi `local-path` PVC)
- **VMAgent** — scrapes `VMServiceScrape`/`VMPodScrape` and auto-converts Prometheus `ServiceMonitor` CRDs
- **Host metrics** — `prometheus-node-exporter` DaemonSet
- **Cluster metrics** — kubelet/cAdvisor, kube-apiserver, kube-state-metrics, CoreDNS; scheduler/controller-manager/etcd scrapes are disabled (k3s runs them in a single process)
- **Alerts** — default kube-prometheus rule set; routed to a `blackhole` receiver until Discord/Slack/Gotify is wired in `values.yaml`
- **Grafana** — available at `http://grafana.homeserver` (LAN + Tailnet, resolved by Pi-hole); ships Node Exporter Full, VictoriaMetrics, and Kubernetes Views dashboards

## Gotchas

- **kubectl context**: Your local kubeconfig may point to a different cluster (e.g. `kind`). Always run `kubectl` via SSH or explicitly set `--kubeconfig`.
- **Helm OCI charts**: Some apps (e.g. `kubeseal-webgui`) use OCI registries (`oci://ghcr.io/...`). The `repository:` field must use the `oci://` prefix — HTTP Helm repo URLs will 404 even if the chart exists at the OCI registry.
- **Grafana sidecar + dashboards conflict**: Setting both `grafana.sidecar.dashboards.enabled: true` and `grafana.dashboards:` in the same values file causes a Helm template error. Use the sidecar only; default dashboards are shipped via labeled ConfigMaps.
- **Grafana fresh DB**: If Grafana crashes with `no such column: is_service_account`, delete the corrupt `grafana.db` directly from the PVC on the host and restart the deployment. The PVC path is `/var/lib/rancher/k3s/storage/<pvc-name>_monitoring_monitoring-grafana/`.
- **Semaphore bootstrap — first-run 400s**: `make semaphore-bootstrap` is idempotent — GET-list, then POST-if-missing for keys/repos/inventories and PUT-update-in-place for templates. On the very first run a 400 from the Ansible `uri` module is occasionally seen during resource creation (race between key creation and the next list call). Re-run until clean; subsequent runs are no-ops.
- **Semaphore templates self-heal on bootstrap**: `tasks/template.yml` issues `PUT /api/project/{id}/templates/{tid}` for any template that already exists, with the full desired body. This is what fixes pre-existing templates whose `vault_key_id` is NULL because they were created before the vault-password wiring landed. The PUT uses `changed_when: false` because `uri` otherwise reports `changed` on every successful PUT even when the row is unchanged.
- **Semaphore targets — SSH key prerequisite**: Before running `make semaphore-targets`, the Semaphore SSH public key must be authorized on each managed target. Fetch the pubkey from the server (`sudo cat /etc/semaphore-secrets/id_ed25519.pub`) and add it via `ssh-copy-id` or directly to `~/.ssh/authorized_keys` on the target host.
- **Running semaphore-bootstrap locally on the server**: `make semaphore-bootstrap-local` runs the same playbook with `--connection local` so no SSH back to self is needed — useful when you're already SSH'd into the home-server. Relies on jaydee's passwordless sudo (configured by the `common` role).
- **Scanner — USB-IDs + erster Run**: `scanner_usb_product_id` muss gesetzt sein (pre-flight schlägt sonst fehl) — `lsusb` auf dem Host, beide IDs in `group_vars/all.yml` eintragen. NAS muss beim ersten `make scanner` erreichbar sein (`mount state=mounted`). Vollständiges Setup + Troubleshooting: `docs/10-scanner.md`.
- **Scanner — scanbd hält USB exklusiv (direct mode)**: `scanbd` im direct mode hält das USB-Interface via `ioctl(USBDEVFS_CLAIMINTERFACE)`. `scanimage` schlägt mit `LIBUSB_ERROR_BUSY` fehl solange scanbd läuft. `scanner-trigger.service` stoppt/startet scanbd automatisch. Diagnose: `SANE_DEBUG_SANEI_USB=1 scanimage -L`.
- **Scanner — SANE_CONFIG_DIR beim Ausführen als saned**: `runuser -u saned` liest SANE aus `/etc/scanbd/dll.conf` (net-Backend) statt `/etc/sane.d/dll.conf`. Fix: `runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`.
- **Ansible-Templates — Jinja2 `trim_blocks` + `{% raw %}`**: Ansible setzt `trim_blocks=True`. Das `\n` nach `{% endraw %}` wird gestrippt — die folgende Zeile klebt direkt an den Raw-Inhalt. `{% endraw %}` immer auf einer eigenen Zeile platzieren, sodass das `\n` innerhalb des Raw-Blocks erhalten bleibt.- **Semaphore bootstrap — `body_format: json` + integer fields**: Ansible stringifiziert YAML-Skalare `"{{ expr | int }}"` vor der JSON-Serialisierung — Semaphore's Go-Decoder lehnt das mit HTTP 400 (leerem Body) ab. Fix: Jinja2-Dict-Literal in `>-`-Block verwenden (`{{ {'key': val | int} | to_json }}`) statt YAML-Dict mit Template-Skalaren und `body_format: raw`. `inventory.yml` und `template.yml` verwenden dieses Muster bereits.
- **Semaphore bootstrap ist vollständig selbstheilend**: Keys (SSH + vault-password, `override_secret: true`), Templates (PUT) und Projekte (Orphan-Delete nach Umbenennung) werden bei jedem Run reconciliert — manuelles UI-Cleanup ist nie nötig. Vault-Password rotieren: nur `make vault-edit` + `make semaphore-bootstrap`.
- **Pi-hole ist der einzige DNS-Server (dnsmasq abgelöst)**: Das frühere Host-dnsmasq ist weg; Pi-hole (`argocd/apps/pihole/`) löst `*.homeserver` **autoritativ** selbst auf (`customDnsEntries: ["address=/homeserver/192.168.178.127"]`) und blockt Werbung. Es läuft auf der dedizierten **MetalLB**-IP `192.168.178.2:53` (`argocd/apps/metallb/`). Der Host selbst fragt es via `host_dns`-Rolle (systemd-resolved → `.2`, FritzBox-Fallback), damit host-seitige `*.homeserver`-Tools (Scanner→`gotify.homeserver`, `semaphore-bootstrap-local`) weiter funktionieren. LAN-weit aktiv erst, wenn FritzBox „Lokaler DNS-Server = 192.168.178.2" gesetzt ist (docs/15-pihole.md).
- **Pi-hole NICHT auf die Node-IP `:53` legen**: k3s' Klipper-ServiceLB bindet einen LB-Port als hostPort `0.0.0.0:53` und würde den Host-Resolver (`systemd-resolved` auf `127.0.0.53:53`) lahmlegen (Node löst nichts mehr auf). Genau deshalb die dedizierte MetalLB-IP `.2` statt der Node-IP. MetalLB liefert `.2:53` per ARP/kube-proxy aus, ohne `0.0.0.0:53` zu belegen.
- **MetalLB vs. k3s-Klipper**: Damit MetalLB den Pi-hole-DNS-Service exklusiv bekommt (statt Klipper), setzen **beide** Seiten dieselbe `loadBalancerClass: metallb.universe.tf/metallb` — der Service (`serviceDns.loadBalancerClass`) und der Controller (`metallb.loadBalancerClass`). Klipper überspringt klassifizierte Services (k3s ≥ v1.26); MetalLB greift nur bei passendem `--lb-class`. Fehlt eine Seite → Service bleibt `<pending>` oder bekommt zwei EXTERNAL-IPs.
- **Pi-hole IP muss außerhalb des FritzBox-DHCP-Bereichs liegen**: `192.168.178.2` darf nicht vom DHCP vergeben werden (sonst ARP-Konflikt). DHCP-Bereich prüfen unter FritzBox → Heimnetz → Netzwerk → Netzwerkeinstellungen → IPv4-Adressen. Andere IP nötig? An vier Stellen ändern: `metallb/templates/ipaddresspool.yaml`, `pihole/values.yaml` (`loadBalancerIP`), `group_vars/all.yml` (`pihole_dns_ip`), FritzBox.
- **Home Assistant — Erweiterungen via Init-Container (HACS-frei)**: Lovelace-Karten (`/config/www/…`) und Python-Custom-Integrations (`/config/custom_components/…`) werden GitOps-reproduzierbar per Init-Container in `argocd/apps/home-assistant/values.yaml` installiert (gepinntes Release, Renovate-regex-Manager), NICHT über HACS. Frontend-Karten müssen einmalig manuell als Lovelace-Ressource registriert werden (*Einstellungen → Dashboards → Ressourcen*), da HA im Storage-Modus läuft. Das Midnight-Theme liegt als ConfigMap (`templates/midnight-theme-configmap.yaml`) und wird nach `/config/themes/midnight.yaml` gemountet; `frontend.themes` ist bereits im Chart-Default-`templateConfig` aktiv. Details: `docs/17-homeassistant.md`.
- **Nuki MQTT — Broker braucht MetalLB-LAN-IP, kein ClusterIP**: Das Nuki Smart Lock Pro ist ein physisches LAN-Gerät und spricht den Mosquitto-Broker direkt über `192.168.178.4:1883` (MetalLB) an — ein ClusterIP wäre von außerhalb des Clusters nicht erreichbar. Der Service setzt `loadBalancerClass: metallb.universe.tf/metallb` (sonst greift Klipper) und der IPAddressPool `mosquitto` muss die `.4` halten (`argocd/apps/metallb/templates/ipaddresspool-mosquitto.yaml`). Das Nuki Pro braucht **Firmware ≥ 4.0.28** für WLAN-MQTT; MQTT ist authentifiziert, aber **unverschlüsselt** (Nuki-Limit) → Broker bleibt LAN-intern. Das Schloss erscheint per nativem MQTT-Auto-Discovery in HA, **kein Custom-Component nötig**. Broker-Credentials liegen im SealedSecret `mosquitto-auth` — solange `sealedSecret.encryptedUsername`/`encryptedPassword` in `mosquitto/values.yaml` leer sind, wird kein Secret gerendert und der Pod bleibt `ContainerCreating`. Details: `docs/18-nuki-mqtt.md`.
- **MetalLB — IP-Konflikt nach Annotation-Removal bleibt `<pending>`**: Wenn ein Service von LoadBalancer auf ClusterIP wechselt und die `metallb.io/ip-allocated-from-pool`-Annotation per `kubectl annotate svc … key-` entfernt wird, hält der MetalLB-Controller die IP dennoch im In-Memory-State und verweigert die Neuzuweisung an einen anderen Service (`can't change sharing key`). Fix: `kubectl -n metallb rollout restart deployment metallb-controller` — nach dem Neustart reconciliert der Controller sauber und weist die IP dem neuen Service zu.
- **KubeVirt — Bare-Metal-Voraussetzung**: KubeVirt benötigt `/dev/kvm` auf dem Host (VT-x/AMD-V). Vor dem ersten Sync `virt-host-validate` auf dem Server ausführen. Ohne KVM fällt KubeVirt auf QEMU-Emulation zurück — `useEmulation: true` in `kubevirt-cr.yaml` einkommentieren (langsam, nicht für 7DTD empfohlen). Diagnose: `ssh jaydee@192.168.178.127 'sudo virt-host-validate'`.
- **KubeVirt — Bootstrap-Reihenfolge via ArgoCD-Retry**: `argocd/apps/kubevirt/` muss vor `argocd/apps/gameserver/` vollständig konvergieren (KubeVirt- und CDI-CRDs müssen existieren bevor DataVolume/VirtualMachine angelegt werden). Der ApplicationSet-Retry (5×, exponential) übernimmt das automatisch — Sync-Fehler im ersten Durchlauf sind normal und verschwinden nach 1–2 Minuten.
- **KubeVirt — VM bleibt Halted bis Secret versiegelt**: `vm.runStrategy` ist initial `Halted`. Die VM startet erst nach (1) Eintragen des versiegelten cloud-init in `values.yaml`. Nach dem ersten Sync verwalten die **CronJobs** (`gameserver-start`/`gameserver-stop`) den Laufzustand — `runStrategy: Halted` bleibt dauerhaft der Git-Default (ArgoCD ignoriert Laufzeit-Abweichungen dieses Felds via `ignoreDifferences`). On-Demand-Start: `kubectl patch vm 7dtd-server -n gameserver --type merge -p '{"spec":{"runStrategy":"Always"}}'`. Details: `docs/19-gameserver.md → VM starten`.
- **KubeVirt — CDI deployt in eigenem Namespace `cdi`**: Die CDI-Ressourcen in `kubevirt/cdi-cr.yaml` und die CDI-Operator-YAML legen den Namespace `cdi` selbst an. ArgoCD deployt das in den explizit angegebenen Namespace (`cdi`), auch wenn die ArgoCD-Destination `kubevirt` ist — Ressourcen mit eigenem `namespace:`-Feld überschreiben die Destination.
- **KubeVirt — cloud-init enthält alle Secrets (Tailscale Key + 7DTD PW)**: Die gesamte cloud-init-Userdata (inkl. Tailscale Auth Key und Serverpasswort) ist in einem einzigen SealedSecret `gameserver-cloudinit` versiegelt. Änderungen an Passwörtern oder dem Auth Key → cloud-init neu ausfüllen → neu versiegeln → `values.yaml` updaten. Prozedur: `docs/19-gameserver.md → Secrets versiegeln`.
- **Tailscale Node-Sharing + tag:gameserver**: Nach dem ersten Start erscheint `7dtd-server` in der Tailscale Admin Console. Tag `tag:gameserver` muss in `tagOwners` eingetragen sein (sonst schlägt `tailscale up --advertise-tags` fehl). Grants auf 7DTD-Ports (26900 TCP/UDP, 26901–26902 UDP) begrenzen den Zugriff geteilter Nodes. Bekannte Reibung bei Shared Nodes + Tag-ACL ([tailscale/tailscale#14445](https://github.com/tailscale/tailscale/issues/14445)): Shared Nodes erhalten ein eingeschränktes Policy-Set und können das Ziel-Tag unter Umständen nicht sehen. Workaround: Grant ohne tag-basiertes `dst` schreiben (direkt auf die Tailscale-IP der VM statt `tag:gameserver`) bis der Upstream-Bug behoben ist.
- **Memory MCP — `.claude/`-Verzeichnis im npx-Cache fehlt nach Neuinstallation**: Der `@modelcontextprotocol/server-memory`-Server speichert `memory.json` unter `<install-path>/dist/.claude/memory.json`. Das Verzeichnis wird beim ersten `npx`-Run nicht automatisch angelegt — `create_entities` schlägt mit `ENOENT` fehl, während `read_graph` (lesend) ein leeres Ergebnis zurückgibt ohne zu melden dass die Datei fehlt. Fix: `mkdir -p "$(ls -d ~/.npm/_npx/*/node_modules/@modelcontextprotocol/server-memory/dist 2>/dev/null | head -1)/.claude"`. Nach einem `npx`-Cache-Invalidierungslauf (neues Package, npm cache clean) muss das Verzeichnis erneut angelegt werden.

## Automatic dependency updates

Helm chart versions in `argocd/apps/*/Chart.yaml` are kept current by
[Renovate](https://docs.renovatebot.com/) (config: `renovate.json` at the repo
root). Renovate is run by the **hosted Mend Renovate GitHub App** — install it
once from the GitHub Marketplace on `jaydee94/home-server`; no self-hosted
workflow or PAT is required.

- **kubeseal-webgui**: the OCI Helm chart dependency
  (`oci://ghcr.io/jaydee94/kubeseal-webgui/charts`) auto-updates. `patch` and
  `minor` bumps are **auto-merged** once the `lint` workflow passes; `major`
  bumps open a PR for manual review. The version in `Chart.yaml` stays pinned and
  reproducible — Renovate raises a PR to bump it, then ArgoCD syncs the new
  version automatically after merge.
- All other charts: Renovate opens PRs but does **not** auto-merge (no matching
  `packageRule`). Extend `renovate.json` to opt more charts into auto-merge.
- **Auto-merge prerequisite**: GitHub Branch Protection on `main` must mark the
  `lint` status check as *required*, so auto-merge only fires on green CI.

## Claude Skills

Project-scoped skills (live under `.claude/skills/`):

| Skill | Invoke | What it does |
|-------|--------|--------------|
| cluster-health | `/cluster-health` | SSH health check — nodes, ArgoCD apps, pods, PVCs |
| add-app | `/add-app` | Scaffold a new `argocd/apps/<name>/` following home-server conventions |
| forgecrate-advisor | `/forgecrate-advisor` | Analysiert das Repo und empfiehlt das passende forgecrate-Profil + Flavors |
| forgecrate-repo-onboarding | `/forgecrate-repo-onboarding` | Erkundet das Repo nach `forgecrate run` und erstellt einen strukturierten Überblick für CLAUDE.md |
| forgecrate-repo-health | `/forgecrate-repo-health` | Priorisierte Liste an Verbesserungsvorschlägen für das Repo |
| forgecrate-release | `/forgecrate-release` | Vollständigen Release-Zyklus durchführen |
| forgecrate-db-migration | `/forgecrate-db-migration` | DB-Migration erstellen und reviewen |
| forgecrate-handoff | `/forgecrate-handoff` | Portablen Projekt-Kontext in `HANDOFF.md` schreiben |

## Networking

No public ports. All remote access is via Tailscale. Traefik handles HTTP/HTTPS ingress within the LAN/Tailnet on ports 80/443. ArgoCD UI is available on NodePorts 30080/30443.

<!-- CUSTOM:END -->
