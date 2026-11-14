# Ubuntu-Server-Installation

Bare-Metal-Installation von Ubuntu Server 26.04 LTS auf dem Home-Server, bis der Host für Ansible bereit ist. Hardware-Anforderungen und Workstation-Tools stehen in [Voraussetzungen](02-prerequisites.md).

## ISO und USB-Stick

ISO von <https://ubuntu.com/download/server> laden (Server-Variante, nicht Desktop) und gegen die Prüfsumme abgleichen:

```bash
sha256sum ubuntu-26.04.*-live-server-amd64.iso
# Vergleich mit https://releases.ubuntu.com/26.04/SHA256SUMS
```

Auf einen USB-Stick schreiben. `dd` überschreibt das Ziel komplett, also den Device-Pfad doppelt prüfen.

```bash
# Linux
lsblk
sudo dd if=ubuntu-26.04.*-live-server-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync

# macOS
diskutil list
diskutil unmountDisk /dev/diskX
sudo dd if=ubuntu-26.04.*-live-server-amd64.iso of=/dev/rdiskX bs=4m
```

Unter Windows gehen [Rufus](https://rufus.ie) oder [balenaEtcher](https://etcher.balena.io/).

## Installer-Einstellungen

Vom Stick booten (Boot-Menü meist über `F2`, `F10`, `F12` oder `Del`) und im Subiquity-Installer Folgendes wählen:

| Schritt | Einstellung |
|---|---|
| Sprache | English (vermeidet Locale-Probleme) |
| Tastatur | eigenes Layout, z. B. German |
| Installationstyp | Ubuntu Server, nicht „minimized" |
| Netzwerk | DHCP, die feste IP folgt unten |
| Storage | „Use an entire disk" mit „Set up this disk as an LVM group" |
| Profil | Benutzer `jaydee` (muss zu `ansible_user` in [`hosts.yml`](../ansible/inventory/hosts.yml) passen) |
| Servername | `homeserver` (muss zu `hostname` in [`all.yml`](../ansible/group_vars/all.yml) passen) |
| SSH | „Install OpenSSH server" aktivieren |
| Featured Snaps | nichts auswählen, Ansible installiert den Rest |

Nach dem Reboot den Stick abziehen und die IP ermitteln:

```bash
ip -4 addr show
```

## SSH-Key hinterlegen

Auf der Workstation, von der Ansible läuft:

```bash
ssh-keygen -t ed25519 -C "home-server-ansible" -f ~/.ssh/id_ed25519   # nur falls noch kein Key existiert
ssh-copy-id -i ~/.ssh/id_ed25519.pub jaydee@<server-ip>
ssh jaydee@<server-ip> 'echo ok'
```

Das Inventory setzt keinen Key-Pfad, Ansible nimmt also den Standard-Key bzw. den `ssh-agent`. Für einen anderen Key `ansible_ssh_private_key_file` am Host in `ansible/inventory/hosts.yml` ergänzen.

Die Rolle `common` erlaubt danach nur noch Key-Logins (`ssh_hardening_enabled`). Hat der Ansible-User keinen Key in `~/.ssh/authorized_keys`, überspringt sie das Härten mit einer Warnung ([Gotchas](gotchas.md#host-hardening-common-rolle)).

## Passwortloses sudo

Ansible arbeitet mit `become` und fragt für den Home-Server kein sudo-Passwort ab. Ubuntu verlangt es standardmäßig, deshalb einmalig:

```bash
echo 'jaydee ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/jaydee
sudo chmod 0440 /etc/sudoers.d/jaydee
sudo -n whoami   # muss ohne Rückfrage "root" liefern
```

## Feste IP

Der Server braucht eine feste Adresse (Referenz: `192.168.178.127`). Am einfachsten ist eine DHCP-Reservierung im Router. Alternativ schreibt die Rolle `common` eine Netplan-Datei `/etc/netplan/99-static.yaml`, wenn du in [`all.yml`](../ansible/group_vars/all.yml) Folgendes setzt:

```yaml
network_configure_static_ip: true      # Default: false
network_interface: "eno1"              # Name aus `ip link show`
network_static_ip: "192.168.178.127"
network_prefix_length: 24
network_gateway: "192.168.178.1"
```

Beim Anwenden reißt die SSH-Verbindung kurz ab. `ansible_host` im Inventory muss schon vorher auf die neue IP zeigen.

Danach geht es mit [Voraussetzungen](02-prerequisites.md) weiter.
