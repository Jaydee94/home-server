<!-- GENERATED:BEGIN -->
# Claude-Konfiguration

Dieses Repository verwendet ein reproduzierbares forgecrate.
Die generierten Abschnitte dieser Datei werden bei `forgecrate update` überschrieben.
Eigene Anpassungen gehören in den CUSTOM-Abschnitt.

## Pflicht-Skills

| Situation | Skill | Verhalten |
|---|---|---|
| Neues Feature / Bug-Fix | `superpowers:brainstorming` | MUSS vor Code aufgerufen werden |
| Implementierung | `superpowers:test-driven-development` | MUSS vor Code aufgerufen werden |
| Vor Commit/PR | `superpowers:verification-before-completion` | MUSS ausgeführt werden |
| Debug | `superpowers:systematic-debugging` | MUSS vor Fix aufgerufen werden |
| Bug gefunden (nach Debug) | `superpowers:test-driven-development` | Regressionstest schreiben, BEVOR der Fix committed wird |

## Recherche-Pflicht beim Planen

Planungs-Rollen (Analyst, Tech Lead, Debugger, Reviewer) MÜSSEN vor jedem Plan mindestens
ein Recherche-Tool nutzen. Raten ist verboten — Quellen werden im Plan referenziert.

| Frage-Typ | Tool | Beispiele |
|---|---|---|
| Library-/Framework-Doku | `context7` | API-Syntax, Migrationen, Versions-Updates |
| Spezifische URL aus Issue/Ticket | `fetch` MCP | RFCs, MDN, Changelogs |
| Allgemeine Web-Recherche | `WebSearch` | Best Practices, Vergleiche, aktuelle Probleme |

**Regeln:**
- Mindestens eine Quelle pro nicht-trivialer Planungsentscheidung
- Quellen im Plan-Dokument (`docs/superpowers/plans/*.md`) referenzieren
- Bei reinen mechanischen Tasks (Rename, Typo, einzeiliger Fix) entfällt die Pflicht
- Deaktivierbar via Flavor `no-research` (siehe `flavors/no-research/`)

## Entwicklungs-Workflow

Für alle Features, Bugfixes und Änderungen:

1. **Brainstorming** — `superpowers:brainstorming` aufrufen, Design abstimmen
2. **Spec** — Branch anlegen (`git checkout -b feat/<thema>`); Spec in `docs/superpowers/specs/YYYY-MM-DD-<thema>-design.md` schreiben und committen; GitHub-Issue anlegen oder verlinken; Branch-Name im Issue vermerken; Kommentar im Issue: "Spec fertig"
3. **Plan** — in `docs/superpowers/plans/YYYY-MM-DD-<thema>.md` schreiben und committen; Plan-Pfad im Issue ergänzen; Kommentar: "Plan fertig"
4. **Implementierung** — nach jedem Task kurzer Kommentar im Issue
5. **PR & Abschluss** — PR erstellen, Issue im PR-Body verlinken ("Closes #N"); Issue wird erst nach Merge des PR geschlossen (GitHub macht das automatisch)

Ticket-Kommentare immer kurz (ein Satz): Fortschritt, Pfad, oder Ergebnis.

## Session-Start

Beim Session-Start: `ls HANDOFF.md 2>/dev/null` ausführen. Falls vorhanden: Datei lesen und als Kontext verwenden, dann fragen: „HANDOFF.md gefunden und gelesen. Soll ich sie löschen?"

## Verhalten

- Antworte auf Deutsch
- Keine unnötigen Kommentare im Code
- YAGNI: keine ungefragten Features
- Änderungen immer über Branch + PR, nie direkt auf `main`

## Hook-Schutz: Hinweis

Der `pre-tool.sh`-Hook blockt destruktive Bash-Befehle auf `main` (z. B. `git commit`, `git push`, `git reset --hard`, Schreib-Redirectionen). Er ist jedoch **keine alleinige Schutzschicht** — GitHub Branch Protection Rules müssen zusätzlich konfiguriert werden, damit direkte Pushes auch serverseitig verhindert werden.

## Konfliktbehandlung beim Deploy (`forgecrate update`)

Ein Konflikt entsteht nur, wenn **beides** gleichzeitig zutrifft: die lokale Datei wurde seit dem letzten Deploy geändert, **und** die neue Upstream-Version unterscheidet sich von der lokalen Version. Stimmt die lokale Änderung zufällig mit dem Upstream überein, wird kein Konflikt ausgelöst.

