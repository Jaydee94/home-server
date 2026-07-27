# CLAUDE.md Reduktion Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLAUDE.md von ~600 auf <80 Zeilen reduzieren (Community-Best-Practice: über 80 Zeilen ignoriert Claude Teile der Datei).

**Architecture:** Zwei sequentielle Datei-Operationen: zuerst `docs/gotchas.md` mit allen Gotcha-Einträgen befüllen, dann CLAUDE.md auf das Wesentliche kürzen. Kein Code, keine Tests — Verifikation durch Zeilen-Zählen und inhaltliche Sichtprüfung.

**Tech Stack:** Markdown, Git

## Global Constraints

- Branch: `feat/claude-md-reduktion` (bereits angelegt)
- Ziel: CLAUDE.md unter 80 Zeilen (Community-Limit — darüber ignoriert Claude Teile)
- CUSTOM:BEGIN / CUSTOM:END Marker entfallen (kein GENERATED-Block mehr)
- Alle anderen `docs/`-Dateien bleiben unverändert
- Keine Änderungen an Skills, Settings, `.mcp.json`

---

### Task 1: docs/gotchas.md erstellen

**Files:**
- Create: `docs/gotchas.md`

**Interfaces:**
- Consumes: Gotchas-Abschnitt aus `CLAUDE.md` (Zeilen 505–537)
- Produces: `docs/gotchas.md` — alle ~30 Gotcha-Einträge, nach Thema gruppiert

- [ ] **Schritt 1: `docs/gotchas.md` anlegen**

Datei mit folgendem Inhalt erstellen — alle Einträge 1:1 aus CLAUDE.md übernehmen, nach Thema neu gruppiert:

```markdown
# Gotchas & Fallstricke

Service-spezifische Fallstricke für dieses Home-Server-Setup.
Verweis aus CLAUDE.md — hier die vollständige Liste.

## Tooling

- **kubectl context**: Your local kubeconfig may point to a different cluster (e.g. `kind`). Always run `kubectl` via SSH or explicitly set `--kubeconfig`.
- **Helm OCI charts**: Some apps (e.g. `kubeseal-webgui`) use OCI registries (`oci://ghcr.io/...`). The `repository:` field must use the `oci://` prefix — HTTP Helm repo URLs will 404 even if the chart exists at the OCI registry.
- **Memory MCP — `.claude/`-Verzeichnis im npx-Cache fehlt nach Neuinstallation**: Der `@modelcontextprotocol/server-memory`-Server speichert `memory.json` unter `<install-path>/dist/.claude/memory.json`. Das Verzeichnis wird beim ersten `npx`-Run nicht automatisch angelegt — `create_entities` schlägt mit `ENOENT` fehl, während `read_graph` (lesend) ein leeres Ergebnis zurückgibt ohne zu melden dass die Datei fehlt. Fix: `mkdir -p "$(ls -d ~/.npm/_npx/*/node_modules/@modelcontextprotocol/server-memory/dist 2>/dev/null | head -1)/.claude"`. Nach einem `npx`-Cache-Invalidierungslauf (neues Package, npm cache clean) muss das Verzeichnis erneut angelegt werden.

## MetalLB / Networking

- **MetalLB vs. k3s-Klipper**: Damit MetalLB den Pi-hole-DNS-Service exklusiv bekommt (statt Klipper), setzen **beide** Seiten dieselbe `loadBalancerClass: metallb.universe.tf/metallb` — der Service (`serviceDns.loadBalancerClass`) und der Controller (`metallb.loadBalancerClass`). Klipper überspringt klassifizierte Services (k3s ≥ v1.26); MetalLB greift nur bei passendem `--lb-class`. Fehlt eine Seite → Service bleibt `<pending>` oder bekommt zwei EXTERNAL-IPs.
- **MetalLB — IP-Konflikt nach Annotation-Removal bleibt `<pending>`**: Wenn ein Service von LoadBalancer auf ClusterIP wechselt und die `metallb.io/ip-allocated-from-pool`-Annotation per `kubectl annotate svc … key-` entfernt wird, hält der MetalLB-Controller die IP dennoch im In-Memory-State. Fix: `kubectl -n metallb rollout restart deployment metallb-controller`.
- **Jellyfin `jellyfin-tailscale`-Service absichtlich OHNE `loadBalancerClass`**: Klipper SOLL ihn übernehmen und hostPort `0.0.0.0:8096` binden, damit Tailscale Shared Nodes Jellyfin direkt über `http://<tailscale-ip>:8096` erreichen. Nicht „korrigieren". Details: `docs/16-jellyfin.md`.

