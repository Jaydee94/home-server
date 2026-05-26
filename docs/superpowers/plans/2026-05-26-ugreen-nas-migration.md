# UGREEN NAS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle NAS-Rollen aus `ugreen-paperless` ins `home-server`-Repo migrieren, sodass UGREEN NAS + Home-Server aus einem einzigen Repo betrieben werden.

**Architecture:** Separates Playbook `ansible/ugreen-nas.yml` für den NAS; gemeinsames Inventory `ansible/inventory/hosts.yml`; NAS-Variablen isoliert in `ansible/host_vars/ugreen-nas/`. Rollen werden 1:1 aus `/home/jaydee/git/ugreen-paperless/roles/` kopiert; Umbenennung von `node-exporter` → `node_exporter_nas` und `day-pilot` → `day_pilot`. Node-Exporter-Metriken des NAS werden per `VMStaticScrape` CRD in den bestehenden k8s-Monitoring-Stack integriert.

**Tech Stack:** Ansible 2.14+, Docker Compose v2, VictoriaMetrics Operator (VMStaticScrape CRD), Ansible Vault

---

## Datei-Übersicht

| Aktion | Pfad |
|--------|------|
| Modify | `ansible/inventory/hosts.yml` |
| Create | `ansible/host_vars/ugreen-nas/vars.yml` |
| Create | `ansible/host_vars/ugreen-nas/vault.yml` |
| Copy   | `ansible/roles/paperless/` (von ugreen-paperless) |
| Copy+Rename | `ansible/roles/node_exporter_nas/` (von ugreen-paperless/roles/node-exporter) |
| Copy   | `ansible/roles/opencode/` |
| Copy   | `ansible/roles/tinyteller/` |
| Copy+Rename | `ansible/roles/day_pilot/` (von ugreen-paperless/roles/day-pilot) |
| Create | `ansible/ugreen-nas.yml` |
| Modify | `Makefile` |
| Create | `argocd/apps/monitoring/ugreen-nas-scrape.yaml` |
| Modify | `ansible/group_vars/all.yml` |
| Modify | `CLAUDE.md` |

---

## Task 1: Inventory und host_vars anlegen

**Files:**
- Modify: `ansible/inventory/hosts.yml`
- Create: `ansible/host_vars/ugreen-nas/vars.yml`
- Create: `ansible/host_vars/ugreen-nas/vault.yml`

- [ ] **Schritt 1: Lint-Baseline erfassen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/ argocd/ 2>&1 | head -20
ansible-lint ansible/ 2>&1 | tail -5
```

Erwartung: Kein Fehler (Baseline für Vergleich).

- [ ] **Schritt 2: ugreen-nas zum Inventory hinzufügen**

Datei: `ansible/inventory/hosts.yml`

Ersetze den Block ab `all:` so:

```yaml
# ============================================================
# Inventory
# ============================================================
#
# `homeservers` runs the full k3s/ArgoCD/Semaphore stack.
# Targets under `semaphore_targets` get the Semaphore SSH public key
# pushed into authorized_keys so the UI can run playbooks against them.
# `homeservers` is also a member of `semaphore_targets` so Semaphore
# can deploy this very repo against the home-server itself (recursive
# "Deploy Home Server" template).
#
# `ugreen_nas` hosts the Paperless-NGX stack via Docker Compose.
# ============================================================

all:
  children:
    homeservers:
      hosts:
        homeserver:
          ansible_host: 192.168.178.127
          ansible_user: jaydee
    ugreen_nas:
      hosts:
        ugreen-nas:
          ansible_host: jays-ugreen
          ansible_user: jaydee
    semaphore_targets:
      hosts:
        homeserver:
        ugreen-nas:
```

- [ ] **Schritt 3: host_vars Verzeichnis und vars.yml anlegen**

Erstelle `ansible/host_vars/ugreen-nas/vars.yml`:

```yaml
---
# ---- Paperless-NGX ------------------------------------------
paperless_base_dir: /opt/paperless
paperless_http_port: 8000
paperless_ai_enabled: false