> **Wichtig:** Dateien ohne gespeicherten Hash (z. B. beim ersten Update nach Einführung des Hash-Trackings) werden ohne Rückfrage überschrieben.

Das Tool zeigt bei einem echten Konflikt:

```
KONFLIKT: .claude/settings.json
  Deine Version: <erste Zeile der lokalen Datei, max. 80 Zeichen>
  Neue Version:  <erste Zeile des Upstream>
  [o]verwrite / [k]eep (default: keep):
```

**Entscheidung:**
- `o` — Upstream-Version übernehmen, lokale Änderungen gehen verloren
- `k` oder Enter — Lokale Version behalten, Upstream-Update wird übersprungen; der Hash der lokalen Version wird als neue Basis gespeichert — beim nächsten Update entsteht erneut ein Konflikt, falls Upstream sich weiter ändert
- `ü` oder `u` — wie `o` (Backwards-Kompatibilität)
- `b` — wie `k` (Backwards-Kompatibilität)

**Faustregel:**
- Für `settings.json` und CLAUDE.md: Overrides in die CUSTOM-Sektion auslagern
- Für Hooks (`.claude/hooks/**`): eigene, nicht-verwaltete Hook-Dateien verwenden

## Team-Rollen & Subagent-Konfiguration

Der Hauptagent koordiniert als Team-Lead. Subagenten übernehmen Rollen entsprechend ihrer Aufgabe.
Der Hauptagent kann bei Bedarf eigenständig von diesen Empfehlungen abweichen.

<!-- Modell-IDs werden zentral in base/models.yaml verwaltet. -->
<!-- Beim Upgrade: nur base/models.yaml ändern, dann forgecrate update ausführen. -->

| Rolle | Superpowers-Skill | Modell | Effort | Recherche |
|---|---|---|---|---|
| Analyst / Product Owner | `superpowers:brainstorming` | `claude-opus-4-7` (models.planning) | high | Pflicht |
| Tech Lead / Architekt | `superpowers:writing-plans` | `claude-opus-4-7` (models.planning) | high | Pflicht |
| Entwickler | `superpowers:test-driven-development` | `claude-sonnet-4-6` (models.default) | medium | optional |
| Implementierer (mechanisch) | `superpowers:subagent-driven-development` | `claude-haiku-4-5-20251001` (models.mechanical) | low | nein |
| Reviewer | `superpowers:requesting-code-review` | `claude-sonnet-4-6` (models.review) | medium | Pflicht bei Architektur-Fragen |
| QA / Abschluss | `superpowers:verification-before-completion` | `claude-sonnet-4-6` (models.review) | medium | nein |
| Debugger | `superpowers:systematic-debugging` | `claude-sonnet-4-6` (models.default) | medium | Pflicht (CVE, Lib-Issues, Stack-Overflow) |

## Parallelisierung & Isolation

Subagenten werden proaktiv parallelisiert und isoliert — ohne explizite Aufforderung.

| Situation | Mechanismus | Anleitung |
|---|---|---|
| Task dauert >1 min oder Ergebnis nicht sofort nötig | `run_in_background: true` | `superpowers:dispatching-parallel-agents` |
| Feature-Branch, Multi-File-Änderung, langer Plan | `isolation: "worktree"` | `superpowers:using-git-worktrees` |
| Mehrere unabhängige Tasks gleichzeitig | beide kombinieren | beide Skills |

Im Zweifelsfall Background nutzen — warten ist kein Default.

### Agenten-Identität

Jeder Subagent bekommt eindeutige Identifikation:
- **Eindeutigen Namen** — via `description`-Parameter im Agent-Tool-Aufruf (3–5 Wörter, Rolle + Aufgabe)
- **Eindeutige Farbe** — dynamisch durch FleetView-Dashboard zugewiesen; keine zwei gleichzeitig laufenden Agenten teilen eine Farbe

Dies ermöglicht einfaches Tracking und verhindert Verwechslungen bei parallelen Läufen.

## MCP Server

Vier MCP-Server sind im base layer deklariert und stehen automatisch zur Verfügung.

### GitHub (`github`)

Für alle Operationen mit GitHub: Issues, PRs, Code-Suche, Branches, Checks, Labels.

