# Voraussetzungen

Was vor dem ersten `make install` vorhanden sein muss: Hardware, Netz, Accounts, Workstation-Tools und das Vault-Passwort. Die OS-Installation selbst beschreibt [Ubuntu-Server-Installation](00-ubuntu-server-install.md).

## Hardware

| Komponente | Minimum | Referenz |
|---|---|---|
| CPU | x86-64, 2 Kerne, VT-x für KubeVirt | Intel Core i5 mit iGPU (Quick Sync für Jellyfin) |
| RAM | 4 GB | 32 GB |
| Disk | 20 GB | 512 GB NVMe-SSD |
| Netzwerk | Ethernet | 1 Gbit/s |

Der Gameserver läuft als KubeVirt-VM mit 4 vCPU und 8 GiB RAM und braucht `/dev/kvm`. Mit dem Minimum läuft der Grund-Stack, aber nicht alle Apps unter `argocd/apps/`.

## Netz und Router

- Der Server hat eine feste LAN-IP (Referenz `192.168.178.127`).
- Die MetalLB-Adressen `192.168.178.2` (Pi-hole DNS), `.3` (Jellyfin) und `.4` (Mosquitto) liegen außerhalb des DHCP-Bereichs der FritzBox. Details in [Pi-hole](15-pihole.md).
- Für Tailscale ist kein Port-Forwarding nötig. Ausgehendes UDP 41641 sollte offen sein, sonst läuft der Verkehr über DERP-Relays.
- Scanner, Backup und Media-Stack schreiben per SMB auf die UGREEN NAS (`192.168.178.118`).

## Accounts

| Account | Wofür |
|---|---|
| GitHub | ArgoCD zieht aus [`argocd_repo_url`](../ansible/group_vars/all.yml) (Default: dieses Repo, Branch `main`). Ein Fork muss öffentlich sein oder ArgoCD braucht Repo-Credentials. |
| Tailscale | Auth-Key unter [Settings > Keys](https://login.tailscale.com/admin/settings/keys): nicht „Reusable", nicht „Ephemeral". Der Key beginnt mit `tskey-auth-`. |

## Workstation-Tools

| Tool | Hinweis |
|---|---|
| `ansible` | Paket `ansible` 14.x (enthält `ansible-core`), dieselbe Version wie in CI: `pip install -r .github/requirements-ansible.txt` |
| Python | 3.13 ist in CI getestet, sehr neue Versionen unterstützt `ansible-core` oft noch nicht |
| `make`, `git`, `ssh` | Pflicht |
| `helm`, `yamllint`, `ansible-lint` | nur für `make lint` |

Die Galaxy-Collections aus [`ansible/requirements.yml`](../ansible/requirements.yml) (`ansible.posix`, `community.general`, `kubernetes.core`, `community.docker`) installiert `make install` über `make deps` selbst.

## Vault

Alle Secrets stehen als Inline-Vault-Werte (`!vault |`) in [`ansible/group_vars/all.yml`](../ansible/group_vars/all.yml), die Datei selbst bleibt Klartext. Alle Werte sind mit demselben Vault-Passwort verschlüsselt, das `make install` per `--ask-vault-pass` abfragt. Semaphore braucht es zur Laufzeit ebenfalls, deshalb liegt es verschlüsselt als `semaphore_vault_password` in derselben Datei.

Einen Wert verschlüsselst du so und ersetzt den alten Block durch die Ausgabe:

```bash
ansible-vault encrypt_string 'tskey-auth-...' --name 'tailscale_auth_key'
```

| Variable | Pflicht für |
|---|---|
| `tailscale_auth_key` | Rolle `tailscale` |
| `semaphore_vault_password` | Rolle `semaphore_bootstrap` |
| `scanner_smb_password`, `scanner_gotify_token`, `scanner_paperless_api_token` | Rolle `scanner` (Tokens nur, wenn Gotify bzw. Paperless-API aktiv sind) |
| `backup_restic_password` | Rolle `backup`, ohne den Wert wird sie übersprungen ([Backup](26-backup.md)) |
| `vault_nas_become_password`, `vault_portainer_admin_password` | NAS-Playbook (`make nas`) |

## Prüfen vor dem ersten Lauf

```bash
ssh jaydee@192.168.178.127 'sudo -n whoami'              # root, ohne Passwortabfrage
ssh jaydee@192.168.178.127 'curl -sfI https://get.k3s.io' # Internet vom Server
make ping                                                # homeserver | SUCCESS
grep -n 'CHANGE' ansible/group_vars/all.yml              # Werte mit CHANGE-Kommentar prüfen
```
