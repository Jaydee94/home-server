# Semaphore

Semaphore ist eine Web-UI für Ansible. Sie klont ein Git-Repo, startet ein Playbook gegen ein Inventory und zeigt das Log live im Browser. Projekte, Inventories, Templates und Schedules legt Ansible per REST-API an, in der UI musst du nur noch auf „Run“ klicken.

| | |
|---|---|
| URL | http://semaphore.homeserver |
| Namespace | `semaphore` |
| Quelle | [`argocd/apps/semaphore/`](../argocd/apps/semaphore/) (eigenes Chart) |
| Image | `semaphoreui/semaphore` (Tag in [`values.yaml`](../argocd/apps/semaphore/values.yaml)) |
| Rollen | `ansible/roles/semaphore_secrets/`, `semaphore_targets/`, `semaphore_bootstrap/` |
| Konfiguration | `semaphore_projects` und `semaphore_vault_password` in [`ansible/group_vars/all.yml`](../ansible/group_vars/all.yml) |

## Architektur

```text
Browser ──▶ Traefik ──▶ semaphore Pod ──▶ git clone (pro Run)
                                     └──▶ SSH ──▶ homeserver, ugreen-nas
```

Drei Ansible-Rollen bereiten Semaphore vor. `make install` führt alle drei aus.

| Rolle | Make | Aufgabe |
|---|---|---|
| `semaphore_secrets` | `make semaphore` | Erzeugt Admin-Passwort, Encryption-Key und SSH-Keypair unter `/etc/semaphore-secrets/` und baut daraus das Secret `semaphore-bootstrap`. |
| `semaphore_targets` | `make semaphore-targets` | Trägt den Public Key in `authorized_keys` aller Hosts der Inventory-Gruppe `semaphore_targets` ein (`homeserver`, `ugreen-nas`). |
| `semaphore_bootstrap` | `make semaphore-bootstrap` | Legt per REST-API Projekte, Keys, Repositories, Inventories, Environments, Templates und Schedules an. `make semaphore-bootstrap-local` macht dasselbe direkt auf dem Server, ohne SSH. |

Das Secret `semaphore-bootstrap` enthält:

| Key | Inhalt |
|---|---|
| `admin_username` | `admin` |
| `admin_password` | automatisch erzeugt, liegt in `/etc/semaphore-secrets/admin_password` |
| `access_key_encryption` | 32 Byte base64, verschlüsselt die Secrets in Semaphores Datenbank |
| `ansible_vault_password` | Wert von `semaphore_vault_password` |
| `ssh_private_key` / `ssh_public_key` | Ed25519-Keypair, mit dem Semaphore auf die Targets geht |

## Projekte

Beide Projekte nutzen dieses Repo (`argocd_repo_url`, Branch `main`) und laufen per Schedule täglich um 06:00.

| Projekt | Inventory | Template | Playbook |
|---|---|---|---|
| `home-server` | `homeservers` (192.168.178.127) | `Deploy Home Server` | `ansible/site.yml` |
| `ugreen-nas` | `ugreen-nas` (192.168.178.118) | `Deploy UGREEN NAS` | `ansible/ugreen-nas.yml` |

`semaphore_projects` in `group_vars/all.yml` ist die einzige Quelle, der Rollen-Default ist leer. Ein neues Projekt trägst du dort ein und lässt dann `make semaphore-bootstrap` laufen:

```yaml
  - name: my-project
    repository:
      name: my-project-git
      url: https://github.com/me/my-repo.git
      branch: main
    environments:
      - "{{ semaphore_default_environment }}"
    inventories:
      - name: my-targets
        type: static
        ssh_key: semaphore-ssh-key
        content: |
          [targets]
          host1 ansible_host=192.168.178.99
    templates:
      - name: "Deploy My Thing"
        playbook: site.yml
        inventory: my-targets
        environment: default-env
        vault_key: vault-password
    schedules:                  # optional
      - name: "Daily 06:00"
        template: "Deploy My Thing"
        cron: "0 6 * * *"
        active: true
```