paperless_admin_user: admin
paperless_admin_email: admin@example.com
paperless_admin_password: "{{ vault_paperless_admin_password }}"

paperless_db_password: "{{ vault_paperless_db_password }}"
paperless_secret_key: "{{ vault_paperless_secret_key }}"

# ---- Node Exporter / cAdvisor -------------------------------
node_exporter_base_dir: /opt/node-exporter
cadvisor_port: 18080

# ---- OpenCode -----------------------------------------------
opencode_install_dir: /opt/opencode
opencode_persist_dir: /opt/opencode/persist
opencode_port: 4096
opencode_build_local_image: false
opencode_git_repo: ""
opencode_git_username: "{{ vault_opencode_git_username | default('') }}"
opencode_git_password: "{{ vault_opencode_git_password | default('') }}"
opencode_github_token: "{{ vault_opencode_github_token | default('') }}"
opencode_server_auth_enabled: false

# ---- TinyTeller ---------------------------------------------
tinyteller_base_dir: /opt/tinyteller
tinyteller_frontend_port: 3002
tinyteller_backend_port: 3004
tinyteller_cors_origin: "http://ugreen-nas:3002"

# ---- Day Pilot ----------------------------------------------
day_pilot_base_dir: /opt/day-pilot
day_pilot_frontend_port: 3003
day_pilot_backend_port: 8001
day_pilot_timezone: "Europe/Berlin"
day_pilot_openai_api_key: "{{ vault_day_pilot_openai_api_key | default('') }}"
day_pilot_github_token: "{{ vault_day_pilot_github_token | default('') }}"
```

- [ ] **Schritt 4: vault.yml Platzhalter-Datei anlegen**

Erstelle `ansible/host_vars/ugreen-nas/vault.yml`:

```yaml
---
# Diese Datei MUSS mit ansible-vault encrypt_string verschlüsselt werden.
# Workflow:
#   ansible-vault encrypt_string 'WERT' --name 'vault_VARIABLENNAME'
#   => !vault |-Block in diese Datei einfügen
#
# Pflicht-Secrets (ohne diese startet das Playbook nicht sinnvoll):
vault_paperless_db_password: "CHANGE_ME"
vault_paperless_admin_password: "CHANGE_ME"
vault_paperless_secret_key: "CHANGE_ME"
#
# Optional — nur setzen wenn die Services genutzt werden:
# vault_opencode_git_username: ""
# vault_opencode_git_password: ""
# vault_opencode_github_token: ""
# vault_day_pilot_openai_api_key: ""
# vault_day_pilot_github_token: ""
```

- [ ] **Schritt 5: Lint prüfen**

```bash
yamllint -c .yamllint ansible/inventory/hosts.yml ansible/host_vars/
```

Erwartung: Keine Fehler.

- [ ] **Schritt 6: Committen**

```bash
git add ansible/inventory/hosts.yml ansible/host_vars/
git commit -m "feat(nas): add ugreen-nas to inventory and host_vars"
```

---

## Task 2: Rolle `paperless` migrieren

**Files:**
- Create: `ansible/roles/paperless/` (komplett von ugreen-paperless)

- [ ] **Schritt 1: Rolle kopieren**

```bash
cp -r /home/jaydee/git/ugreen-paperless/roles/paperless \
      /home/jaydee/git/home-server/ansible/roles/paperless
```

- [ ] **Schritt 2: Lint prüfen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/roles/paperless/
ansible-lint ansible/roles/paperless/ 2>&1 | grep -E 'error|warning' | head -20
```

Erwartung: Keine Fehler (die Rolle kommt aus einem bereits gepflegten Repo).

- [ ] **Schritt 3: Committen**

```bash
git add ansible/roles/paperless/
git commit -m "feat(nas): migrate paperless role from ugreen-paperless"
```

---

## Task 3: Rolle `node_exporter_nas` migrieren

**Files:**
- Create: `ansible/roles/node_exporter_nas/` (von ugreen-paperless/roles/node-exporter, umbenannt)