**Verwende es für:** Issues lesen/erstellen/kommentieren, PRs öffnen/reviewen/mergen, Code repo-übergreifend suchen, Workflow-Labels setzen.

**Verwende es NICHT für:** Lokale Dateioperationen (→ Read/Edit/Bash), lokale Git-Kommandos (→ Bash mit git).

**Voraussetzung:** `GITHUB_PERSONAL_ACCESS_TOKEN` als Umgebungsvariable.

### Fetch (`fetch`)

Externe Webinhalte abrufen: Dokumentation, MDN, RFCs, Changelogs, Release Notes, URLs aus Issues.

**Verwende es NICHT für:** GitHub-Inhalte (→ github MCP), lokale Dateien (→ Read).

### Memory (`memory`)

Projektübergreifendes Wissen persistent speichern. Datei: `.claude/memory.json` (versioniert).

**Schreiben nach:** Architekturentscheidungen, Begründungen für nicht-offensichtliche Lösungen, Debugging-Ergebnisse, Brainstorming-Ergebnisse.

**Lesen am:** Sessionbeginn, nach Context-Kompaktierung, wenn unklar warum etwas so gebaut wurde.

**Niemals speichern:** API-Keys, Tokens, Passwörter, temporärer Zwischenstand, Code-Details die direkt aus dem Code lesbar sind.

### Context Mode (`context-mode`)

Sandboxt Tool-Output automatisch — kein expliziter Aufruf nötig.

**Explizit aufrufen:**
- `ctx_search` — nach Context-Kompaktierung: relevante Infos aus der Session-History finden (BM25-Suche)
- `ctx_insight` — Überblick über bisherigen Session-Verlauf
- `ctx_stats` — gespartes Context-Budget prüfen
- `ctx_doctor` — bei Problemen mit dem Server

### context7

Aktuelle Bibliotheks-Dokumentation direkt aus den Source-Repositories abrufen. Automatisch konfiguriert via `base/extensions.yaml`.

**Verwende es für:** Aktuelle API-Dokumentation, Versionsmigration, Framework-spezifisches Debugging, Changelog-Inhalte — überall wo Trainingsdaten veraltet sein könnten.

**Verwende es NICHT für:** GitHub-Inhalte (→ github MCP), lokale Dateien (→ Read), allgemeine Programmierkonzepte.

**Keine Konfiguration nötig** — wird beim ersten `forgecrate init/update` automatisch als Projekt-MCP-Server eingerichtet.

## MCP-Konfiguration: Single Source of Truth

Die Datei `.mcp.json` wird aus `base/extensions.yaml` generiert — `base/extensions.yaml` ist die Quelle der Wahrheit für MCP-Server-Konfigurationen (inkl. Umgebungsvariablen wie `MEMORY_FILE_PATH`). Änderungen immer dort vornehmen, nicht direkt in `.mcp.json`.

## Backend-Profil

- API-Design: REST-First, klare Fehlercodes, keine unnötige Abstraktion
- Datenbankzugriffe: typsicher, keine Raw-Queries ohne Parametrisierung
- Tests: Integrationstests bevorzugt gegenüber reinen Unit-Tests mit Mocks
- Kein ORM-Magic: explizite Queries sind verständlicher
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
make dnsmasq        # Split-DNS for *.homeserver on LAN + tailscale0
make scanner        # Bare-metal Fujitsu scanner + scanbd + SMB mount
make semaphore      # Bootstrap Semaphore Secret on the home-server
make semaphore-targets  # Push Semaphore SSH key to all managed targets
make semaphore-bootstrap # Provision Projects/Repos/Inventories/Templates in Semaphore via API
make semaphore-bootstrap-local # Run semaphore-bootstrap natively on the home server (no SSH)

make lint           # yamllint + ansible-lint + helm lint
make vault-edit     # Edit vault-encrypted vars (ansible/group_vars/all.yml)
make clean          # Remove cached Ansible collections and temp artifacts
```

## Architecture

```
Ansible (provisioning)
  └── ansible/site.yml          ← entry point; roles run in this order:
        common → dnsmasq → tailscale → k3s → argocd → scanner → semaphore_secrets
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
- `charts/`, `Chart.lock`, and `*.tgz` are git-ignored (vendored chart tarballs are the exception when checked in deliberately, e.g. `headlamp`)

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
| `dnsmasq_hosts` | Names served under `*.homeserver` by dnsmasq |
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
- Hardware button → `scanbd` → `scan_button.sh` (flock-guarded) → `scan_to_pdf.sh`
  → PDF lands on the CIFS mount `/mnt/paperless-consume` (UGREEN NAS).
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
- **Grafana** — available at `http://grafana.homeserver` (LAN + Tailnet via dnsmasq); ships Node Exporter Full, VictoriaMetrics, and Kubernetes Views dashboards

