# Tailscale-VPN-Guide

Dieses Dokument behandelt Tailscale-Setup, MagicDNS, Subnet-Routing und Client-Konfiguration.

---

## Überblick

Tailscale baut ein WireGuard-basiertes Mesh-VPN (ein „tailnet") zwischen allen
eigenen Geräten. Sobald der Home-Server im Tailnet ist, sind seine Services
von jedem Tailscale-Gerät erreichbar — ohne Port-Forwarding, ohne Dynamic-DNS,
ohne offene Ports am Router.

---

## Auth-Key besorgen

Auth-Keys lassen Geräte automatisch dem Tailnet beitreten (praktisch für
Server, bei denen ein interaktiver Browser-Login nicht passt).

1. Im [Tailscale-Admin-Panel](https://login.tailscale.com/admin) einloggen.
2. **Settings → Keys**.
3. **Generate auth key**.
4. Optionen:
   - **Reusable:** deaktivieren (Single-Use ist sicherer)
   - **Ephemeral:** deaktivieren (Server soll persistent bleiben)
   - **Tags:** optional — z. B. `tag:homeserver` für ACLs
   - **Expiry:** vernünftiges Ablaufdatum setzen (oder ganz deaktivieren)
5. **Generate key**.
6. Key sofort kopieren — er wird nur einmal angezeigt.

**Mit Ansible-Vault verschlüsseln** (niemals plaintext speichern):

```bash
ansible-vault encrypt_string 'tskey-auth-DEIN_KEY' --name 'tailscale_auth_key'
```

Den verschlüsselten Block in `ansible/group_vars/all.yml` einsetzen.

---

## MagicDNS einrichten

Tailscale-MagicDNS löst Hostnamen aller Tailnet-Geräte automatisch auf. Mit
MagicDNS erreichst du den Home-Server unter `homeserver` oder
`homeserver.tail12345.ts.net` von jedem Tailscale-Client.

**MagicDNS aktivieren:**

1. [Tailscale-Admin-Panel](https://login.tailscale.com/admin) → **DNS**.
2. **Enable MagicDNS** anschalten.
3. Optional einen **Global nameserver** (z. B. `1.1.1.1`) für Nicht-Tailscale-Hostnamen setzen.

**Nach Aktivierung — Server-Zugriff:**

```
# Kurzer Hostname (im Tailnet)
http://homeserver:30080        # ArgoCD
ssh homeserver                 # SSH

# Voller Tailnet-Hostname
http://homeserver.tail12345.ts.net:30080
ssh homeserver.tail12345.ts.net
```

Den Tailnet-Namen findest du im Admin-Panel unter **Settings → General**.

**MagicDNS testen:**

```bash
# Vom Client mit laufendem Tailscale
ping homeserver
nslookup homeserver
curl http://homeserver:30080
```

---

## Zugriff über die Tailscale-IP

Jedes Gerät im Tailnet bekommt eine stabile IP im Bereich `100.x.x.x` (CGNAT).

Tailscale-IP des Servers ermitteln:

```bash
# Auf dem Server
tailscale ip -4

# Oder im Admin-Panel:
# https://login.tailscale.com/admin/machines
```

Beispiel — Server-Tailscale-IP `100.101.102.103`:

```
http://100.101.102.103:30080    # ArgoCD
http://100.101.102.103:80       # Traefik HTTP
ssh 100.101.102.103             # SSH
kubectl --server=https://100.101.102.103:6443 get nodes
```

---

## Subnet-Routing

Subnet-Routing erlaubt anderen Tailscale-Clients, Geräte im **Heim-LAN** zu
erreichen, auf denen kein Tailscale läuft — z. B. eine NAS, ein Smart-TV
oder ein Drucker.

Die Ansible-Rolle konfiguriert den Server so, dass er das eigene Subnetz
(`local_subnet`, Default `192.168.1.0/24`) advertised.

**Subnet-Routes freischalten:**

Nach dem Playbook-Run die advertised Routes im Admin-Panel approven:

1. [Admin-Panel](https://login.tailscale.com/admin/machines) öffnen.
2. Home-Server auswählen.
3. **... → Edit route settings**.
4. Das advertised Subnet (`192.168.1.0/24`) aktivieren.
5. **Save**.

**Subnet-Zugriff testen:**

```bash
# Von einem Tailscale-Client
ping 192.168.1.1
curl http://192.168.1.1/      # Router-Admin-Seite (falls erreichbar)

# Server direkt über die LAN-IP
curl http://192.168.1.100:30080
```

**Subnet-Routing am Client aktivieren:**

Auf macOS/Windows/iOS/Android-Clients muss in den App-Settings „Use Tailscale
subnets" aktiviert sein, damit Subnet-Routes greifen.

Auf Linux:

```bash
sudo tailscale up --accept-routes
```

---

## Client-Geräte verbinden

Tailscale auf allen Geräten installieren:

### Linux

```bash
# Installation
curl -fsSL https://tailscale.com/install.sh | sh

# Verbinden (öffnet Browser zur Auth)
sudo tailscale up

# Verbinden mit Subnet-Routing
sudo tailscale up --accept-routes

# Status
tailscale status
tailscale ip -4
```

### macOS

```bash
# Via Homebrew
brew install --cask tailscale

# Oder Mac App Store:
# https://apps.apple.com/app/tailscale/id1475387142
```

Nach der Installation auf das Tailscale-Icon in der Menü-Leiste → **Log In**.

### Windows

Download: <https://tailscale.com/download/windows>

Tailscale-Icon im Tray → **Log In**.

### iOS / Android

App Store bzw. Google Play, „Tailscale".

### Konnektivität verifizieren

Nach dem Verbinden eines Clients:

```bash
# Vom Client
tailscale status                         # homeserver sollte in der Liste stehen
ping homeserver                          # MagicDNS
curl http://homeserver:30080             # ArgoCD
ssh ubuntu@homeserver                    # SSH
```

---

## Tailscale-Management auf dem Server

**Status:**

```bash
tailscale status
```

Zeigt alle Tailnet-Geräte und deren Verbindungsstatus.

**Details:**

```bash
tailscale status --json | jq .
tailscale ping homeserver           # Latenz zu einem anderen Tailnet-Gerät
tailscale netcheck                  # Netz-Diagnostik
```

**Häufige Server-Kommandos:**

```bash
# Verbindung trennen
sudo tailscale down

# Wieder verbinden (nutzt bestehende Auth)
sudo tailscale up

# Re-Authentifizierung erzwingen
sudo tailscale up --force-reauth

# Tailscale-IP
tailscale ip -4
tailscale ip -6

# Logs
sudo journalctl -u tailscaled -f
sudo journalctl -u tailscaled --since "1 hour ago"

# Service-Management
sudo systemctl status tailscaled
sudo systemctl restart tailscaled
```

---

## Exit-Node (optional)

Wenn der Home-Server als Exit-Node konfiguriert wird, **routet sämtlicher
Internet-Traffic** vom Client durch die Heim-Internet-Verbindung. Praktisch
in unsicheren Netzen (Public WiFi).

**Exit-Node auf dem Server aktivieren:**

```bash
# Als Exit-Node advertisen
sudo tailscale up \
  --advertise-exit-node \
  --advertise-routes=192.168.1.0/24 \
  --hostname=homeserver
```

**Im Admin-Panel approven:**

1. [Admin-Panel](https://login.tailscale.com/admin/machines) → eigener Server.
2. **... → Edit route settings**.
3. **Use as exit node** aktivieren.
4. **Save**.

**Exit-Node auf dem Client nutzen:**

```bash
# Linux: Home-Server als Exit-Node
sudo tailscale up --exit-node=homeserver

# Oder über die Tailscale-IP
sudo tailscale up --exit-node=100.101.102.103

# Exit-Node deaktivieren
sudo tailscale up --exit-node=
```

Auf macOS/Windows: Tailscale-Icon → **Exit Node** → eigenen Server wählen.

**Verifizieren:**

```bash
# Sollte die Heim-IP zeigen, nicht die IP des aktuellen Netzes
curl ifconfig.me
```

---

## ACL-Konfiguration

Tailscale-ACLs (Access Control Lists) steuern, welches Gerät welches andere
Gerät erreichen darf. Default ist „all-to-all".

ACL-Policy im [Admin-Panel](https://login.tailscale.com/admin/acls) editieren:

**Beispiel: nur bestimmte Geräte dürfen auf den Home-Server zugreifen:**

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:personal-devices"],
      "dst": ["tag:homeserver:*"]
    }
  ],
  "tagOwners": {
    "tag:homeserver": ["autogroup:admin"],
    "tag:personal-devices": ["autogroup:admin"]
  }
}
```

Auth-Keys werden dann mit den passenden Tags erstellt (`tag:homeserver` für den Server,
`tag:personal-devices` für Laptops/Phones).

---

## Troubleshooting

Detaillierte Schritte in [07-troubleshooting.md](07-troubleshooting.md#tailscale-not-connecting).

Schnell-Checks:

```bash
# Läuft tailscaled?
sudo systemctl status tailscaled

# Verbindung aktiv?
tailscale status

# Netzdiagnose
tailscale netcheck

# Erreicht der Server die Tailscale-Services?
curl -sv https://login.tailscale.com/

# Vollständige Logs
sudo journalctl -u tailscaled --since "30 minutes ago"
```