Die Rolle behält ihren internen Inhalt unverändert, nur der Verzeichnisname ändert sich um Konflikte mit zukünftigen cluster-seitigen node-exporter-Rollen zu vermeiden.

- [ ] **Schritt 1: Rolle kopieren und umbenennen**

```bash
cp -r /home/jaydee/git/ugreen-paperless/roles/node-exporter \
      /home/jaydee/git/home-server/ansible/roles/node_exporter_nas
```

- [ ] **Schritt 2: Lint prüfen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/roles/node_exporter_nas/
ansible-lint ansible/roles/node_exporter_nas/ 2>&1 | grep -E 'error|warning' | head -20
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
git add ansible/roles/node_exporter_nas/
git commit -m "feat(nas): migrate node-exporter role as node_exporter_nas"
```

---

## Task 4: Rolle `opencode` migrieren

**Files:**
- Create: `ansible/roles/opencode/` (von ugreen-paperless)

- [ ] **Schritt 1: Rolle kopieren**

```bash
cp -r /home/jaydee/git/ugreen-paperless/roles/opencode \
      /home/jaydee/git/home-server/ansible/roles/opencode
```

- [ ] **Schritt 2: Lint prüfen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/roles/opencode/
ansible-lint ansible/roles/opencode/ 2>&1 | grep -E 'error|warning' | head -20
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
git add ansible/roles/opencode/
git commit -m "feat(nas): migrate opencode role from ugreen-paperless"
```

---

## Task 5: Rolle `tinyteller` migrieren

**Files:**
- Create: `ansible/roles/tinyteller/` (von ugreen-paperless)

- [ ] **Schritt 1: Rolle kopieren**

```bash
cp -r /home/jaydee/git/ugreen-paperless/roles/tinyteller \
      /home/jaydee/git/home-server/ansible/roles/tinyteller
```

- [ ] **Schritt 2: Lint prüfen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/roles/tinyteller/
ansible-lint ansible/roles/tinyteller/ 2>&1 | grep -E 'error|warning' | head -20
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
git add ansible/roles/tinyteller/
git commit -m "feat(nas): migrate tinyteller role from ugreen-paperless"
```

---

## Task 6: Rolle `day_pilot` migrieren

**Files:**
- Create: `ansible/roles/day_pilot/` (von ugreen-paperless/roles/day-pilot, umbenannt)

Der Bindestrich im Rollennamen ist in Ansible zulässig, aber Unterstriche sind Konvention für dieses Repo (vgl. `semaphore_bootstrap`, `semaphore_secrets`).

- [ ] **Schritt 1: Rolle kopieren und umbenennen**

```bash
cp -r /home/jaydee/git/ugreen-paperless/roles/day-pilot \
      /home/jaydee/git/home-server/ansible/roles/day_pilot
```

- [ ] **Schritt 2: Lint prüfen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/roles/day_pilot/
ansible-lint ansible/roles/day_pilot/ 2>&1 | grep -E 'error|warning' | head -20
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
git add ansible/roles/day_pilot/
git commit -m "feat(nas): migrate day-pilot role as day_pilot"
```

---

## Task 7: Playbook `ansible/ugreen-nas.yml` anlegen

**Files:**
- Create: `ansible/ugreen-nas.yml`

- [ ] **Schritt 1: Playbook erstellen**

Erstelle `ansible/ugreen-nas.yml`:

```yaml
---
# ============================================================
# NAS Playbook — deployt Docker-Compose-basierte Dienste auf
# dem UGREEN NAS (jays-ugreen / 192.168.178.118).
#
# Run with:
#   make nas
# Dry-run:
#   make nas-check
# ============================================================

- name: Deploy NAS services
  hosts: ugreen_nas
  become: true
  roles:
    - role: paperless
      tags: [paperless]
    - role: node_exporter_nas
      tags: [node-exporter]
    - role: opencode
      tags: [opencode]
    - role: tinyteller
      tags: [tinyteller]
    - role: day_pilot
      tags: [day-pilot]
```

- [ ] **Schritt 2: Syntax-Check**

