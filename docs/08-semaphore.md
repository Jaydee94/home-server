# Semaphore UI — One-Click Ansible für deine Heimnetz-Targets

Semaphore ist eine schlanke Web UI, die deine Ansible-Repos ausschert,
gegen ein gewähltes Inventory laufen lässt und dir das Live-Log im Browser
zeigt. In diesem Setup läuft Semaphore als Pod im k3s-Cluster auf dem
Home Server und wird über ArgoCD gepflegt — du fasst nach dem Erst-Setup
nie wieder eine YAML-Datei an, um eine neue Aktion auszulösen.

## Was du am Ende hast

- **`http://semaphore.homeserver`** im LAN und im Tailnet — dnsmasq
  hört auf der LAN-IP **und** auf `tailscale0`, also kommt jeder
  Tailscale-Client an die `*.homeserver`-Namen ran.
  ([Wichtiger Hintergrund zur DNS-Topologie und warum der Home-Server
  *nicht* der LAN-DNS-Server sein sollte → docs/09-dns-architecture.md](09-dns-architecture.md))
- Ein-Klick-Run von Playbooks aus beliebigen Git-Repos
  (z.B. `home-server`, `ugreen-paperless`, später beliebig viele mehr).
- Geteilter SSH-Key, der von Ansible verwaltet und automatisch auf alle
  konfigurierten Targets (Raspberry Pi, UGREEN NAS, …) verteilt wird.
- Geteiltes Ansible-Vault-Password, sicher in einem k8s Secret abgelegt.

### Zugriff über Tailscale (einmaliger Admin-Schritt)

dnsmasq lauscht serverseitig schon auf `tailscale0` — fehlt nur noch,
dass deine Tailscale-Clients den Home-Server als Nameserver für die
`homeserver`-Domain nutzen.

1. **Tailscale-IP** des Home-Servers ablesen (nicht die LAN-IP — die
   Tailscale-IP ist aus dem Tailnet überall direkt erreichbar, ohne
   dass Subnet-Routes auf jedem Client aktiviert werden müssen):
   ```bash
   ssh jaydee@homeserver "tailscale ip -4"
   # z.B. 100.78.12.34
   ```
2. [Tailscale Admin Console → DNS](https://login.tailscale.com/admin/dns)
   öffnen → Abschnitt **Nameservers**:
   - **Add nameserver → Custom...**
   - **Nameserver IP**: Wert aus Schritt 1
   - **Restrict to search domains** anklicken (oder "Split DNS"
     toggle, je nach UI-Version) → Domain: `homeserver`
   - **Save**
3. Fertig. Du brauchst keinen Global Nameserver und auch nicht
   "Override DNS servers" — Split DNS reicht aus. Alle Queries auf
   `*.homeserver` gehen jetzt vom Tailscale-Client direkt an dnsmasq
   auf dem Home-Server, alle anderen Queries bleiben beim normalen
   System-Resolver des Clients.

Test (vom Tailscale-Client):
```bash
nslookup semaphore.homeserver
# Expected: 192.168.178.127  (von dnsmasq aufgelöst)
```

Falls die Auflösung nicht klappt: prüfe auf dem Server
`sudo ss -lntu | grep :53` — dnsmasq sollte sowohl auf
`192.168.178.127:53` als auch auf `100.x.y.z:53` (tailscale0) lauschen.

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
| `ansible_vault_password`  | Dein Master-Vault-Password (optional)       |
| `ssh_private_key`         | Ed25519-Key — Semaphore SSH-t damit raus    |
| `ssh_public_key`          | Gegenstück, wird auf die Targets verteilt   |

## Erst-Setup (einmalig, ~5 Min)

### 1. (Optional) Vault-Password vorbereiten

Wenn du in irgendeinem Repo `ansible-vault encrypt_string` benutzt, muss
Semaphore das Vault-Password kennen. Verschlüssele es **mit sich selbst**:

```bash
ansible-vault encrypt_string 'DEIN_VAULT_PW' \
  --name 'semaphore_ansible_vault_password' --ask-vault-pass
```

Den `!vault |…`-Block über den leeren Wert in
`ansible/group_vars/all.yml` (`semaphore_ansible_vault_password`) pasten.

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

## Erstes Project anlegen (Workflow am Beispiel `ugreen-paperless`)

1. Browser auf `http://semaphore.homeserver` → Login mit `admin` +
   ausgelesenem Passwort.
2. **Passwort sofort ändern** (oben rechts → Settings → Change Password).
3. **Create New Project** → Name z.B. `ugreen-paperless`.

Innerhalb des Projects in dieser Reihenfolge anlegen:

### a) Key Store

- **`semaphore-ssh-key`** (Type: *SSH Key*)
  Auf dem Home-Server: `sudo cat /etc/semaphore-secrets/id_ed25519`.
  Inhalt in die UI pasten. *Dieser Schritt ist die einzige manuelle
  Kopie — danach lebt der Key in Semaphores eigener Encrypted-DB.*
- **`git-https-noauth`** (Type: *None*) — für öffentliche Repos.
  Für ein privates Repo stattdessen *Login With Password* + GitHub PAT.

### b) Repository

- URL: `https://github.com/Jaydee94/ugreen-paperless.git`
- Branch: `main` (oder was du nutzt)
- Access Key: `git-https-noauth`

### c) Inventory

- Type: **Static**
- Inhalt:
  ```ini
  [ugreen]
  ugreen ansible_host=192.168.178.40 ansible_user=jaydee
  ```
- SSH Key: `semaphore-ssh-key`

### d) Environment (optional)

Wenn dein Playbook extra Variablen oder ENV-Werte braucht, hier hinterlegen.
Sonst leer lassen.

### e) Task Template

- Name: `Deploy Paperless`
- Playbook Filename: `site.yml` (oder wie er bei dir heißt)
- Inventory: das eben angelegte
- Repository: das eben angelegte
- Environment: leer oder das eben angelegte
- *Run on*: `manual` (oder ein Cron-Schedule)

**Save → ▶ Run.** Live-Log erscheint sofort.

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
| `semaphore.homeserver` löst nicht | `semaphore` in `dnsmasq_hosts` (group_vars/all.yml), `make tailscale`, dann `--tags dnsmasq` |
| Pod CrashLoopBackOff              | `kubectl -n semaphore logs deploy/semaphore` — meist fehlt das Bootstrap-Secret |
| Playbook scheitert mit "Permission denied (publickey)" | `make semaphore-targets` lief nicht — Public Key fehlt in authorized_keys auf dem Ziel |
| Vault-Passwort wird nicht erkannt | `semaphore_ansible_vault_password` ist leer oder mit falschem PW verschlüsselt |
