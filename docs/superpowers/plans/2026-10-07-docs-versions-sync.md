# Docs-Versionen aktuell halten (auch nach Renovate-Merges) — Plan

> **Status:** Plan, noch nichts umgesetzt. Stand der Analyse: 2026-10-07, `main` @ `526fa6d`.
> **Sprache/Format:** wie die anderen Pläne in `docs/superpowers/plans/`.

## 0. Kernaussage (unbequem zuerst)

**Handgeschriebene Versionsnummern in Prosa-Docs lassen sich nicht zuverlässig aktuell halten — der robuste Weg ist, sie dort zu löschen und genau eine generierte Tabelle zu pflegen.** Der Repo-Stand belegt das:

| Befund | Beleg |
|---|---|
| 3 von 6 Versionsangaben in App-Docs sind nachweislich veraltet, 1 nicht aus dem Repo prüfbar | `docs/16-jellyfin.md:14` „App 10.11.10" (Image-Tag ist `10.11.11`), `:15` csi-driver-smb „1.20.1" (Chart: `1.20.3`), `docs/17-homeassistant.md:13` Chart „0.3.64" (Chart: `0.3.83`), „App 2025.6" nicht prüfbar |
| `appVersion` in `Chart.yaml` ist keine verlässliche Quelle | 6 von 21 Charts widersprechen dem gepinnten Image-Tag (`gotify` 2.6.3 vs 3.1.1, `ha-mcp` 7.14.2 vs 8.6.0, `pihole` 2026.04.1 vs 2026.09.0, `sealed-secrets` 0.36.6 vs 0.40.0, `jellyfin`, `example-whoami`); 6 weitere stehen auf `"latest"` |
| Renovate fasst `appVersion` gar nicht an | Lokaler Renovate-Extract (siehe §2): 115 erkannte Dependencies, **0** davon `appVersion`-Felder. Der Kommentar in `argocd/apps/home-assistant/values.yaml:4` („Renovate watches the `appVersion` in Chart.yaml") ist falsch |
| Ein Teil der laufenden Software steht gar nicht im Repo | k3s (`k3s_channel: stable`, `k3s_version: ""`), ArgoCD (`argocd_version: ""`), Traefik/CoreDNS (von k3s gebündelt), Tailscale, `gameserver-ui:stable` |
| Bei Chart-Wrappern steht die **App**-Version nirgends im Repo | Z. B. `headlamp`, `minio`, `metallb`, `monitoring` (VictoriaMetrics), `argo-workflows`, `homepage`: nur die *Chart*-Version ist gepinnt; die App-Version kommt aus dem Chart |

Konsequenz: „Renovate soll auch die Docs ändern" deckt nur den Teil ab, den Renovate überhaupt kennt. Für Chart-Wrapper braucht es zusätzlich eine Auflösung Chart → App-Version.

## 1. Ziel & Nicht-Ziele

**Ziel:** Nach jedem gemergten Renovate-PR zeigt die Doku innerhalb von max. ~1 Tag (oder im selben PR) die tatsächlich deployten Versionen — ohne manuelle Pflege.

**Nicht-Ziele:**
- Kein Commit direkt auf Renovate-Branches (siehe §4, Option E).
- Kein Direkt-Push auf `main` (CLAUDE.md: „PRs only").
- Keine neue Pflicht-Statuscheck-Hürde für Renovate-PRs (würde Automerge brechen).

## 2. Recherche-Ergebnisse

Verifiziert **im Repo** (hohe Sicherheit):

- `renovate.json` hat 3 Regex-Custom-Manager + `config:recommended`. Lokaler Lauf `renovate --platform=local --dry-run=extract --report-type=file` (Renovate 44.x, ohne Token, ohne Netz-Lookups) liefert ein JSON-Inventar: Manager `helmv3` 13 Dateien, `helm-values` 11, `regex` 11, `ansible-galaxy`, `github-actions`, `npm`, `dockerfile`. Config validiert (`renovate-config-validator`). → Renovate selbst kann als **Vollständigkeits-Check** dienen („was wird getrackt, was nicht").
- Commits kommen von `renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>`, es gibt keinen Renovate-Workflow in `.github/workflows/` → sehr wahrscheinlich die **gehostete Mend-Renovate-App** (Konfidenz: **Hoch**).
- Es existiert bereits eine Render-Pipeline: `security.yml` → Job `discover-images` rendert jeden Chart unter `argocd/apps/` per `helm dependency update` + `helm template` und extrahiert alle Images (`.github/scripts/discover_images.py`). Das enthält auch Images, die nur das Chart mitbringt — genau die Lücke aus §0. **Wiederverwendbar.**
- `main` verlangt die Statuschecks `yamllint` und `helm lint (all charts)` (Kommentar in `lint.yml`). Beide Jobs laufen auch bei Docs-only-PRs und gehen grün („No YAML changes" / „No changed Helm charts").

Aus Web-Recherche (Konfidenz je Punkt; `docs.renovatebot.com` war vom Egress-Proxy blockiert, Aussagen stammen aus Suchtreffern/Snippets der offiziellen Doku und Dritter — vor Umsetzung gegen die Originaldoku gegenprüfen):

| Aussage | Konfidenz | Folge |
|---|---|---|
| `postUpgradeTasks` (Renovate führt nach einem Bump ein Script aus und committet das Ergebnis in denselben PR) ist **nur Self-Hosted** (`allowedPostUpgradeCommands`) | Mittel-Hoch | Mit der Mend-App nicht nutzbar |
| Wird auf einen Renovate-Branch ein Fremd-Commit gepusht, **stoppt Renovate alle Updates dieses Branches** („Edited/Blocked"); Rebase nur per Checkbox und dann gehen die Fremd-Commits verloren | Hoch | Ein „Docs-Update-Action", die auf den PR-Branch committet, sabotiert Renovate |
| Regex-Custom-Manager können beliebige Dateien (auch `*.md`) per `managerFilePatterns` + `matchStrings` auslesen und ändern; selbe Dependency (gleicher `depName` + Datasource) in mehreren Dateien ⇒ **ein** PR | Mittel-Hoch | Docs-Zeilen können im selben PR mitwandern — aber nur bei identischem `depName`/Datasource |
| Mit `GITHUB_TOKEN` erstellte PRs/Pushes lösen **keine** Workflows aus; Lösung: GitHub-App-Token (`actions/create-github-app-token`) oder PAT; fester `branch`-Name aktualisiert denselben PR statt neue zu erzeugen (`peter-evans/create-pull-request`) | Hoch | Weil `yamllint` / `helm lint` Pflicht-Checks sind, **muss** ein Sync-PR mit App-Token/PAT erzeugt werden, sonst hängt er ewig auf „Expected" |
| `renovate --platform=local --dry-run=extract` extrahiert ohne Schreibzugriff; `--report-type=file` schreibt die Dependencies als JSON | Hoch (selbst getestet) | Optionaler Coverage-Check |

## 3. Optionen & Trade-offs

| # | Option | Vorteile | Nachteile / Risiken |
|---|---|---|---|
| A | **Versionen aus Prosa-Docs löschen**, nur noch auf `docs/versions.md` verlinken | Null Drift-Fläche; kostet nichts; macht jede andere Option kleiner | Docs sind „weniger konkret"; einmaliger Aufräum-PR |
| B | **Renovate-Annotationen in den Docs** (`<!-- renovate: datasource=docker depName=jellyfin/jellyfin -->` + Regex-Manager auf `docs/**/*.md`) | Gleicher PR wie der Bump, kein Extra-Infra, funktioniert mit Mend-App | Nur für Deps, die Renovate kennt; Chart→App-Version nicht auflösbar; abweichender `depName` (Helm `jellyfin` vs. Docker `jellyfin/jellyfin`) ⇒ **getrennte PRs**, Docs-Zeile hängt dann evtl. dem Image-PR hinterher; HTML-Kommentare verschandeln Markdown; jede neue Zeile braucht manuell eine Annotation |
| C | **Generierte `docs/versions.md` + Pflicht-CI-Check** („Datei muss aktuell sein") | Drift technisch unmöglich | **Rote Renovate-PRs** (Renovate fasst die Datei nicht an) ⇒ Automerge tot, du pflegst von Hand nach. Abgelehnt |
| D | **Generierte `docs/versions.md` + Sync-PR nach Merge** (Schedule/Push-auf-`main`, fester Branch, App-Token, Auto-Merge) | Deckt **alle** Quellen ab (Chart-Images, Ansible, Kustomize); Renovate bleibt unberührt; konform mit „PRs only"; ein gebündelter PR statt Rauschen pro Bump | Zeitversatz (bis zum nächsten Lauf); braucht GitHub-App/PAT als Secret; zusätzlicher Workflow, der selbst gepflegt werden muss |
| E | Workflow committet die Docs **auf den Renovate-Branch** | „Selber PR" | Löst „Edited/Blocked" aus ⇒ Renovate hört auf, den PR zu aktualisieren; GITHUB_TOKEN-Commit triggert zudem keine Checks. **Abgelehnt** |
| F | **Renovate selbst hosten** (Action/CronWorkflow) + `postUpgradeTasks` ruft den Generator auf | Docs im selben PR, sauber, ohne Fremd-Commit-Problem | Migration weg von der Mend-App, eigenes Token + `allowedPostUpgradeCommands`, Betrieb/Updates von Renovate selbst — unverhältnismäßig für das Problem. Später evaluieren, falls Renovate-Self-Hosting ohnehin ein Ziel wird |
| G | **Live-Sicht** (Grafana-Panel auf `kube_pod_container_info`, bzw. Homepage-Widget) | Zeigt echte Laufzeit-Versionen inkl. k3s-Komponenten, löst Chart→App automatisch | Ist keine Doku im Repo, braucht Cluster; ergänzend sinnvoll, kein Ersatz |

**Empfehlung: A + D, optional G. B nur punktuell, E/C nicht.** Begründung: A entfernt das Problem an der Wurzel, D liefert die eine Wahrheitsquelle ohne Renovate zu stören. B scheint verlockend („im selben PR"), skaliert aber schlecht, weil es genau die Lücken (Chart→App, unpinned Komponenten) nicht schließt und pro Doc-Zeile Handarbeit bleibt.

## 4. Zielbild

```
Renovate-PR (Chart/Image/Ansible-Pin) ──► CI grün ──► Automerge auf main
                                                         │
                         push auf main / Schedule (täglich)
                                                         ▼
            Workflow "docs-versions": helm template aller Charts
            + Chart.yaml-Dependencies + ansible defaults + kustomization
                         │  .github/scripts/gen_versions.py  (deterministisch, sortiert)
                         ▼
        Änderung in docs/versions.md? ── nein ─► fertig (kein PR)
                         │ ja
                         ▼
      PR "docs: sync deployed versions" (fester Branch chore/docs-versions,
      App-Token ⇒ Pflicht-Checks laufen) ──► Auto-Merge nach grün
```

`docs/versions.md` (generiert, Marker `<!-- BEGIN GENERATED:versions -->` … `END`), pro App eine Zeile:

| App | Image(s) im gerenderten Manifest | Chart (Version) | Quelle |
|---|---|---|---|

Plus Abschnitt **„Nicht im Repo gepinnt"**: k3s, ArgoCD, Traefik, Tailscale, `gameserver-ui:stable` — dort steht „folgt Kanal/`stable`" statt einer Nummer (ehrlicher als eine erfundene).

## 5. Umsetzung (Phasen, jeweils eigener PR)

### Phase 1 — Aufräumen (Option A)

- [ ] Versionsnummern in Prosa entfernen/ersetzen durch Verweis auf `docs/versions.md`: `docs/16-jellyfin.md:14-15`, `docs/17-homeassistant.md:13`, `docs/12-paperless-ai.md:26`. Zeilen der Form `| Chart | … (… 3.2.0, App 10.11.10) |` → nur Pfad, ohne Zahlen.
- [ ] Falschen Kommentar `argocd/apps/home-assistant/values.yaml:3-4` korrigieren (Renovate beobachtet `appVersion` nicht; App-Version folgt dem Chart).
- [ ] Entscheiden, was mit `Chart.yaml: appVersion` passiert (siehe §7, Entscheidung 2). Mindestens: Kommentar im jeweiligen `Chart.yaml`, dass der Wert dekorativ ist **oder** Feld bei Wrappern auf `"latest"`-Müll bereinigen. Templates, die `.Chart.AppVersion` als Fallback nutzen (`gotify`, `ha-mcp`, `paperless-ai`, `semaphore`, `example-whoami`), haben alle ein gesetztes `image.tag` in `values.yaml` — Fallback ist tot.

### Phase 2 — Generator (TDD)

- [ ] `discover_images.py` um einen Modus erweitern, der **pro Chart** gruppiert (`--by-chart`, JSON), Default-Verhalten für `security.yml` bleibt unverändert.
- [ ] `.github/scripts/gen_versions.py`: liest gerenderte Manifeste + `Chart.yaml`-Dependencies + `ansible/roles/*/defaults/main.yml` (Images) + `argocd/apps/kubevirt/kustomization.yaml`; schreibt nur zwischen den Markern in `docs/versions.md`.
  - **Fail-closed:** schlägt `helm dependency update`/`template` für einen Chart fehl, bricht das Script ab. Die bestehende Security-Pipeline darf mit Warning weiterlaufen (anderer Zweck); für Docs wäre eine stille Teiltabelle schlimmer als kein Update.
  - Deterministisch (Sortierung, keine Zeitstempel/Commit-SHAs in der Datei), sonst entsteht ein Dauer-PR.
- [ ] Tests (`pytest`, Fixtures mit minimalen Manifesten): Idempotenz (2× laufen ⇒ kein Diff), Marker-Ersetzung, Sortierung, Abbruch bei fehlgeschlagenem Render, Windows-Variant-Filter bleibt erhalten.
- [ ] Optional: Coverage-Check — `renovate --platform=local --dry-run=extract --report-type=file` und prüfen, dass jedes Image in `versions.md` eine Renovate-Dependency hat; Lücken als Warnung im Workflow-Summary (nicht blockierend). Kostet ~40 s `npm install renovate` im Job; nur im Schedule-Lauf.

### Phase 3 — Sync-Workflow (Option D)

- [ ] `.github/workflows/docs-versions.yml`: Trigger `push` auf `main` (paths: `argocd/apps/**`, `ansible/roles/**/defaults/**`, `renovate.json`) + `schedule` (täglich) + `workflow_dispatch`; `permissions: contents: read`, Schreibzugriff nur über den App-Token-Schritt.
- [ ] Token: GitHub-App (Contents + Pull requests: write) via `actions/create-github-app-token`; **nicht** `GITHUB_TOKEN`, weil sonst `yamllint`/`helm lint (all charts)` nie laufen und der PR blockiert bleibt. Fallback: fine-grained PAT (sensibleres Secret, läuft ab).
- [ ] `peter-evans/create-pull-request` mit festem `branch: chore/docs-versions`, `delete-branch: true`; danach Auto-Merge aktivieren. Actions an Commit-SHA pinnen (Repo-Konvention nach den Trivy-Vorfällen, siehe Kommentar in `security.yml`); `actionlint` muss grün bleiben.
- [ ] Schleifenschutz: Generator ist idempotent ⇒ der Lauf nach dem Merge des Sync-PRs findet keinen Diff und erzeugt keinen PR.
- [ ] `CLAUDE.md`/`docs/gotchas.md` um 2-3 Zeilen ergänzen („`docs/versions.md` nie von Hand editieren; Sync-PR kommt automatisch").

### Phase 4 — Optional

- [ ] Lücke „nicht gepinnt" schließen, falls gewünscht: `k3s_version`/`argocd_version` in `ansible/group_vars/all.yml` pinnen und per Regex-Custom-Manager von Renovate tracken lassen. **Trade-off:** reproduzierbar und sichtbar, aber Upgrades passieren dann erst nach `make install`/Semaphore-Lauf, nicht von selbst.
- [ ] Grafana-Panel „Deployed versions" (Option G) in `argocd/apps/monitoring-dashboards/` — prüft zusätzlich Git-Stand vs. Laufzeit.

## 6. Verifikation (vor „fertig")

1. Generator lokal: 2× ausführen ⇒ zweiter Lauf ohne Diff.
2. Simulierter Renovate-Bump (z. B. `jellyfin/jellyfin` Tag lokal ändern) ⇒ `versions.md` ändert genau diese Zeile.
3. Workflow per `workflow_dispatch` auf einem Testbranch: PR entsteht, **`yamllint` und `helm lint (all charts)` laufen und werden grün**, Auto-Merge greift.
4. Zweiter `workflow_dispatch` direkt danach ⇒ kein neuer PR.
5. `make lint`/`actionlint` grün. Nicht getestet bisher: Helm-Rendering lokal (`helm` ist in dieser Umgebung nicht installiert), App-Token-Flow.

## 7. Offene Entscheidungen (bitte klären)

1. **App-Token oder PAT?** App = sauberer, aber einmaliges Setup (App anlegen, Secrets `APP_ID`/`APP_PRIVATE_KEY`). Ohne eines von beiden ist Phase 3 nicht sinnvoll umsetzbar. *Empfehlung: App.*
2. **`Chart.yaml: appVersion`**: (a) unverändert lassen + Kommentar „dekorativ", (b) bei Wrappern entfernen, (c) per Renovate/Script synchron halten. *Empfehlung: (b) für Wrapper, (a) für eigene Charts — (c) ist Aufwand für ein totes Feld.*
3. **Bestätigung gehostete Mend-App** (Dependency-Dashboard-Issue/Renovate-Settings prüfen). Wenn doch Self-Hosted: Option F wird billig und ersetzt Phase 3.
4. **Tabelle komplett generiert oder Docs-Prosa behalten?** Wenn du Versionen in den App-Docs für den Lesefluss unbedingt behalten willst, bleibt nur B (Annotationen) — mit den oben genannten Lücken und getrennten PRs bei abweichendem `depName`.

## 8. Quellen

- Renovate: Custom Manager (Regex), `managerFilePatterns`/`matchStrings` — <https://docs.renovatebot.com/modules/manager/regex/>
- Renovate: Updating/Rebasing, „Edited/Blocked" bei Fremd-Commits — <https://docs.renovatebot.com/updating-rebasing/>
- Renovate: Self-Hosted-Optionen (`allowedPostUpgradeCommands`) — <https://docs.renovatebot.com/self-hosted-configuration/>
- peter-evans/create-pull-request: Concepts & Guidelines (GITHUB_TOKEN-Limit, App-Token, fester Branch) — <https://github.com/peter-evans/create-pull-request/blob/main/docs/concepts-guidelines.md>
- Renovate-Bündelung mehrerer Manager-Änderungen (Blog, nur Suchsnippet gelesen) — <https://geek-cookbook.funkypenguin.co.nz/blog/2023/02/07/consolidating-multiple-manager-changes-in-renovate-prs/>
- Renovate-Migration Self-Hosted/„Edited"-Verhalten — <https://www.jvt.me/posts/2024/07/18/renovate-migrate-self-host/>