```bash
cd /home/jaydee/git/home-server
ansible-playbook -i ansible/inventory/hosts.yml ansible/ugreen-nas.yml \
  --syntax-check 2>&1
```

Erwartung: `playbook: ansible/ugreen-nas.yml` — keine Fehler.

- [ ] **Schritt 3: Lint**

```bash
yamllint -c .yamllint ansible/ugreen-nas.yml
ansible-lint ansible/ugreen-nas.yml 2>&1 | grep -E 'error|warning' | head -20
```

Erwartung: Keine Fehler.

- [ ] **Schritt 4: Committen**

```bash
git add ansible/ugreen-nas.yml
git commit -m "feat(nas): add ugreen-nas.yml playbook"
```

---

## Task 8: Makefile erweitern

**Files:**
- Modify: `Makefile`

- [ ] **Schritt 1: NAS-Variablen und Targets hinzufügen**

Füge folgende Zeilen in das `Makefile` ein — direkt nach der Zeile `VAULT_OPTS  ?= --ask-vault-pass`:

```makefile
NAS_PLAYBOOK := $(ANSIBLE_DIR)/ugreen-nas.yml
```

Füge nach dem `semaphore-bootstrap-local`-Target folgende Targets ein:

```makefile
.PHONY: nas nas-check
nas: ## Deploy all services on the UGREEN NAS.
	ansible-playbook -i $(INVENTORY) $(NAS_PLAYBOOK) $(VAULT_OPTS)

nas-check: ## Dry-run the NAS playbook (no changes applied).
	ansible-playbook -i $(INVENTORY) $(NAS_PLAYBOOK) --check --diff $(VAULT_OPTS)
```

- [ ] **Schritt 2: Hilfetarget prüfen**

```bash
make help
```

Erwartung: `nas` und `nas-check` erscheinen in der Ausgabe.

- [ ] **Schritt 3: Committen**

```bash
git add Makefile
git commit -m "feat(nas): add make nas and nas-check targets"
```

---

## Task 9: NAS-Monitoring in k8s-Stack integrieren

**Files:**
- Create: `argocd/apps/monitoring/ugreen-nas-scrape.yaml`

VMAgent (via victoria-metrics-k8s-stack) hat `selectAllByDefault: true` und picked `VMStaticScrape`-CRDs aus allen Namespaces automatisch auf.

- [ ] **Schritt 1: VMStaticScrape-Manifest erstellen**

Erstelle `argocd/apps/monitoring/ugreen-nas-scrape.yaml`:

```yaml
---
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMStaticScrape
metadata:
  name: ugreen-nas-node-exporter
  namespace: monitoring
spec:
  jobName: ugreen-nas-node-exporter
  targetEndpoints:
    - targets:
        - "jays-ugreen:9100"
      labels:
        job: node-exporter
        instance: ugreen-nas
---
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMStaticScrape
metadata:
  name: ugreen-nas-cadvisor
  namespace: monitoring
spec:
  jobName: ugreen-nas-cadvisor
  targetEndpoints:
    - targets:
        - "jays-ugreen:18080"
      labels:
        job: cadvisor
        instance: ugreen-nas
```

- [ ] **Schritt 2: YAML-Lint**

```bash
yamllint -c .yamllint argocd/apps/monitoring/ugreen-nas-scrape.yaml
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
git add argocd/apps/monitoring/ugreen-nas-scrape.yaml
git commit -m "feat(monitoring): add VMStaticScrape for ugreen-nas node-exporter and cadvisor"
```

---

## Task 10: Semaphore-Konfiguration anpassen

**Files:**
- Modify: `ansible/group_vars/all.yml`

Das bestehende `ugreen-paperless`-Projekt in `semaphore_projects` zeigt auf das alte Repo. Es wird auf das `home-server`-Repo umgestellt und das Template auf `ansible/ugreen-nas.yml` geändert.

- [ ] **Schritt 1: semaphore_projects in group_vars/all.yml anpassen**

Ersetze den Block des `ugreen-paperless`-Projekts in `ansible/group_vars/all.yml`:

