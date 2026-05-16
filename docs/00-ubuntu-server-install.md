# Ubuntu Server 24.04 LTS — Installationsanleitung

Diese Anleitung beschreibt die Installation von **Ubuntu Server 24.04 LTS** auf dem Home-Server.
Ubuntu Server (kein Desktop!) ist die Basis für den k3s-Cluster.

---

## Hardware

| Komponente | Spezifikation         |
|------------|-----------------------|
| CPU        | Intel Core i5         |
| RAM        | 32 GB                 |
| Storage    | 512 GB NVMe SSD       |
| OS         | Ubuntu Server 24.04 LTS (Noble Numbat) |

---

## Schritt 1 — Ubuntu Server ISO herunterladen

Ubuntu Server ISO von der offiziellen Seite herunterladen:

```
https://ubuntu.com/download/server
```

**Wichtig:** Ubuntu **Server** herunterladen, nicht Ubuntu Desktop.

Aktuelle LTS-Version: **24.04.x LTS (Noble Numbat)**

SHA256-Checksumme verifizieren (optional aber empfohlen):

```bash
# Linux/macOS
sha256sum ubuntu-24.04.*-live-server-amd64.iso

# Vergleich mit der offiziellen Checksumme unter:
# https://releases.ubuntu.com/24.04/SHA256SUMS
```

---

## Schritt 2 — Bootfähigen USB-Stick erstellen

### Linux

```bash
# USB-Gerät identifizieren (z.B. /dev/sdb)
lsblk

# ISO auf USB schreiben (ACHTUNG: USB-Stick wird gelöscht!)
sudo dd if=ubuntu-24.04.*-live-server-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

### macOS

```bash
# USB-Gerät identifizieren
diskutil list

# ISO auf USB schreiben
diskutil unmountDisk /dev/diskX
sudo dd if=ubuntu-24.04.*-live-server-amd64.iso of=/dev/rdiskX bs=4m
```

### Windows

Tool **Rufus** verwenden: https://rufus.ie

---

## Schritt 3 — Ubuntu Server installieren

### 3.1 — Vom USB-Stick booten

- USB-Stick in den Server stecken
- Server einschalten und BIOS/UEFI öffnen (meist `F2`, `F10`, `F12` oder `DEL` beim Boot)
- Boot-Reihenfolge: USB-Stick als erstes Boot-Device setzen
- Speichern und neu starten

### 3.2 — Installer-Schritte

Der Ubuntu Server Installer (Subiquity) führt durch die Installation:

**Sprache:** Empfehlung: English (verhindert Probleme mit Locale)

**Tastaturlayout:** Eigenes Layout wählen (z.B. German)

**Installationstyp:**
- ✅ **Ubuntu Server** (Standard)
- ❌ Ubuntu Server (minimized) — zu wenig Pakete vorinstalliert

**Netzwerk:**
- DHCP für die Installation akzeptieren
- Statische IP wird nach der Installation via Ansible konfiguriert (siehe unten)
- Interface-Name notieren (z.B. `eno1`, `enp3s0`, `eth0`)

**Proxy:** Leer lassen, wenn kein Proxy verwendet wird

**Ubuntu Archive Mirror:** Standard belassen (`http://de.archive.ubuntu.com/ubuntu`)

**Storage-Konfiguration:**
- ✅ **Use an entire disk** wählen
- ✅ **Set up this disk as an LVM group** aktivieren
- Die 512 GB NVMe SSD auswählen
- LVM summary bestätigen

**Storage-Layout Empfehlung:**

```
/boot/efi     512 MB    (EFI-Partition)
/boot           1 GB    (Boot-Partition)
/            ~510 GB    (Root via LVM — k3s nutzt local-path-provisioner hier)
```

**Profil-Setup:**

| Feld           | Wert                                     |
|----------------|------------------------------------------|
| Your name      | beliebig (z.B. `Home Server Admin`)     |
| Server name    | `homeserver` (muss zum Inventory passen) |
| Username       | `ubuntu`                                 |
| Password       | Sicheres Passwort wählen                 |

> **Wichtig:** Den Benutzernamen `ubuntu` beibehalten — das Ansible Inventory ist darauf konfiguriert.
> Der Hostname muss mit dem Wert `hostname` in `ansible/group_vars/all.yml` übereinstimmen.

**SSH-Setup:**
- ✅ **Install OpenSSH server** aktivieren
- Optional: SSH-Key direkt beim Install importieren (von GitHub/Launchpad)
- Falls kein Key importiert wird, wird er in Schritt 5 manuell übertragen

**Featured Server Snaps:** Alles abwählen — k3s und alle Apps werden via Ansible installiert

