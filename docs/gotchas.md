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
- **Pi-hole IP muss außerhalb des FritzBox-DHCP-Bereichs liegen**: `192.168.178.2` darf nicht vom DHCP vergeben werden (sonst ARP-Konflikt). Andere IP nötig? An vier Stellen ändern: `metallb/templates/ipaddresspool.yaml`, `pihole/values.yaml`, `group_vars/all.yml`, FritzBox.

## Grafana

- **Grafana sidecar + dashboards conflict**: Setting both `grafana.sidecar.dashboards.enabled: true` and `grafana.dashboards:` causes a Helm template error. Use the sidecar only; default dashboards via labeled ConfigMaps.
- **Grafana fresh DB**: If Grafana crashes with `no such column: is_service_account`, delete `grafana.db` from the PVC and restart. PVC path: `/var/lib/rancher/k3s/storage/<pvc-name>_monitoring_monitoring-grafana/`.

## KubeVirt / Gameserver

- **KubeVirt — Bare-Metal-Voraussetzung**: Benötigt `/dev/kvm`. Vor erstem Sync `virt-host-validate` ausführen. Ohne KVM: `useEmulation: true` in `kubevirt-cr.yaml` (langsam, nicht für 7DTD empfohlen).
- **KubeVirt — Bootstrap-Reihenfolge via ArgoCD-Retry**: `argocd/apps/kubevirt/` muss vor `argocd/apps/gameserver/` konvergieren. Retry (5×, exponential) übernimmt das automatisch — erste Sync-Fehler sind normal.
- **KubeVirt — VM bleibt Halted bis Secret versiegelt**: `vm.runStrategy` initial `Halted`. On-Demand-Start: `kubectl patch vm 7dtd-server -n gameserver --type merge -p '{"spec":{"runStrategy":"Always"}}'`. Details: `docs/19-gameserver.md`.
- **KubeVirt — CDI deployt in eigenem Namespace `cdi`**: Ressourcen mit eigenem `namespace:`-Feld überschreiben die ArgoCD-Destination.
- **KubeVirt — cloud-init enthält alle Secrets**: Gesamte Userdata im SealedSecret `gameserver-cloudinit`. Änderungen → neu versiegeln → `values.yaml` updaten. Prozedur: `docs/19-gameserver.md`.
- **Tailscale Node-Sharing + tag:gameserver**: Tag muss in `tagOwners` eingetragen sein. Bekannte Reibung: [tailscale/tailscale#14445](https://github.com/tailscale/tailscale/issues/14445) — Workaround: Grant direkt auf Tailscale-IP statt tag-basiertes `dst`.

## Scanner / SANE

- **Scanner — USB-IDs + erster Run**: `scanner_usb_product_id` muss gesetzt sein — `lsusb` auf dem Host, IDs in `group_vars/all.yml`. NAS muss erreichbar sein. Details: `docs/10-scanner.md`.
- **Scanner — scanbd hält USB exklusiv**: `scanimage` schlägt mit `LIBUSB_ERROR_BUSY` fehl solange scanbd läuft. `scanner-trigger.service` stoppt/startet scanbd automatisch. Diagnose: `SANE_DEBUG_SANEI_USB=1 scanimage -L`.
- **Scanner — SANE_CONFIG_DIR beim Ausführen als saned**: Fix: `runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`.

## Semaphore / Bootstrap

- **Semaphore bootstrap — first-run 400s**: Idempotent — re-run bis clean; Folge-Runs sind No-Ops.
- **Semaphore templates self-heal on bootstrap**: `PUT /api/project/{id}/templates/{tid}` für jedes existierende Template. `changed_when: false` weil `uri` sonst immer `changed` meldet.
- **Semaphore targets — SSH key prerequisite**: Pubkey aus `sudo cat /etc/semaphore-secrets/id_ed25519.pub` auf jedem Target autorisieren.
- **Semaphore bootstrap — `body_format: json` + integer fields**: Fix: Jinja2-Dict-Literal in `>-`-Block verwenden: `{{ {'key': val | int} | to_json }}`.
- **Semaphore bootstrap ist vollständig selbstheilend**: Keys, Templates und Projekte bei jedem Run reconciliert. Vault-Password rotieren: `make vault-edit` + `make semaphore-bootstrap`.
- **Ansible-Templates — Jinja2 `trim_blocks` + `{% raw %}`**: `{% endraw %}` immer auf eigener Zeile platzieren.

## Media-Stack / Recyclarr

- **Media-Stack — ein gemeinsamer SMB-Mount + cifs uid/gid 1001**: Downloads und Bibliothek im selben Mount → Imports sind serverseitige Moves. Hardlinks gehen über SMB nicht. Jellyfin-PV mountet denselben Share mit `uid=0`. Details: `docs/21-media-stack.md`.
- **Media-Stack — Sprach-Profile sind Recyclarr-managed**: Recyclarr-CronJob täglich 05:30. Deutsch strikt (`min_format_score: 10000`). Manuelle UI-Änderungen werden überschrieben.
- **Recyclarr — Kein doppelter trash_id in quality_profiles**: Zwei Einträge mit demselben `trash_id` + unterschiedlichem `qualities:`-Override → Recyclarr überspringt stillschweigend die gesamte Service-Sektion. Fix: Zweites Profil als `name:`-only definieren.

## Paperless / UGREEN NAS

- **Paperless — Docker-Compose-Projektname kollidiert bei gleichem Verzeichnisnamen**: `docker compose` leitet den Projektnamen standardmäßig vom Verzeichnisnamen ab, nicht vom vollen Pfad. Existierte parallel zu `/opt/paperless` (Ansible-verwaltet) noch eine ältere Installation in einem ebenfalls `paperless` genannten Verzeichnis (z.B. `~/paperless`), adressierte `docker compose exec`/`up -d` von `/opt/paperless` aus dieselben Container-Namen (`paperless-db-1` etc.) wie die alte Installation — Ansible-Deploys "kaperten" die laufenden Container der alten Installation und hängten sie an leere `/opt/paperless`-Verzeichnisse um, was wie Datenverlust aussah (echte Daten blieben unangetastet im alten Verzeichnis liegen). Gleichzeitig lief der Backup-Cronjob monatelang gegen den falschen Container und exportierte in das falsche `export/`-Verzeichnis — Archiv-Erstellung meldete trotzdem "erfolgreich", enthielt aber nur leere Verzeichnisse. Fix: `docker-compose.yml.j2` setzt jetzt explizit `name: paperless-ngx-nas`, damit der Projektname nie mehr vom Verzeichnisnamen abhängt. Bei Verdacht auf denselben Bug: `docker inspect <container> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{end}}'` prüfen, ob die Bind-Mounts zum erwarteten Verzeichnis passen.
- **Paperless — Postgres-Major-Version darf nie floaten**: `pg_upgrade` ist nicht automatisch möglich; ein Image-Bump über Major-Grenzen (z.B. 16→18) lässt den `db`-Container mit "database files are incompatible" crashen. Renovate ist für `postgres` auf Minor/Patch beschränkt (`renovate.json`), Major-Upgrades erfordern manuellen `pg_upgrade`.
- **Paperless — Major-Versionssprung bei paperless-ngx**: Ein Sprung auf v3 direkt aus einer Version vor 2.20.15 schlägt mit `paperless.E002` fehl (`last applied documents migration` stimmt nicht). Erst exakt auf `2.20.15` migrieren, dann erst auf v3.x.

## Home Assistant / HA-MCP

- **Home Assistant — Erweiterungen via Init-Container (HACS-frei)**: Frontend-Karten einmalig manuell als Lovelace-Ressource registrieren (*Einstellungen → Dashboards → Ressourcen*). Details: `docs/17-homeassistant.md`.
- **Nuki MQTT — Broker braucht MetalLB-LAN-IP**: Nuki spricht `192.168.178.4:1883` direkt an. Firmware ≥ 4.0.28. SealedSecret `mosquitto-auth` — solange leer: Pod bleibt `ContainerCreating`. Details: `docs/18-nuki-mqtt.md`.
- **HA-MCP — Cross-Namespace-NetworkPolicy**: HA-NetworkPolicy muss Ingress aus Namespace `ha-mcp` erlauben — fehlt → Timeout statt Fehlermeldung. Details: `docs/22-ha-mcp.md`.