Alter Block:
```yaml
  - name: ugreen-paperless
    description: "Deploy Paperless-ngx on the UGREEN NAS."
    repository:
      name: ugreen-paperless-git
      url: "https://github.com/Jaydee94/ugreen-paperless.git"
      branch: main
    inventories:
      - name: ugreen-nas
        type: static
        ssh_key: semaphore-ssh-key
        content: |
          [ugreen-nas]
          ugreen ansible_host=192.168.178.118
    templates:
      - name: "Deploy ugreen-paperless"
        playbook: ugreen-paperless.yml
        inventory: ugreen-nas
        vault_key: vault-password
        description: "Provision Paperless-ngx stack on the UGREEN NAS."
```

Neuer Block:
```yaml
  - name: ugreen-nas
    description: "Deploy Docker-Compose-Dienste auf dem UGREEN NAS."
    repository:
      name: home-server-git
      url: "{{ argocd_repo_url }}"
      branch: main
    inventories:
      - name: ugreen-nas
        type: static
        ssh_key: semaphore-ssh-key
        content: |
          [ugreen_nas]
          ugreen-nas ansible_host=192.168.178.118
    templates:
      - name: "Deploy UGREEN NAS"
        playbook: ansible/ugreen-nas.yml
        inventory: ugreen-nas
        vault_key: vault-password
        description: "Paperless-NGX, OpenCode, TinyTeller, Day Pilot auf dem NAS."
```

- [ ] **Schritt 2: Lint**

```bash
yamllint -c .yamllint ansible/group_vars/all.yml
```

Erwartung: Keine Fehler.

- [ ] **Schritt 3: Committen**

```bash
git add ansible/group_vars/all.yml
git commit -m "feat(semaphore): update ugreen-paperless project to use home-server repo"
```

---

## Task 11: CLAUDE.md aktualisieren

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Schritt 1: Neue Architektur in CLAUDE.md ergänzen**

Im Abschnitt `## Architecture` in der root `CLAUDE.md` den Kommentar zu ugreen-paperless-Repo im Semaphore-Abschnitt (`semaphore_projects`) aktualisieren: `ugreen-paperless (https://github.com/Jaydee94/ugreen-paperless.git)` → `ugreen-nas (dieses Repo, NAS-Playbook)`.

Außerdem im Abschnitt `## Commands` folgende Zeilen hinzufügen:

```
make nas             # Deploy alle Services auf dem UGREEN NAS
make nas-check       # Dry-run des NAS-Playbooks
```

Und im Abschnitt `## Service URLs` den NAS ergänzen:

```
| Paperless-NGX | http://jays-ugreen:8000  | NAS (Docker Compose)           |
| OpenCode      | http://jays-ugreen:4096  | NAS (Docker Compose)           |
| TinyTeller    | http://jays-ugreen:3002  | NAS (Docker Compose)           |
| Day Pilot     | http://jays-ugreen:3003  | NAS (Docker Compose)           |
```

- [ ] **Schritt 2: Committen**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with ugreen-nas architecture and commands"
```

---

## Task 12: Gesamtvalidierung

- [ ] **Schritt 1: Vollständigen Lint laufen lassen**

```bash
cd /home/jaydee/git/home-server
yamllint -c .yamllint ansible/ argocd/
ansible-lint ansible/
```

Erwartung: Keine Fehler.

- [ ] **Schritt 2: Syntax-Check beider Playbooks**

```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --syntax-check
ansible-playbook -i ansible/inventory/hosts.yml ansible/ugreen-nas.yml --syntax-check
```

Erwartung: Beide zeigen `playbook: ...` ohne Fehler.

- [ ] **Schritt 3: Rollen-Liste prüfen**

```bash
ls ansible/roles/
```

Erwartung: `paperless  node_exporter_nas  opencode  tinyteller  day_pilot` sind vorhanden (neben den bestehenden Rollen).

- [ ] **Schritt 4: Branch pushen**

```bash
git push -u origin feat/ugreen-nas-migration
```
