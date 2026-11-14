# Pi-hole

Pi-hole ist der einzige DNS-Server im Heimnetz. Es blockt Werbung und Tracker für alle Geräte hinter der FritzBox, beantwortet `*.homeserver` selbst und leitet alle übrigen Anfragen an die FritzBox und Quad9 weiter.

| | |
|---|---|
| URL | http://pihole.homeserver/admin/login |
| DNS | `192.168.178.2:53` TCP und UDP (MetalLB) |
| Namespace | `pihole` |
| Quelle | [`argocd/apps/pihole/`](../argocd/apps/pihole/) |
| Chart | `mojo2600/pihole` (Version in [`Chart.yaml`](../argocd/apps/pihole/Chart.yaml)) |
| Host-Resolver | Rolle `ansible/roles/host_dns/`, `make host-dns` |

## Architektur

```text
FritzBox (DHCP): „Lokaler DNS-Server" = 192.168.178.2
        │
        ▼
Pi-hole 192.168.178.2:53 (k3s, MetalLB)
  ├── *.homeserver  → 192.168.178.127 (Traefik)
  ├── jays-ugreen   → 192.168.178.118 (NAS)
  └── alles andere  → 192.168.178.1 (FritzBox), 9.9.9.9 (Quad9)
```

Es gibt drei Wege, auf denen Namen aufgelöst werden:

| Wer | Weg | Bei Ausfall von Pi-hole |
|---|---|---|
| LAN-Geräte | FritzBox verteilt `192.168.178.2` per DHCP | kein DNS |
| Home-Server | `host_dns` setzt in `/etc/systemd/resolved.conf.d/host-dns.conf` `DNS=192.168.178.2 192.168.178.1`, `FallbackDNS=1.1.1.1 8.8.8.8` | Internet über die FritzBox, `*.homeserver` fällt aus |
| Pods | CoreDNS beantwortet die Zone `homeserver` selbst (ConfigMap `coredns-custom`, [`templates/coredns-custom.yaml`](../argocd/apps/pihole/templates/coredns-custom.yaml)) | unabhängig von Pi-hole |

Der Home-Server braucht `*.homeserver` für Host-Tools wie den Scanner (`gotify.homeserver`) und `make semaphore-bootstrap-local` (`semaphore.homeserver`). `systemd-resolved` bleibt beim ersten erreichbaren Server und wechselt nur bei einem Ausfall.

Pi-hole bekommt per MetalLB eine eigene LAN-IP. Auf der Node-IP würde k3s' Klipper-ServiceLB `0.0.0.0:53` als hostPort belegen und damit `systemd-resolved` auf dem Host lahmlegen. Damit Klipper den Service nicht zusätzlich beansprucht, setzen Service und MetalLB-Controller dieselbe `loadBalancerClass` (Details in [gotchas.md](gotchas.md#metallb--networking)).

## Pi-hole als einziger LAN-DNS

Die FritzBox kann per DHCP nur eine lokale DNS-IP verteilen. Das Feld „Alternativer DNSv4-Server“ gilt nur für die FritzBox selbst und wird nicht an die Clients weitergegeben. Ein automatischer Fallback auf der Client-Seite ist damit nicht möglich.

Fällt Pi-hole oder der Home-Server aus, haben LAN-Geräte kein DNS mehr. Dieser Single Point of Failure ist bewusst akzeptiert: Der restliche Stack läuft ohnehin auf demselben Node, und der netzwerkweite Adblocker funktioniert nur, wenn alle Geräte Pi-hole fragen.

### Notfall: Pi-hole oder Server ausgefallen

1. In der FritzBox unter Heimnetz, Netzwerk, Netzwerkeinstellungen, IPv4-Adressen das Feld „Lokaler DNS-Server“ leeren und speichern. Die FritzBox verteilt dann wieder sich selbst als DNS.
2. Clients übernehmen das erst beim nächsten DHCP-Lease. Am schnellsten geht es, wenn du das Netzwerk am Gerät kurz trennst. Ein einzelnes Gerät kannst du auch überbrücken, indem du dort `192.168.178.1` als DNS einträgst.
3. Nutzt das Tailnet Pi-hole global (Variante B unten), den Nameserver in der Tailscale-Konsole entfernen.
4. Der Home-Server selbst braucht nichts: `systemd-resolved` fällt von allein auf die FritzBox zurück.

Läuft Pi-hole wieder, das FritzBox-Feld zurück auf `192.168.178.2` setzen.

## Konfiguration

