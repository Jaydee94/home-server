# Semaphore UI — One-Click Ansible für deine Heimnetz-Targets

Semaphore ist eine schlanke Web UI, die deine Ansible-Repos ausschert,
gegen ein gewähltes Inventory laufen lässt und dir das Live-Log im Browser
zeigt. In diesem Setup läuft Semaphore als Pod im k3s-Cluster auf dem
Home Server und wird über ArgoCD gepflegt — du fasst nach dem Erst-Setup
nie wieder eine YAML-Datei an, um eine neue Aktion auszulösen.

## Was du am Ende hast

- **`http://semaphore.homeserver`** im LAN und im Tailnet — Pi-hole
  löst `*.homeserver` autoritativ auf (`address=/homeserver/192.168.178.127`).
  ([DNS-Architektur und Tailscale Split DNS → docs/09-dns-architecture.md](09-dns-architecture.md))
- Ein-Klick-Run von Playbooks aus beliebigen Git-Repos
  (z.B. `home-server`, `ugreen-nas`, später beliebig viele mehr).
- Geteilter SSH-Key, der von Ansible verwaltet und automatisch auf alle
  konfigurierten Targets (Raspberry Pi, UGREEN NAS, …) verteilt wird.
- Geteiltes Ansible-Vault-Password, sicher in einem k8s Secret abgelegt.

### Zugriff über Tailscale (einmaliger Admin-Schritt)

Pi-hole auf `192.168.178.2` ist der einzige DNS-Server im Heimnetz und löst
`*.homeserver` autoritativ auf. Tailscale-Clients erreichen ihn über den
Subnet-Router (die Route `192.168.178.0/24` wird vom Home-Server advertised).

