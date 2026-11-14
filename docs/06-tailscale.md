# Tailscale

Tailscale ist der einzige Fernzugang zum Home-Server. Der Server ist Knoten im Tailnet und Subnet-Router für das Heim-LAN, Ports am Router sind keine offen.

| | |
|---|---|
| Rolle | [`ansible/roles/tailscale/`](../ansible/roles/tailscale/) |
| Make | `make tailscale` |
| Admin-Konsole | https://login.tailscale.com/admin/machines |

## Konfiguration

| Variable | Wert | Zweck |
|---|---|---|
| `tailscale_auth_key` | Vault | Auth-Key für den Login, nur nötig, wenn der Node nicht verbunden ist |
| `tailscale_hostname` | `{{ hostname }}` (`homeserver`) | Name im Tailnet und für MagicDNS |
| `local_subnet` | `192.168.178.0/24` | Advertised Subnet-Route |
| `tailscale_cidr` | `100.64.0.0/10` | Quellnetz der Tailnet-Peers für die UFW-Regeln der `common`-Rolle |
| `tailscale_up_timeout` | `60s` | Obergrenze für `tailscale up`, damit der unbeaufsichtigte Lauf nicht hängt |
| `tailscale_repo_codename` | Ubuntu-Release | APT-Repo-Codename, nur überschreiben, wenn Tailscale für ein neues Ubuntu noch keine Pakete hat |

Die Rolle installiert `tailscale` aus dem offiziellen APT-Repo (bei `auto_upgrade: true` immer die neueste Version). Ist der Node nicht verbunden, loggt sie ihn ein:

```bash
tailscale up --auth-key=file:/run/tailscale-authkey --timeout=60s \
  --hostname=homeserver --advertise-routes=192.168.178.0/24 \
  --accept-dns=true --accept-routes=false
```

Bei einem verbundenen Node gleicht sie nur Hostname und Routen per `tailscale set` ab. IP-Forwarding setzt die `common`-Rolle (`/etc/sysctl.d/99-k3s.conf`), die UFW erlaubt `41641/udp` und alles aus `tailscale_cidr`. Wie die Rolle mit abgelaufenen Keys umgeht, steht in [Gotchas: Tailscale](gotchas.md#tailscale).

## Einrichtung im Tailnet

1. Auth-Key unter Settings > Keys erzeugen (nicht ephemeral) und verschlüsselt in `ansible/group_vars/all.yml` ablegen:

   ```bash
   ansible-vault encrypt_string 'tskey-auth-...' --name 'tailscale_auth_key'
   ```

2. Nach dem ersten Lauf in der Admin-Konsole beim Server unter „Edit route settings“ die Route `192.168.178.0/24` freigeben.
3. Unter „DNS“ MagicDNS aktivieren und einen Split-DNS-Nameserver `192.168.178.2` für die Domain `homeserver` anlegen. Dann lösen Tailscale-Clients auch unterwegs `*.homeserver` über Pi-hole auf ([Pi-hole](15-pihole.md)).

Clients brauchen die Option „Use Tailscale subnets“ (Linux: `sudo tailscale up --accept-routes`), sonst erreichen sie weder Pi-hole noch die LAN-IPs.

## Zugriff

| Ziel | Adresse |
|---|---|
| SSH | `ssh jaydee@homeserver` oder die Tailscale-IP (`tailscale ip -4`) |
| ArgoCD | `http://homeserver:30080` |
| Ingress-Apps | `http://<name>.homeserver` (Split DNS und Subnet-Route nötig) |
| LAN-Geräte | direkt über `192.168.178.x` (Subnet-Route) |

Der 7DTD-Gameserver und Jellyfin für geteilte Nodes haben eigene Tailscale-Zugänge, siehe [Gameserver](19-gameserver.md) und [Jellyfin](16-jellyfin.md).

## Betrieb

```bash
tailscale status                      # Peers und Verbindungszustand
tailscale status --json | jq .BackendState   # "Running" oder z. B. "NeedsLogin"
tailscale netcheck                    # UDP, DERP-Latenzen
sudo journalctl -u tailscaled --since "30 minutes ago"

# Manueller Login, wenn der Auth-Key abgelaufen ist (öffnet einen Login-Link)
sudo tailscale up --hostname=homeserver --advertise-routes=192.168.178.0/24 \
  --accept-dns=true --accept-routes=false
```