## Pi-hole / DNS

- **Pi-hole ist der einzige DNS-Server (dnsmasq abgelöst)**: Läuft auf MetalLB-IP `192.168.178.2:53`. Host fragt es via `host_dns`-Rolle. LAN-weit aktiv erst wenn FritzBox „Lokaler DNS-Server = 192.168.178.2" gesetzt ist. Details: `docs/15-pihole.md`.
- **Pi-hole NICHT auf die Node-IP `:53` legen**: k3s' Klipper-ServiceLB würde hostPort `0.0.0.0:53` binden und den Host-Resolver lahmlegen. Deshalb dedizierte MetalLB-IP `.2`.
- **Pi-hole IP muss außerhalb des FritzBox-DHCP-Bereichs liegen**: `192.168.178.2` darf nicht vom DHCP vergeben werden. Andere IP nötig? An vier Stellen ändern: `metallb/templates/ipaddresspool.yaml`, `pihole/values.yaml`, `group_vars/all.yml`, FritzBox.

## Grafana

- **Grafana sidecar + dashboards conflict**: Setting both `grafana.sidecar.dashboards.enabled: true` and `grafana.dashboards:` causes a Helm template error. Use the sidecar only.
- **Grafana fresh DB**: If Grafana crashes with `no such column: is_service_account`, delete `grafana.db` from the PVC and restart. PVC path: `/var/lib/rancher/k3s/storage/<pvc-name>_monitoring_monitoring-grafana/`.

## KubeVirt / Gameserver