**Installation abschließen:** `Reboot Now` — USB-Stick entfernen wenn aufgefordert

---

## Schritt 4 — Post-Install: Erstes Login

Nach dem Neustart mit dem konfigurierten Benutzer einloggen:

```bash
# Direkt am Server (Konsole) oder via SSH wenn IP bekannt:
ssh ubuntu@<server-ip>
```

IP-Adresse ermitteln (direkt am Server):

```bash
ip addr show
# oder
hostname -I
```

---

## Schritt 5 — SSH-Key vom Control-Rechner übertragen

Auf dem **lokalen Rechner** (der Ansible ausführt):

```bash
# SSH-Key generieren (falls noch nicht vorhanden)
ssh-keygen -t ed25519 -C "home-server-ansible" -f ~/.ssh/id_home_server

# Key auf den Server übertragen (einmalig mit Passwort)
ssh-copy-id -i ~/.ssh/id_home_server.pub ubuntu@<server-ip>

# SSH-Verbindung ohne Passwort testen
ssh -i ~/.ssh/id_home_server ubuntu@<server-ip> "echo 'SSH-Key funktioniert'"
```

---

## Schritt 6 — Statische IP-Adresse konfigurieren

Eine statische IP ist für einen Server zwingend empfohlen.

### Option A: Via Ansible (empfohlen)

Das Ansible-Playbook kann die statische IP automatisch konfigurieren.
Variablen in `ansible/group_vars/all.yml` setzen:

```yaml
# Netzwerk — statische IP Konfiguration
network_configure_static_ip: true
network_interface: eno1          # ÄNDERN: Interface-Name (ip link show)
network_static_ip: 192.168.1.100 # ÄNDERN: Gewünschte statische IP
network_prefix_length: 24        # Subnetz-Präfix (24 = /24 = 255.255.255.0)
network_gateway: 192.168.1.1     # ÄNDERN: Router/Gateway-IP
network_dns:
  - 1.1.1.1
  - 8.8.8.8
```

Das Playbook konfiguriert Netplan und wendet die neue IP an.

> **Hinweis:** Nach der IP-Änderung wird die Ansible-Verbindung kurz unterbrochen.
> Das Playbook wartet danach automatisch auf Erreichbarkeit an der neuen IP.

### Option B: Manuell (vor dem Ansible-Lauf)

Interface-Namen ermitteln:

```bash
ip link show
# z.B.: eno1, enp3s0, eth0
```

Netplan-Konfigurationsdatei editieren:

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

Inhalt ersetzen:

```yaml
network:
  version: 2
  ethernets:
    eno1:                       # ÄNDERN: eigener Interface-Name
      dhcp4: false
      addresses:
        - 192.168.1.100/24      # ÄNDERN: eigene IP/Prefix
      routes:
        - to: default
          via: 192.168.1.1      # ÄNDERN: eigener Gateway
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

Konfiguration anwenden:

```bash
sudo netplan apply
```

Verbindung testen (vom lokalen Rechner):

```bash
ping 192.168.1.100
ssh ubuntu@192.168.1.100
```

---

## Schritt 7 — Passwordless sudo einrichten

Ansible benötigt passwordless sudo. Das ist auf Ubuntu Server standardmäßig aktiv.

Überprüfen:

```bash
sudo -n whoami
# Erwartet: root (ohne Passwort-Prompt)
```

Falls nicht aktiv:

```bash
echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/ubuntu
sudo chmod 0440 /etc/sudoers.d/ubuntu
```

---

## Schritt 8 — System-Updates

Vor dem Ansible-Lauf das System updaten:

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

---

## Checkliste — Bereit für Ansible

Alle Punkte müssen erfüllt sein:

- [ ] Ubuntu Server 24.04 LTS installiert (nicht Desktop)
- [ ] Benutzername ist `ubuntu`
- [ ] Hostname ist `homeserver` (oder entsprechend in `group_vars/all.yml` angepasst)
- [ ] SSH-Key-Authentifizierung funktioniert (`ssh -i ~/.ssh/id_home_server ubuntu@<ip>`)
- [ ] Passwordless sudo aktiv (`sudo -n whoami` → `root`)
- [ ] Statische IP konfiguriert
- [ ] Internet-Verbindung vom Server aus vorhanden (`ping 1.1.1.1`)
- [ ] Inventory-Datei mit korrekter IP aktualisiert
- [ ] `group_vars/all.yml` konfiguriert (argocd_repo_url, local_subnet, etc.)
- [ ] Tailscale Auth Key mit Ansible Vault verschlüsselt

Wenn alle Punkte erfüllt sind, weiter zur [Installationsanleitung](03-installation.md).