1. [Tailscale Admin Console → DNS](https://login.tailscale.com/admin/dns)
   öffnen → Abschnitt **Nameservers**:
   - **Add nameserver → Custom...**
   - **Nameserver IP**: `192.168.178.2`
   - **Restrict to search domains** anklicken → Domain: `homeserver`
   - **Save**
2. Sicherstellen dass die Subnet-Route in der
   [Tailscale-Konsole → Machines](https://login.tailscale.com/admin/machines)
   **approved** ist und `--accept-routes` auf dem Client aktiv ist.

Test (vom Tailscale-Client):
```bash
nslookup semaphore.homeserver
# Expected: 192.168.178.127  (von Pi-hole aufgelöst)
```

Vollständige Tailscale-DNS-Dokumentation inkl. SPOF-Abwägung: [docs/15-pihole.md §4](15-pihole.md).

## Architektur in zehn Sekunden

```
Browser  ──▶  Traefik (k3s ingress)  ──▶  semaphore Pod
                                              │
                                              ├─▶ Git clone (jedes Run)
                                              └─▶ SSH ──▶ Raspi, NAS, …
```

Der `semaphore-bootstrap` Secret im Namespace `semaphore` hält:

| Key                       | Inhalt                                      |
|---------------------------|---------------------------------------------|
| `admin_username`          | `admin` (Default)                           |
| `admin_password`          | Auto-generiert, liegt unter `/etc/semaphore-secrets/admin_password` |
| `access_key_encryption`   | 32-byte base64, verschlüsselt Semaphores DB-Secrets |
| `ansible_vault_password`  | Dein Master-Vault-Password (erforderlich)   |
| `ssh_private_key`         | Ed25519-Key — Semaphore SSH-t damit raus    |
| `ssh_public_key`          | Gegenstück, wird auf die Targets verteilt   |

## Erst-Setup (einmalig, ~5 Min)

### 1. Vault-Password vorbereiten

Wenn du in irgendeinem Repo `ansible-vault encrypt_string` benutzt, muss
Semaphore das Vault-Password kennen. Verschlüssele es **mit sich selbst**:

```bash
ansible-vault encrypt_string 'DEIN_VAULT_PW' \
  --name 'semaphore_vault_password' --ask-vault-pass
```

Den `!vault |…`-Block über den leeren Wert in
`ansible/group_vars/all.yml` (`semaphore_vault_password`) pasten.

### 2. Targets in der Inventory eintragen

`ansible/inventory/hosts.yml`:

```yaml
raspberry_pis:
  hosts:
    pi-livingroom:
      ansible_host: 192.168.178.50
      ansible_user: pi
      ansible_ssh_private_key_file: ~/.ssh/id_ed25519

ugreen_nas:
  hosts:
    ugreen:
      ansible_host: 192.168.178.40
      ansible_user: jaydee
```

### 3. Playbook laufen lassen

```bash
make install        # Vollständig (inkl. Semaphore + Targets-Verteilung)
# oder gezielt:
make semaphore             # nur Secret auf dem Home-Server bauen
make semaphore-targets     # nur SSH-Key auf die Targets pushen
```

Ausgabe am Ende:

```
==================================================
Semaphore UI bootstrap material ready
==================================================
URL:        http://semaphore.homeserver
Username:   admin
Password:   stored in /etc/semaphore-secrets/admin_password
SSH pubkey: /etc/semaphore-secrets/id_ed25519.pub
==================================================
```

Admin-Passwort einmalig auslesen:

```bash
ssh jaydee@homeserver "sudo cat /etc/semaphore-secrets/admin_password"
```

### 4. ArgoCD wartet & deployt

Nach max. 3 Minuten erscheint in ArgoCD eine neue Application `semaphore`,
ein Pod startet, Traefik routet `semaphore.homeserver` darauf.

```bash
kubectl -n semaphore get pods,svc,ingress
```

## Projekte werden automatisch angelegt

Nach `make install` (genauer: nach der Rolle `semaphore_bootstrap`) sind in
Semaphore **zwei Projekte schon vollständig konfiguriert** — Key Store,
Repository, Inventory und Task Template inklusive. Du musst in der UI
nichts mehr klicken außer ▶ **Run**.

| Project              | Repository                                                | Inventory   | Template                  | Playbook                  | Schedule       |
|----------------------|-----------------------------------------------------------|-------------|---------------------------|---------------------------|----------------|
| `home-server`        | dieses Repo (`argocd_repo_url` aus `group_vars/all.yml`)  | `homeservers` (192.168.178.127) | `Deploy Home Server`      | `ansible/site.yml`        | täglich 06:00  |
| `ugreen-nas`         | dieses Repo (`argocd_repo_url` aus `group_vars/all.yml`)  | `ugreen_nas` (192.168.178.118)  | `Deploy UGREEN NAS`       | `ansible/ugreen-nas.yml`  | —              |

### Workflow

1. Browser auf `http://semaphore.homeserver`.
2. Login mit `admin` + Passwort aus `/etc/semaphore-secrets/admin_password`:
   ```bash
   ssh jaydee@homeserver "sudo cat /etc/semaphore-secrets/admin_password"
   ```
3. **Passwort sofort ändern** (oben rechts → Settings → Change Password).
   ⚠️ Wenn du das tust, kann das nächste `make semaphore-bootstrap` sich
   nicht mehr einloggen, bis du das neue Passwort wieder in
   `/etc/semaphore-secrets/admin_password` ablegst.
4. Projekt auswählen → Template → ▶ **Run**. Live-Log erscheint sofort.

### Weitere Projekte hinzufügen

`semaphore_projects` in `ansible/group_vars/all.yml` (oder direkt in der
Default-Liste in `ansible/roles/semaphore_bootstrap/defaults/main.yml`)
erweitern und `make semaphore-bootstrap` laufen lassen:

```yaml
semaphore_projects:
  - name: home-server          # existierende Defaults beibehalten
    # ...
  - name: ugreen-nas
    # ...
  - name: my-new-project       # neu
    repository:
      name: my-new-project-git
      url: https://github.com/me/my-repo.git
      branch: main
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
    schedules:                        # optional — weglassen für kein Cron
      - name: "Daily 06:00"
        template: "Deploy My Thing"
        cron: "0 6 * * *"
        active: true
```

Schedules werden in der Zeitzone `Europe/Berlin` ausgewertet (via `SEMAPHORE_SCHEDULE_TIMEZONE` im Semaphore-Deployment). Das Cron-Format ist Standard-5-Feld. Das Auto-Bootstrap ist idempotent: bei jedem `make semaphore-bootstrap` wird ein vorhandener Schedule per PUT aktualisiert (self-healing).

**Wichtig:** das Auto-Bootstrap ist vollständig **idempotent** — Ressourcen werden
bei jedem Run via PUT aktualisiert (self-healing). Ein manuelles Löschen in der UI
ist nicht nötig. Einzige Ausnahme: Umbenennen eines Projekts/Inventories/Templates
erzeugt einen Orphan-Eintrag, der beim nächsten Run automatisch gelöscht wird.

## Manuelles Anlegen (Fallback / ad-hoc)

> ⚠️ **Warnung:** Manuell in der UI angelegte Projekte werden beim nächsten
> `make semaphore-bootstrap` **kommentarlos gelöscht** — der Bootstrap entfernt
> alle Projekte, die nicht in `semaphore_projects` (`group_vars/all.yml`) definiert
> sind. Für persistente Projekte immer `semaphore_projects` erweitern.

Wenn du ein Einmal-Projekt willst, das nicht in Git stehen soll, kannst
du es per UI anlegen:

1. **Create New Project** → Name vergeben.
2. **Key Store**:
   - `semaphore-ssh-key` (Type *SSH Key*) — Inhalt aus
     `/etc/semaphore-secrets/id_ed25519` einfügen.
   - `git-none` (Type *None*) für öffentliche Repos.
3. **Repository** → URL, Branch, Access Key = `git-none`.
4. **Inventory** → Type *Static*, Inhalt im INI-Format, SSH Key = `semaphore-ssh-key`.
5. **Task Template** → Playbook-Pfad, Inventory + Repository auswählen.
6. **Save → ▶ Run.**

## Tipps

- **Mehrere Repos**: Pro Repo ein eigenes Semaphore-Project anlegen.
  Den selben SSH-Key (`semaphore-ssh-key`) kannst du in jedes Project
  importieren.
- **Neuer Target-Host**: in `ansible/inventory/hosts.yml` eintragen,
  `make semaphore-targets` laufen lassen. Der Public Key landet
  automatisch in dessen `authorized_keys`. In der Semaphore-Inventory
  ergänzen — fertig.
- **SSH-Key rotieren**: `sudo rm -rf /etc/semaphore-secrets/id_ed25519*`
  auf dem Home-Server, `make semaphore && make semaphore-targets` neu
  laufen lassen. Dann Key in Semaphore Key Store einmal neu pasten.
- **Backups**: Sichere `/etc/semaphore-secrets/` (Passwörter & Keys)
  und das PVC `semaphore-data` im Namespace `semaphore` (Projects,
  Inventories, History).

## Troubleshooting

| Symptom                           | Check                                                                  |
|-----------------------------------|------------------------------------------------------------------------|
| `semaphore.homeserver` löst nicht | Pi-hole läuft? `dig @192.168.178.2 semaphore.homeserver` — der Wildcard-Eintrag `address=/homeserver/192.168.178.127` in `argocd/apps/pihole/values.yaml` deckt alle `*.homeserver`-Namen ab. Tailscale: Split DNS auf `192.168.178.2` zeigen (siehe §Tailscale oben). |
| Pod CrashLoopBackOff              | `kubectl -n semaphore logs deploy/semaphore` — meist fehlt das Bootstrap-Secret |
| Playbook scheitert mit "Permission denied (publickey)" | `make semaphore-targets` lief nicht — Public Key fehlt in authorized_keys auf dem Ziel |
| Vault-Passwort wird nicht erkannt | `semaphore_vault_password` ist leer oder mit falschem PW verschlüsselt; sicherstellen dass `ANSIBLE_VAULT_PASSWORD_FILE` im Semaphore Default-Environment gesetzt ist (wird ab Bootstrap automatisch injiziert) |
| `semaphore-bootstrap` failt beim Login | Admin-PW in der UI geändert ohne `/etc/semaphore-secrets/admin_password` zu syncen, oder PVC enthält noch alte DB. Fix: PW dort hinterlegen oder PVC neu (löscht alle Projekte!). |