## Gotchas

- **kubectl context**: Your local kubeconfig may point to a different cluster (e.g. `kind`). Always run `kubectl` via SSH or explicitly set `--kubeconfig`.
- **Helm OCI charts**: Some apps (e.g. `kubeseal-webgui`) use OCI registries (`oci://ghcr.io/...`). The `repository:` field must use the `oci://` prefix — HTTP Helm repo URLs will 404 even if the chart exists at the OCI registry.
- **Grafana sidecar + dashboards conflict**: Setting both `grafana.sidecar.dashboards.enabled: true` and `grafana.dashboards:` in the same values file causes a Helm template error. Use the sidecar only; default dashboards are shipped via labeled ConfigMaps.
- **Grafana fresh DB**: If Grafana crashes with `no such column: is_service_account`, delete the corrupt `grafana.db` directly from the PVC on the host and restart the deployment. The PVC path is `/var/lib/rancher/k3s/storage/<pvc-name>_monitoring_monitoring-grafana/`.
- **Semaphore bootstrap — first-run 400s**: `make semaphore-bootstrap` is idempotent — GET-list, then POST-if-missing for keys/repos/inventories and PUT-update-in-place for templates. On the very first run a 400 from the Ansible `uri` module is occasionally seen during resource creation (race between key creation and the next list call). Re-run until clean; subsequent runs are no-ops.
- **Semaphore vault-password rotation**: `semaphore_vault_password` in `group_vars/all.yml` is pushed into Semaphore as a `login_password` key named `vault-password` and referenced from every template via `vault_key_id`. To rotate: (1) edit the encrypted value with `make vault-edit`, (2) delete the `vault-password` key in each project via the Semaphore UI, (3) re-run `make semaphore-bootstrap` — the role recreates the key and the template-update step re-wires every template's `vault_key_id` automatically.
- **Semaphore templates self-heal on bootstrap**: `tasks/template.yml` issues `PUT /api/project/{id}/templates/{tid}` for any template that already exists, with the full desired body. This is what fixes pre-existing templates whose `vault_key_id` is NULL because they were created before the vault-password wiring landed. The PUT uses `changed_when: false` because `uri` otherwise reports `changed` on every successful PUT even when the row is unchanged.
- **Semaphore targets — SSH key prerequisite**: Before running `make semaphore-targets`, the Semaphore SSH public key must be authorized on each managed target. Fetch the pubkey from the server (`sudo cat /etc/semaphore-secrets/id_ed25519.pub`) and add it via `ssh-copy-id` or directly to `~/.ssh/authorized_keys` on the target host.
- **Running semaphore-bootstrap locally on the server**: `make semaphore-bootstrap-local` runs the same playbook with `--connection local` so no SSH back to self is needed — useful when you're already SSH'd into the home-server. Relies on jaydee's passwordless sudo (configured by the `common` role). For non-interactive runs (cron, scripts), skip the vault prompt with `VAULT_OPTS="--vault-password-file=$HOME/.vault_pass"` (chmod 600).
- **Scanner — `scanner_usb_product_id` must be set**: leaving it empty makes the role fail in pre-flight on purpose. A wildcard udev rule that matched every device with the same vendor would be worse than failing loudly. Run `lsusb` on the host and paste both IDs into `group_vars/all.yml`.
- **Scanner — first run needs the NAS reachable**: `_netdev,nofail,x-systemd.automount` keeps the host boot non-fatal when the NAS is down, but `make scanner` itself calls `ansible.posix.mount state=mounted` which actually performs the mount. Bring the NAS up before the first run, or skip the mount task with `--skip-tags scanner` until the NAS is back.
- **Scanner — ImageMagick refuses PDFs by default**: Debian/Ubuntu ship `policy.xml` with `rights="none" pattern="PDF"`. The role appends an `ANSIBLE MANAGED` block after that line; ImageMagick reads top-to-bottom and the last matching policy wins. Do not delete the upstream `rights="none"` line — that would break the package's conffile handling on upgrades.

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