| Wert | Datei | Zweck |
|---|---|---|
| `serviceDns.loadBalancerIP`, `serviceDnsTCP.loadBalancerIP` | `argocd/apps/pihole/values.yaml` | DNS-IP `192.168.178.2`, beide Services teilen sie per `metallb.io/allow-shared-ip` |
| `dnsmasq.customDnsEntries` | `argocd/apps/pihole/values.yaml` | `address=/homeserver/192.168.178.127`, `address=/jays-ugreen/192.168.178.118` |
| `clusterDns.homeserverIp` | `argocd/apps/pihole/values.yaml` | IP für `coredns-custom`, muss zum `address=/homeserver/…`-Eintrag passen |
| `DNS1`, `DNS2` | `argocd/apps/pihole/values.yaml` | Upstreams FritzBox und Quad9 |
| `adlists` | `argocd/apps/pihole/values.yaml` | Hagezi Pro und TIF, OISD Big, StevenBlack, URLhaus |
| `adminSecret.encryptedPassword` | `argocd/apps/pihole/values.yaml` | SealedSecret `pihole-admin` mit dem Admin-Passwort |
| `pihole_dns_ip` | `ansible/group_vars/all.yml` | Ziel des Host-Resolvers |
| IPAddressPool `pihole-dns` | `argocd/apps/metallb/templates/ipaddresspool.yaml` | `192.168.178.2/32`, `autoAssign: false` |

Die IP muss außerhalb des DHCP-Bereichs der FritzBox liegen. Wo du sie bei einem Wechsel überall ändern musst, steht in [gotchas.md](gotchas.md#pi-hole--dns).

Für ein neues Admin-Passwort sealst du es für Namespace `pihole` und Secret `pihole-admin` (per kubeseal-webgui oder `kubeseal`, siehe [gotchas.md](gotchas.md#secrets--sealedsecrets-admin-passwörter)) und ersetzt `adminSecret.encryptedPassword`.

## Tailscale-Geräte

Pi-hole liegt im LAN. Tailscale-Geräte erreichen es nur über den Subnet-Router: Die Rolle `tailscale` meldet `local_subnet` (`192.168.178.0/24`) per `--advertise-routes` als Route an. Die Route muss in der [Tailscale-Konsole unter Machines](https://login.tailscale.com/admin/machines) freigegeben sein, und der Client braucht „Use Tailscale subnets“ bzw. `--accept-routes`.

In der [Tailscale-Konsole unter DNS](https://login.tailscale.com/admin/dns) einen Custom-Nameserver `192.168.178.2` anlegen, in einer von zwei Varianten:

| Variante | Einstellung | Wirkung |
|---|---|---|
| A (Standard, siehe [Tailscale](06-tailscale.md)) | „Restrict to search domain“ = `homeserver` | Nur `*.homeserver` geht an Pi-hole. Unterwegs kein Adblock, aber auch keine Abhängigkeit von Pi-hole. |
| B | ohne Restrict, dazu „Override local DNS“ | Adblock auch unterwegs. Ist der Server down, haben diese Geräte gar kein DNS. |

Nutzt ein Gerät einen Exit-Node, verwendet es dessen DNS. Dagegen hilft am Nameserver die Option „use this nameserver even when an exit node is in use“. Der Subnet-Router maskiert weitergeleiteten Traffic, deshalb sieht Pi-hole alle Remote-Anfragen mit der LAN-IP des Home-Servers.

```bash
nslookup grafana.homeserver   # 192.168.178.127 (A und B)
nslookup doubleclick.net      # geblockt (nur B)
```

## Betrieb

```bash
sudo kubectl -n pihole get pods,svc       # DNS-Services mit EXTERNAL-IP 192.168.178.2
sudo kubectl -n metallb get ipaddresspool,l2advertisement
dig @192.168.178.2 doubleclick.net        # 0.0.0.0 (geblockt)
dig @192.168.178.2 grafana.homeserver     # 192.168.178.127
dig @192.168.178.2 github.com             # Antwort vom Upstream
resolvectl status | grep -A2 "Current DNS"
getent hosts gotify.homeserver            # 192.168.178.127
```

## Fallstricke

- Updates des Pods unterbrechen DNS für einige Sekunden. `strategyType: Recreate` ist Absicht, weil das RWO-PVC mit den SQLite-Datenbanken sonst von zwei Pods gleichzeitig gemountet würde.
- Bleibt der DNS-Service auf `<pending>`, MetalLB-Pods und IPAddressPool prüfen. Beim ersten Deploy kann der Validating-Webhook von MetalLB zu spät bereit sein; der Pool hat deshalb `sync-wave 1`, notfalls die App in ArgoCD manuell syncen. Zur `loadBalancerClass` siehe [gotchas.md](gotchas.md#metallb--networking).
- `CreateContainerConfigError` heißt: `admin.existingSecret` verweist auf `pihole-admin`, aber das SealedSecret wird nicht gerendert (`adminSecret.enabled: false`) oder wurde für einen anderen Namespace oder Namen gesealt.
- Die Integration ist IPv4-only. Geräte, die per IPv6 den DNS der FritzBox bekommen, umgehen Pi-hole.
- Warum Pods `*.homeserver` über `coredns-custom` statt über Pi-hole auflösen, steht in [gotchas.md](gotchas.md#pi-hole--dns).
