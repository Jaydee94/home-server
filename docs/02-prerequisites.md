# Voraussetzungen

Dieses Dokument listet alles auf, was vor dem ersten Playbook-Run vorhanden sein muss.

---

## Control-Machine

Der Rechner, von dem aus Ansible läuft, braucht:

### Ansible >= 2.14

```bash
# Version prüfen
ansible --version

# Installation via pip (empfohlen)
pip3 install --user "ansible>=2.14"

# Oder via pipx (isolierte Umgebung)
pipx install ansible

# Auf Ubuntu/Debian via apt (oft ältere Version)
sudo apt install ansible
```

### Python >= 3.10

```bash
# Version prüfen
python3 --version

# Zusätzlich zu Ansible benötigte Python-Pakete:
pip3 install --user netaddr jmespath
```

`netaddr` wird von `ansible.utils` für CIDR-Berechnungen (UFW-Regeln) genutzt,
`jmespath` von dem `community.general.json_query`-Filter in der Rolle
`semaphore_bootstrap`.

### SSH-Client

Ein normaler `ssh`-Client muss verfügbar sein. Test:

```bash
ssh -V
```

---

## Ziel-Server

### Frische Ubuntu-26.04-LTS-Installation

- **Server-Variante** (kein Desktop)
- Mindestens **4 GB RAM** (Referenz: 32 GB)
- Mindestens **20 GB Disk** (Referenz: 512 GB NVMe-SSD)
- Netzwerk-Anbindung (DHCP oder statische IP — statisch empfohlen)
- Non-Root-User mit `sudo`-Rechten (Ubuntu-Default: `ubuntu`)

### SSH-Key-Authentifizierung

Die Control-Machine muss sich passwortlos per Key am Server anmelden können:

```bash
# Falls noch kein Key vorhanden ist
ssh-keygen -t ed25519 -C "home-server-ansible" -f ~/.ssh/id_ed25519

# Public Key auf den Server kopieren (einmaliger Passwort-Login)
ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@192.168.1.100

# Login testen
ssh -i ~/.ssh/id_ed25519 ubuntu@192.168.1.100 "echo 'SSH-Key-Login funktioniert'"
```

Liegt der Private Key woanders, in `ansible/inventory/hosts.yml` entsprechend
`ansible_ssh_private_key_file` anpassen.

### Python 3 auf dem Server

Ubuntu 26.04 bringt Python 3.12 mit:

```bash
ssh ubuntu@192.168.1.100 "python3 --version"
```

---

## Externe Accounts

### Tailscale-Account + Auth-Key

1. Auf [tailscale.com](https://tailscale.com) registrieren (kostenlos für Personal Use).
2. **Settings → Keys** im Tailscale-Admin-Panel öffnen.
3. **Generate auth key** anklicken.
4. Optionen wählen:
   - **Reusable**: Nein (Single-Use ist sicherer)
   - **Ephemeral**: Nein (der Server soll im Netz bleiben)
   - **Tags**: optional (z. B. `tag:homeserver`)
5. Key kopieren (beginnt mit `tskey-auth-…`).
6. Mit Ansible-Vault verschlüsseln (siehe [Installation Guide](03-installation.md)).

### Git-Repository für GitOps

ArgoCD zieht die Manifests aus einem Git-Repository. Möglichkeiten:

- **Dieses Repository selbst** (empfohlen — am einfachsten)
- Ein separates privates Repository

Das Repository muss **öffentlich** sein oder ArgoCD mit Credentials für
private Repos versorgt werden.

`argocd_repo_url` in `ansible/group_vars/all.yml` auf die eigene Repo-URL setzen.

---

## Ansible-Galaxy-Collections

Vor dem Playbook-Run die benötigten Collections installieren:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

Die `ansible/requirements.yml` liefert:

| Collection           | Version     | Zweck                                      |
|----------------------|-------------|--------------------------------------------|
| `ansible.posix`      | >= 1.5.0    | POSIX-Module (sysctl, firewalld, …)        |
| `community.general`  | >= 7.0.0    | Erweiterte Module (snap, homebrew, …)      |
| `kubernetes.core`    | >= 2.4.0    | kubectl/Helm-Interaktionsmodule            |

---

## Pre-flight-Checks

Vor dem Playbook-Run alle Punkte abhaken — alle sollten grün sein.

### 1. SSH-Verbindung

```bash
ssh ubuntu@192.168.1.100 "whoami"
# Erwartet: ubuntu
```

### 2. Passwortloses sudo

```bash
ssh ubuntu@192.168.1.100 "sudo whoami"
# Erwartet: root
# Falls Passwort abgefragt wird, NOPASSWD-sudo konfigurieren:
# echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/ubuntu
```

### 3. Ansible-Ping

```bash
ansible -i ansible/inventory/hosts.yml homeserver -m ping
# Erwartet:
# homeserver | SUCCESS => { "ping": "pong" }
```

### 4. Python auf dem Ziel verfügbar

```bash
ansible -i ansible/inventory/hosts.yml homeserver -m ansible.builtin.command \
  -a "python3 --version"
# Erwartet: python3 3.x.x
```

### 5. Internet-Zugriff auf dem Server

```bash
ssh ubuntu@192.168.1.100 "curl -sf https://get.k3s.io | head -5"
# Erwartet: Script-Header (keine Fehler)
```

### 6. Genug Disk-Speicher

```bash
ssh ubuntu@192.168.1.100 "df -h /"
# Erwartet: mindestens 20 GB frei
```

### 7. Genug RAM

```bash
ssh ubuntu@192.168.1.100 "free -h"
# Erwartet: mindestens 4 GB total
```

### 8. Inventory aktualisiert

```bash
grep "192.168.1.100" ansible/inventory/hosts.yml
# Liefert das den Default-Wert, wurde die Datei noch nicht angepasst.
```

### 9. group_vars aktualisiert

```bash
grep "YOUR_USER\|CHANGE_ME\|CHANGE_THIS" ansible/group_vars/all.yml
# Sollte KEINE Treffer liefern — sonst stehen noch Platzhalter drin.
```

### 10. Vault-Secret verschlüsselt

```bash
grep "tailscale_auth_key:" ansible/group_vars/all.yml
# Korrekt: tailscale_auth_key: !vault |
# Falsch:  tailscale_auth_key: "CHANGE_ME_USE_VAULT"
```

---

## Optional: Statische IP

Für einen Server ist eine statische IP dringend empfohlen — vor dem Ansible-Run
konfigurieren.

Auf Ubuntu 26.04 (netplan):

```bash
# /etc/netplan/00-installer-config.yaml
network:
  version: 2
  ethernets:
    ens3:           # tatsächlichen Interface-Namen aus `ip link show` einsetzen
      dhcp4: false
      addresses:
        - 192.168.1.100/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8

# Anwenden:
sudo netplan apply
```

---

## Anforderungen an den Heimrouter

- Server unter der konfigurierten IP erreichbar.
- Outbound UDP-Port 41641 **nicht blockieren** (Tailscale).
- **Kein** Port-Forwarding für Tailscale nötig (DERP-Relay als Fallback).
