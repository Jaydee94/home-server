# Design: Migration ugreen-paperless → home-server

**Datum:** 2026-05-26  
**Status:** Approved

## Ziel

Alle Geräte des Home-Labs (Home-Server, UGREEN NAS) werden ausschließlich aus
dem `home-server`-Repo gepflegt. Das `ugreen-paperless`-Repo wird nach
erfolgreicher Migration archiviert.

## Scope

**Migriert:**
- Rolle `paperless` (Paperless-NGX + Postgres + Redis + optionaler AI-Sidecar)
- Rolle `node_exporter_nas` (Node-Exporter + cAdvisor, umbenannt von `node-exporter`)
- Rolle `opencode`
- Rolle `tinyteller`
- Rolle `day_pilot` (umbenannt von `day-pilot`)

**Nicht migriert (fallen weg):**
- `gotify` — Instanz läuft bereits als k8s-App im Cluster (`argocd/apps/gotify`)
- `monitoring` — wird in bestehenden VictoriaMetrics/Grafana-Stack im Cluster integriert
- `paperless-ai` — kubepi existiert nicht mehr
- `scanner-pi` — kubepi existiert nicht mehr

## Verzeichnisstruktur

```
ansible/
├── inventory/
│   └── hosts.yml                   # GEÄNDERT: ugreen-nas hinzugefügt
├── host_vars/                      # NEU
│   └── ugreen-nas/
│       ├── vars.yml                # NAS-Variablen (ports, image-tags, paths)
│       └── vault.yml               # Ansible-Vault: Passwörter, API-Keys, Tokens
├── group_vars/
│   └── all.yml                     # UNVERÄNDERT (nur Home-Server-Vars)
├── roles/
│   ├── (bestehende Rollen)         # UNVERÄNDERT
│   ├── paperless/                  # NEU (migriert)
│   ├── node_exporter_nas/          # NEU (migriert + umbenannt)
│   ├── opencode/                   # NEU (migriert)
│   ├── tinyteller/                 # NEU (migriert)
│   └── day_pilot/                  # NEU (migriert + umbenannt)
├── site.yml                        # UNVERÄNDERT (Home-Server-Playbook)
└── ugreen-nas.yml                  # NEU: NAS-Playbook
```

## Inventory

`ansible/inventory/hosts.yml` bekommt `ugreen-nas` als zweiten Host:

```yaml
all:
  hosts:
    home-server:
      ansible_host: 192.168.178.127
      ansible_user: jaydee
    ugreen-nas:
      ansible_host: jays-ugreen
      ansible_user: jaydee
```

## Playbook `ansible/ugreen-nas.yml`

```yaml
- name: Deploy NAS services
  hosts: ugreen-nas
  become: true
  roles:
    - paperless
    - node_exporter_nas
    - opencode
    - tinyteller
    - day_pilot
```

## Variablen & Secrets

Alle NAS-spezifischen Variablen liegen in `ansible/host_vars/ugreen-nas/`:

- `vars.yml` — Klartext-Variablen (Ports, Image-Tags, Pfade, Feature-Flags)
- `vault.yml` — Ansible-Vault-verschlüsselt (Passwörter, API-Keys, Tokens)

Vault-Konvention (identisch zum bestehenden Repo):
```yaml
# vault.yml (encrypted)
vault_paperless_db_password: ...

# vars.yml
paperless_db_password: "{{ vault_paperless_db_password }}"
```

Gleiche Vault-Passphrase wie `group_vars/all.yml` — ein `--ask-vault-pass` reicht.

## Makefile

Neue Targets:
```makefile
nas         # ansible-playbook ansible/ugreen-nas.yml --ask-vault-pass
nas-check   # Dry-run (--check) des NAS-Playbooks
```

## Monitoring-Integration

Die `node_exporter_nas`-Rolle deployt Node-Exporter (Port 9100) und cAdvisor
(Port 18080) per Docker Compose auf dem NAS.

Im Cluster wird `argocd/apps/monitoring/` um einen `VMStaticScrape` erweitert,
der auf `jays-ugreen:9100` und `jays-ugreen:18080` zeigt. Kein separater
Grafana-/Prometheus-Stack auf dem NAS.

## Semaphore

`semaphore_projects` in `group_vars/all.yml` wird angepasst:
- Projekt `ugreen-paperless` bekommt neue `repo_url` (zeigt auf `home-server`-Repo)
- Neues Template `ugreen-nas` zeigt auf `ansible/ugreen-nas.yml`

## Altes Repo

Nach erstem erfolgreichem `make nas`-Run: `ugreen-paperless`-Repo auf GitHub
auf read-only (archived) setzen.
