# Ubuntu Server 26.04 LTS — Installationsleitfaden

Dieser Leitfaden beschreibt die Installation von **Ubuntu Server 26.04 LTS** auf
dem Home-Server. **Server-Variante** (nicht Desktop) — sie ist die unterstützte
Basis für den k3s-Cluster.

---

## Hardware

| Komponente | Empfohlen              | Referenz-Build              |
|------------|------------------------|-----------------------------|
| CPU        | x86-64, 2+ Cores       | Intel Core i5               |
| RAM        | ≥ 4 GB                 | 32 GB                       |
| Storage    | ≥ 20 GB                | 512 GB NVMe-SSD             |
| Netzwerk   | Wired Ethernet         | 1 Gbit/s                    |
| OS         | Ubuntu Server 26.04 LTS|                             |

---

## Schritt 1 — Ubuntu-Server-ISO herunterladen

Von der offiziellen Seite:

<https://ubuntu.com/download/server>

> **Ubuntu Server** wählen, nicht Ubuntu Desktop. Aktuelles LTS: **26.04.x**.

Optional, aber empfohlen — SHA256-Summe verifizieren:

```bash
sha256sum ubuntu-26.04.*-live-server-amd64.iso
# Vergleichen mit: https://releases.ubuntu.com/26.04/SHA256SUMS
```

---

## Schritt 2 — Bootable USB-Stick erstellen

**Linux**

```bash
lsblk                                                       # USB-Device finden, z. B. /dev/sdb
sudo dd if=ubuntu-26.04.*-live-server-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

**macOS**

```bash
diskutil list                                               # USB finden, z. B. /dev/disk4
diskutil unmountDisk /dev/diskX
sudo dd if=ubuntu-26.04.*-live-server-amd64.iso of=/dev/rdiskX bs=4m
```

**Windows** — [Rufus](https://rufus.ie) oder
[balenaEtcher](https://www.balena.io/etcher/) nutzen.

> Der USB-Stick wird komplett überschrieben. Device-Pfad doppelt prüfen.

---

## Schritt 3 — Ubuntu Server installieren

1. Server vom USB-Stick booten (BIOS/UEFI-Taste meist `F2`, `F10`, `F12` oder `Del`).
2. Durch den Subiquity-Installer klicken:

| Schritt              | Einstellung                                                            |
|----------------------|------------------------------------------------------------------------|
| Sprache              | English (vermeidet Locale-Issues)                                      |
| Tastatur             | Eigenes Layout (z. B. German)                                          |
| Installationstyp     | **Ubuntu Server** (NICHT *minimized*)                                  |
| Netzwerk             | DHCP zunächst akzeptieren — statische IP folgt später                  |
| Proxy                | leer lassen                                                            |
| Mirror               | Default                                                                |
| Storage              | **Use an entire disk** + **Set up this disk as an LVM group**          |
| Profile              | Username **`ubuntu`** (muss zum Inventory passen)                      |
| Servername           | **`homeserver`** (muss zu `hostname` in `group_vars/all.yml` passen)   |
| SSH                  | **Install OpenSSH server** (optional GitHub/Launchpad-Keys importieren)|
| Featured Snaps       | alles überspringen — Ansible installiert alles Weitere                 |

3. Nach dem Reboot den USB-Stick entfernen.

---

## Schritt 4 — Erster Login & Server-IP finden

Nach dem Reboot lokal oder per SSH (falls Key importiert wurde) anmelden:

```bash
ip -4 addr show         # IP des Servers ermitteln, z. B. 192.168.1.123
hostname -I             # Kurzform
```

---

## Schritt 5 — SSH-Public-Key vom Control-Rechner pushen

Auf dem **lokalen** Rechner (von dort wird Ansible laufen):

```bash
# Key generieren, falls noch keiner vorhanden
ssh-keygen -t ed25519 -C "home-server-ansible" -f ~/.ssh/id_ed25519

# Public Key auf den Server kopieren (einmaliger Passwort-Login)
ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@<server-ip>

# Verifizieren, dass passwortloser Login geht
ssh -i ~/.ssh/id_ed25519 ubuntu@<server-ip> "echo 'SSH-Key-Login funktioniert'"
```

Bei abweichendem Key-Pfad (z. B. legacy `~/.ssh/id_rsa`) den Eintrag
`ansible_ssh_private_key_file` in `ansible/inventory/hosts.yml` anpassen.

---

## Schritt 6 — Statische IP einrichten

Für einen Server dringend empfohlen.

### Variante A — Ansible erledigt es (empfohlen)

In `ansible/group_vars/all.yml`:

```yaml
network_configure_static_ip: true
network_interface: eno1          # ANPASSEN — Name aus: ip link show
network_static_ip: 192.168.1.100 # ANPASSEN
network_prefix_length: 24
network_gateway: 192.168.1.1     # ANPASSEN — IP des Routers
network_dns:
  - 1.1.1.1
  - 8.8.8.8
```

Die SSH-Session bricht kurz weg, während Netplan neu konfiguriert. Wichtig:
`ansible_host` im Inventory muss auf die neue IP zeigen (oder vorher schon).

### Variante B — Manuell vor dem Playbook

```bash
ip link show                              # Interface-Name herausfinden, z. B. eno1
sudo $EDITOR /etc/netplan/00-installer-config.yaml
```

Datei ersetzen durch:

```yaml
network:
  version: 2
  ethernets:
    eno1:                       # eigenes Interface
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
```

Anwenden:

```bash
sudo netplan apply
```

Vom Laptop aus testen:

```bash
ping 192.168.1.100
ssh ubuntu@192.168.1.100
```

---

## Schritt 7 — Passwortloses sudo

Ansible braucht `NOPASSWD`-sudo. Ubuntu Server hat das nicht standardmäßig
aktiv — prüfen und bei Bedarf fixen:

```bash
sudo -n whoami           # sollte "root" liefern, ohne Passwortabfrage
# Falls Passwort abgefragt wird:
echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/ubuntu
sudo chmod 0440 /etc/sudoers.d/ubuntu
```

---

## Schritt 8 — System-Updates

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

---

## Bereit für Ansible — Checkliste

- [ ] Ubuntu Server 26.04 LTS installiert (nicht Desktop)
- [ ] Username ist `ubuntu`
- [ ] Hostname stimmt mit `hostname` in `ansible/group_vars/all.yml` überein (Default: `homeserver`)
- [ ] SSH-Key-Login funktioniert (`ssh -i ~/.ssh/id_ed25519 ubuntu@<ip>`)
- [ ] Passwortloses sudo funktioniert (`sudo -n whoami` → `root`)
- [ ] Server hat statische IP
- [ ] Internet vom Server erreichbar (`ping 1.1.1.1`)
- [ ] `ansible/inventory/hosts.yml` hat die korrekte IP
- [ ] `ansible/group_vars/all.yml` ist ausgefüllt (`argocd_repo_url`, `local_subnet`, `timezone`)
- [ ] Tailscale Auth-Key mit Ansible-Vault verschlüsselt

Wenn alles abgehakt ist, weiter mit dem **[Installationsleitfaden](03-installation.md)**.