- **KubeVirt — Bare-Metal-Voraussetzung**: Benötigt `/dev/kvm`. Vor erstem Sync `virt-host-validate` ausführen. Ohne KVM: `useEmulation: true` in `kubevirt-cr.yaml` (langsam).
- **KubeVirt — Bootstrap-Reihenfolge via ArgoCD-Retry**: `argocd/apps/kubevirt/` muss vor `argocd/apps/gameserver/` konvergieren. Retry (5×, exponential) übernimmt das automatisch.
- **KubeVirt — VM bleibt Halted bis Secret versiegelt**: `vm.runStrategy` initial `Halted`. On-Demand-Start: `kubectl patch vm 7dtd-server -n gameserver --type merge -p '{"spec":{"runStrategy":"Always"}}'`. Details: `docs/19-gameserver.md`.
- **KubeVirt — CDI deployt in eigenem Namespace `cdi`**: Ressourcen mit eigenem `namespace:`-Feld überschreiben die ArgoCD-Destination.
- **KubeVirt — cloud-init enthält alle Secrets**: Gesamte Userdata im SealedSecret `gameserver-cloudinit`. Änderungen → neu versiegeln → `values.yaml` updaten. Prozedur: `docs/19-gameserver.md`.
- **Tailscale Node-Sharing + tag:gameserver**: Tag muss in `tagOwners` eingetragen sein. Bekannte Reibung: [tailscale/tailscale#14445](https://github.com/tailscale/tailscale/issues/14445) — Workaround: Grant direkt auf Tailscale-IP statt tag-basiertes `dst`.

## Scanner / SANE

- **Scanner — USB-IDs + erster Run**: `scanner_usb_product_id` muss gesetzt sein — `lsusb` auf dem Host, IDs in `group_vars/all.yml`. Details: `docs/10-scanner.md`.
- **Scanner — scanbd hält USB exklusiv**: `scanimage` schlägt mit `LIBUSB_ERROR_BUSY` fehl solange scanbd läuft. `scanner-trigger.service` stoppt/startet scanbd automatisch. Diagnose: `SANE_DEBUG_SANEI_USB=1 scanimage -L`.
- **Scanner — SANE_CONFIG_DIR beim Ausführen als saned**: Fix: `runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`.

## Semaphore / Bootstrap

- **Semaphore bootstrap — first-run 400s**: Idempotent — re-run bis clean; Folge-Runs sind No-Ops.
- **Semaphore templates self-heal on bootstrap**: `PUT /api/project/{id}/templates/{tid}` für jedes existierende Template. `changed_when: false` weil `uri` sonst immer `changed` meldet.
- **Semaphore targets — SSH key prerequisite**: Pubkey aus `sudo cat /etc/semaphore-secrets/id_ed25519.pub` auf jedem Target autorisieren.
- **Semaphore bootstrap — `body_format: json` + integer fields**: Fix: Jinja2-Dict-Literal in `>-`-Block verwenden: `{{ {'key': val | int} | to_json }}`.
- **Ansible-Templates — Jinja2 `trim_blocks` + `{% raw %}`**: `{% endraw %}` immer auf eigener Zeile platzieren.

## Media-Stack / Recyclarr

- **Media-Stack — ein gemeinsamer SMB-Mount + cifs uid/gid 1001**: Downloads und Bibliothek im selben Mount → Imports sind serverseitige Moves. Hardlinks gehen über SMB nicht. Jellyfin-PV mountet denselben Share mit `uid=0`. Details: `docs/21-media-stack.md`.
- **Media-Stack — Sprach-Profile sind Recyclarr-managed**: Recyclarr-CronJob täglich 05:30. Deutsch strikt (`min_format_score: 10000`). Manuelle UI-Änderungen werden überschrieben.
- **Recyclarr — Kein doppelter trash_id in quality_profiles**: Überspringt stillschweigend die gesamte Sektion. Fix: Zweites Profil als `name:`-only definieren.

## Home Assistant / HA-MCP

- **Home Assistant — Erweiterungen via Init-Container (HACS-frei)**: Frontend-Karten einmalig manuell als Lovelace-Ressource registrieren (*Einstellungen → Dashboards → Ressourcen*). Details: `docs/17-homeassistant.md`.
- **Nuki MQTT — Broker braucht MetalLB-LAN-IP**: Nuki spricht `192.168.178.4:1883` direkt an. Firmware ≥ 4.0.28. SealedSecret `mosquitto-auth` — solange leer: Pod bleibt `ContainerCreating`. Details: `docs/18-nuki-mqtt.md`.
- **HA-MCP — Cross-Namespace-NetworkPolicy**: HA-NetworkPolicy muss Ingress aus Namespace `ha-mcp` erlauben — fehlt → Timeout statt Fehlermeldung. Details: `docs/22-ha-mcp.md`.
```

- [ ] **Schritt 2: Datei prüfen**

```bash
wc -l docs/gotchas.md
# Erwartet: ~90 Zeilen
grep "^##" docs/gotchas.md
# Erwartet: 8 Gruppen-Überschriften (Tooling, MetalLB, Pi-hole, Grafana, KubeVirt, Scanner, Semaphore, Media-Stack, HA)
```

- [ ] **Schritt 3: Committen**

```bash
git add docs/gotchas.md
git commit -m "docs(gotchas): Gotchas aus CLAUDE.md nach docs/gotchas.md auslagern

Alle ~30 Gotcha-Einträge nach Thema gruppiert: Tooling, MetalLB,
Pi-hole, Grafana, KubeVirt, Scanner, Semaphore, Media-Stack, HA-MCP.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: CLAUDE.md auf <80 Zeilen kürzen

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `docs/gotchas.md` (aus Task 1)
- Produces: `CLAUDE.md` mit <80 Zeilen, ohne GENERATED-Block, ohne Gotchas, ohne Referenz-Abschnitte

- [ ] **Schritt 1: CLAUDE.md komplett neu schreiben**

Den gesamten Inhalt (alle 608 Zeilen) durch folgendes ersetzen:

````markdown
# CLAUDE.md

## What this repo is

A fully automated, GitOps-driven home server. Ansible provisions the host (Ubuntu 26.04 LTS); k3s runs Kubernetes; ArgoCD continuously syncs everything under `argocd/apps/` to the cluster; Tailscale provides VPN access with no public ports exposed.

## Commands

```bash
make deps / ping / check / install      # Galaxy deps, connectivity, dry-run, full provision
make common / tailscale / k3s / argocd  # Individual Ansible roles
make host-dns / scanner / semaphore     # DNS, scanner, Semaphore secret
make semaphore-targets / semaphore-bootstrap / semaphore-bootstrap-local
make nas / nas-check                    # UGREEN NAS deploy / dry-run
make lint / vault-edit / clean          # Lint, edit vault vars, cleanup
```

## Architecture

```
Ansible → ansible/site.yml (common → host_dns → tailscale → k3s → argocd → scanner → semaphore_secrets)
          ansible/group_vars/all.yml  ← ALL config knobs + vault secrets
k3s     → single-node; bundles Traefik v2, CoreDNS, local-path-provisioner
ArgoCD  → argocd/bootstrap/root-applicationset.yaml
           discovers every dir under argocd/apps/* → auto-syncs on push to main
```

**Adding an app:** `mkdir -p argocd/apps/my-app` + add YAML/Helm → commit+push → ArgoCD picks up in ~3 min.

## Server Access

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl ...'
```

## Service URLs

| Service | URL |
|---|---|
| Grafana | http://grafana.homeserver |
| ArgoCD | http://\<server-ip\>:30080 |
| Headlamp / Semaphore / Gotify | http://{headlamp,semaphore,gotify}.homeserver |
| Argo Workflows / MinIO | http://{argo-workflows,minio}.homeserver |
| Homepage / Pi-hole | http://home.homeserver · http://pihole.homeserver/admin/login |
| Jellyfin / Prowlarr / SABnzbd | http://{jellyfin,prowlarr,sabnzbd}.homeserver |
| Sonarr / Radarr / Seerr | http://{sonarr,radarr,seerr}.homeserver |
| Home Assistant / HA-MCP | http://homeassistant.homeserver · http://ha-mcp.homeserver/\<secret\> |
| Mosquitto | mqtt://192.168.178.4:1883 |
| Gameserver-UI / 7DTD | http://gameserver.homeserver · 100.x.x.x:26900 (Tailscale) |
| Paperless / OpenCode / DayPilot | http://jays-ugreen:{8000,4096,3003} |

## Secrets

`ansible/group_vars/all.yml` via Ansible Vault. `make vault-edit` to open. Never commit plaintext.

## Lint & CI

`yamllint` + `ansible-lint` + `helm lint` + `actionlint` · Trivy security scan (soft, non-blocking) · PRs only — never push directly to `main`; merge only on green CI.

## Claude Skills

| Skill | Invoke |
|---|---|
| cluster-health | `/cluster-health` |
| add-app | `/add-app` |
| forgecrate-advisor / repo-onboarding / repo-health | `/forgecrate-{advisor,repo-onboarding,repo-health}` |
| forgecrate-release / db-migration / handoff | `/forgecrate-{release,db-migration,handoff}` |

## Gotchas

→ **[docs/gotchas.md](docs/gotchas.md)** — MetalLB, Pi-hole, KubeVirt, Scanner, Semaphore, Media-Stack, HA-MCP, Tooling

## Networking

No public ports. All remote access via Tailscale. Traefik on 80/443. ArgoCD UI on 30080/30443.
````

- [ ] **Schritt 2: Zeilenzahl prüfen**

```bash
wc -l CLAUDE.md
# Erwartet: unter 80 Zeilen
```

- [ ] **Schritt 3: Inhaltlich prüfen**

```bash
grep "^##" CLAUDE.md
# Erwartet: 9 Abschnitte
grep "gotchas.md" CLAUDE.md
# Erwartet: mindestens 1 Treffer
grep "GENERATED" CLAUDE.md
# Erwartet: kein Treffer
grep "CUSTOM" CLAUDE.md
# Erwartet: kein Treffer
```

- [ ] **Schritt 4: Committen**

```bash
git add CLAUDE.md
git commit -m "feat(claude-md): CLAUDE.md auf <80 Zeilen reduzieren (~87 % Reduktion)

- GENERATED-Block entfernt (redundant zum forgecrate system-reminder)
- Gotchas nach docs/gotchas.md ausgelagert
- Scanner, Monitoring, Key variables, Renovate-Details entfernt
- Service URLs komprimiert (Brace-Expansion-Stil)
- Commands komprimiert (Gruppen statt Einzelzeilen)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: PR erstellen

**Files:** keine

- [ ] **Schritt 1: Commits auf Branch prüfen**

```bash
git log --oneline feat/claude-md-reduktion
# Erwartet: 3 Commits (spec + gotchas + claude-md)
```

- [ ] **Schritt 2: PR erstellen**

```bash
gh pr create \
  --title "feat(claude-md): CLAUDE.md auf <80 Zeilen reduzieren (~87 % Reduktion)" \
  --body "$(cat <<'EOF'
## Was

- `GENERATED`-Block (313 Zeilen) entfernt — identisch im forgecrate system-reminder vorhanden
- ~30 Gotchas nach `docs/gotchas.md` ausgelagert, nach Thema gruppiert
- Referenz-Abschnitte (Scanner, Monitoring, Key variables, Renovate) entfernt
- Service URLs + Commands komprimiert

## Warum

Context-Kosten und Lesbarkeit. Community-Best-Practice: CLAUDE.md über 80 Zeilen → Claude ignoriert Teile. 600 Zeilen → <80 Zeilen.

## Wie getestet

- `wc -l CLAUDE.md` → unter 80 Zeilen ✓
- `wc -l docs/gotchas.md` → alle ~30 Gotchas vorhanden ✓
- `grep "GENERATED" CLAUDE.md` → kein Treffer ✓
- Inhaltliche Sichtprüfung aller Abschnitte ✓

Closes #[issue-nummer eintragen]
EOF
)"
```
