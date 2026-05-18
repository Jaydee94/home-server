# Semaphore UI — One-Click Ansible für deine Heimnetz-Targets

Semaphore ist eine schlanke Web UI, die deine Ansible-Repos ausschert,
gegen ein gewähltes Inventory laufen lässt und dir das Live-Log im Browser
zeigt. In diesem Setup läuft Semaphore als Pod im k3s-Cluster auf dem
Home Server und wird über ArgoCD gepflegt — du fasst nach dem Erst-Setup
nie wieder eine YAML-Datei an, um eine neue Aktion auszulösen.

## Was du am Ende hast

- **`http://semaphore.homeserver`** im LAN — funktioniert sofort, weil
  dnsmasq auf dem Home-Server `*.homeserver` Wildcards bedient.
- Ein-Klick-Run von Playbooks aus beliebigen Git-Repos
  (z.B. `home-server`, `ugreen-paperless`, später beliebig viele mehr).
- Geteilter SSH-Key, der von Ansible verwaltet und automatisch auf alle
  konfigurierten Targets (Raspberry Pi, UGREEN NAS, …) verteilt wird.
- Geteiltes Ansible-Vault-Password, sicher in einem k8s Secret abgelegt.

### Zugriff über Tailscale von unterwegs

Das aktuelle Setup bindet dnsmasq absichtlich nur an die LAN-IP, damit
es nicht mit systemd-resolved kollidiert. Damit auflöst
`semaphore.homeserver` aus dem Tailnet heraus *nicht* automatisch.
Drei pragmatische Wege:

1. **`/etc/hosts` Eintrag** auf dem Tailscale-Client:
   ```
   100.x.y.z   semaphore.homeserver argocd.homeserver headlamp.homeserver
   ```
   (`100.x.y.z` ist die Tailscale-IP deines Home-Servers, sichtbar mit
   `tailscale ip -4` auf dem Server). Easiest fix, kein Server-Change.

2. **Tailscale Subnet Routes + Split DNS** (sauberer): aktiviere für
   den Subnet-Route-Advertise-Flag im Tailscale-Admin den
   192.168.178.0/24-Range deines LANs, ergänze unter *DNS* einen
   Split-DNS-Eintrag `homeserver` → `192.168.178.127`. Damit fragt der
   Tailscale-Client für `*.homeserver` direkt deinen dnsmasq, der über
   die Subnet-Route erreichbar ist.

3. **Verzicht auf den Hostname**: greife per
   `http://<tailscale-ip>:30080` für ArgoCD / per Port-Forward für
   Semaphore zu — funktioniert ohne DNS-Anpassung, aber ohne Friendly
   Names.

Frag mich, falls du Variante 2 dauerhaft im Repo verankert haben willst —
das wäre eine kleine Erweiterung der `dnsmasq`-Role + UFW-Regel.

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