Ohne `environment: default-env` fehlt dem Playbook `ANSIBLE_VAULT_PASSWORD_FILE` und vault-verschlüsselte Variablen lassen sich nicht entschlüsseln. Cron-Ausdrücke wertet Semaphore in `Europe/Berlin` aus (`scheduleTimezone` in `values.yaml`).

> [!WARNING]
> Der Bootstrap löscht jedes Projekt, das nicht in `semaphore_projects` steht, auch von Hand in der UI angelegte. Mit leerer Liste bricht die Rolle ab, statt alles zu löschen.

Bei jedem Lauf aktualisiert der Bootstrap vorhandene Keys, Inventories, Environments, Templates und Schedules per `PUT`. Repositories legt er nur an. Gelöscht werden nur Projekte: ein umbenanntes Inventory oder Template bleibt unter dem alten Namen zusätzlich stehen.

## Erst-Setup

1. `semaphore_vault_password` in `group_vars/all.yml` setzen, verschlüsselt mit dem Vault-Passwort selbst. Ist der Wert leer, bricht `semaphore_bootstrap` ab.

   ```bash
   ansible-vault encrypt_string 'DEIN_VAULT_PW' --name 'semaphore_vault_password' --ask-vault-pass
   ```

2. `make install` ausführen. ArgoCD synct die App `semaphore`, der Bootstrap wartet bis zu fünf Minuten auf die API.
3. Admin-Passwort auslesen und in der UI anmelden:

   ```bash
   sudo cat /etc/semaphore-secrets/admin_password
   ```

Änderst du das Admin-Passwort in der UI, kann sich `make semaphore-bootstrap` erst wieder anmelden, wenn das neue Passwort in `/etc/semaphore-secrets/admin_password` steht.

Zugriff aus dem Tailnet auf `*.homeserver` ist in [Pi-hole](15-pihole.md#tailscale-geräte) beschrieben.

## Betrieb

```bash
sudo kubectl -n semaphore get pods,svc,ingress
sudo kubectl -n semaphore logs deploy/semaphore
```

Einen neuen Target-Host trägst du in `ansible/inventory/hosts.yml` unter `semaphore_targets` ein, dann `make semaphore-targets`. Danach das Inventory in `semaphore_projects` ergänzen und `make semaphore-bootstrap` ausführen.

Den SSH-Key rotierst du, indem du auf dem Server `sudo rm /etc/semaphore-secrets/id_ed25519*` ausführst und danach `make semaphore`, `make semaphore-targets` und `make semaphore-bootstrap` laufen lässt. Der Bootstrap überschreibt den Key im Key Store.

`/etc/semaphore-secrets/` und das PVC `semaphore-data` sind Teil des nächtlichen [Backups](26-backup.md).

## Fallstricke

| Symptom | Ursache und Lösung |
|---|---|
| `semaphore.homeserver` löst nicht auf | Pi-hole prüfen: `dig @192.168.178.2 semaphore.homeserver`. Siehe [Pi-hole](15-pihole.md). |
| Pod in `CrashLoopBackOff` | Meist fehlt das Secret `semaphore-bootstrap`: `make semaphore`. |
| `Permission denied (publickey)` | Public Key fehlt auf dem Ziel: `make semaphore-targets`. |
| Vault-Variablen werden nicht entschlüsselt | `semaphore_vault_password` falsch verschlüsselt oder Template ohne `environment: default-env`. |
| Bootstrap scheitert beim Login | Admin-Passwort in der UI geändert, ohne die Datei anzupassen, oder das PVC enthält eine alte Datenbank. Passwort in die Datei schreiben; ein neues PVC löscht alle Projekte. |

Weitere Punkte zum Bootstrap stehen in [gotchas.md](gotchas.md#semaphore--bootstrap).
