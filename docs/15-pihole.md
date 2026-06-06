# Pi-hole — netzwerkweiter Werbe-/Tracker-Blocker

[Pi-hole](https://pi-hole.net) läuft als ArgoCD-verwaltete App im k3s-Cluster
(`argocd/apps/pihole/`) und blockt Werbung/Tracker für **alle Geräte** im
Heimnetz hinter der FritzBox. Die DNS-Anfragen aller Clients laufen über
Pi-hole; `*.homeserver`-Namen werden an das bestehende Host-dnsmasq
weitergeleitet, alles andere geht upstream ins Internet.

```
FritzBox (DHCP)  ──"Lokaler DNS-Server = 192.168.178.2"──►  alle LAN-Geräte
                                                                  │
                                                                  ▼
                                       Pi-hole @ 192.168.178.2:53  (k3s, MetalLB)
                                          │                         │
              *.homeserver  ──────────────┘                         └──── alles andere
              server=/homeserver/192.168.178.127 (dnsmasq)                 DNS1 192.168.178.1 (FritzBox)
                                                                           DNS2 9.9.9.9 (Quad9)
Web-UI:  http://pihole.homeserver   (Traefik-Ingress)
```

## Warum MetalLB?

Der Host belegt Port 53 bereits mit **dnsmasq** (`192.168.178.127:53`, serviert
`*.homeserver` für LAN + Tailnet, siehe [`09-dns-architecture.md`](09-dns-architecture.md)).
Pi-hole braucht ebenfalls Port 53. k3s' eingebauter Klipper-LoadBalancer würde
die Node-IP `.127` benutzen und mit dnsmasq kollidieren. Deshalb vergibt
**MetalLB** (L2/ARP, `argocd/apps/metallb/`) Pi-hole eine **eigene, freie
LAN-IP** — `192.168.178.2` — auf der Pi-hole sein eigenes `:53` bekommt.

Damit Klipper diesen Service *nicht* zusätzlich beansprucht, setzt der
Pi-hole-DNS-Service `spec.loadBalancerClass: metallb.universe.tf/metallb` —
Klipper ignoriert Services mit fremder `loadBalancerClass`, MetalLB übernimmt.
k3s selbst bleibt damit unangetastet.

## Voraussetzung: freie IP außerhalb des FritzBox-DHCP-Bereichs

`192.168.178.2` muss **außerhalb** des DHCP-Bereichs der FritzBox liegen,
sonst kann die FritzBox die IP an ein anderes Gerät vergeben (ARP-Konflikt).

Prüfen:

1. `http://fritz.box` → anmelden
2. **Heimnetz → Netzwerk → Netzwerkeinstellungen → IPv4-Adressen**
3. DHCP-Server-Bereich ablesen, z.B. „von **192.168.178.20** bis **.200**"

Liegt `.2` außerhalb (Standard-FritzBox: Bereich startet bei `.20`) → passt.
Andernfalls eine andere freie IP wählen und **an drei Stellen** anpassen:

- `argocd/apps/metallb/templates/ipaddresspool.yaml` (`addresses:`)
- `argocd/apps/pihole/values.yaml` (`serviceDns.loadBalancerIP`)
- den FritzBox-Schritt unten

## 1. Erstdeploy

### 1.1 Deployen (committen & pushen)

```bash
git add -A   # pihole + metallb + docs + CLAUDE.md
git commit -m "feat(apps): add pihole + metallb"
git push
```

ArgoCD entdeckt beide Apps automatisch (~3 min); die Namespaces `metallb` und
`pihole` werden angelegt. Die App wird **Healthy** — die Web-UI hat per Default
**kein Passwort** (der Ingress ist nur im LAN/Tailnet erreichbar). Setze das
Passwort daher zeitnah (Schritt 1.2).

### 1.2 Admin-Passwort setzen (dringend empfohlen)

Der SealedSecret-Controller (`argocd/apps/sealed-secrets/`) akzeptiert nur
Ciphertext, der mit seinem Public Key erzeugt wurde. Einfachster Weg über die
Web-UI <http://kubeseal-webgui.homeserver>:

1. Öffnen, ausfüllen:
   - **Namespace**: `pihole`
   - **Secret name**: `pihole-admin`
   - **Key**: `password`
   - **Value**: dein gewünschtes Admin-Passwort
2. **Encrypt**, langen base64-String kopieren.

Oder per CLI (Workstation mit `kubeseal` + Cluster-Cert):

```bash
echo -n 'DEIN_ADMIN_PW' \
  | kubeseal --raw \
      --namespace pihole \
      --name pihole-admin \
      --controller-name sealed-secrets-controller \
      --controller-namespace sealed-secrets \
      --from-file=/dev/stdin
```

Dann in `argocd/apps/pihole/values.yaml` **drei** Werte setzen und
committen/pushen:

```yaml
pihole:
  admin:
    existingSecret: pihole-admin   # vorher: ""
# ...
adminSecret:
  enabled: true                    # vorher: false
  secretName: pihole-admin
  encryptedPassword: "AgB...<dein-kubeseal-output>..."
```

ArgoCD entschlüsselt das Secret; Pi-hole übernimmt das Passwort beim nächsten
Pod-Start. (Wer `admin.existingSecret` setzt, aber `adminSecret.enabled` auf
`false` vergisst, bekommt `CreateContainerConfigError`, weil das referenzierte
Secret dann fehlt — beides zusammen setzen.)

### 1.3 FritzBox auf Pi-hole zeigen

**Heimnetz → Netzwerk → Netzwerkeinstellungen → IPv4-Adressen** →
Feld **„Lokaler DNS-Server"** auf `192.168.178.2` setzen, speichern.

Clients übernehmen die Änderung erst beim nächsten DHCP-Lease-Renew — am
schnellsten durch kurzes Trennen/Neuverbinden des Netzwerks.

> **Bewusster Tradeoff:** Damit wird Pi-hole zum primären DNS für das ganze
> LAN. Die FritzBox kann per DHCP nur **eine** DNS-IP verteilen, es gibt also
> keinen automatischen Client-Fallback — fällt Pi-hole (bzw. der Home-Server)
> aus, ist LAN-DNS weg. Das ist dieselbe SPOF-Klasse wie der restliche Stack,
> der ohnehin auf diesem einen Node läuft. Schnelles Rollback: Feld wieder
> leeren (siehe unten).

## 2. Verifikation

```bash
# Apps & Service-IP
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl get applications -n argocd | grep -E "pihole|metallb"'
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl -n metallb get ipaddresspool,l2advertisement'
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl -n pihole get svc'
#   → der DNS-Service zeigt EXTERNAL-IP 192.168.178.2

# DNS-Funktion (vom Server oder einem LAN-Client)
dig @192.168.178.2 doubleclick.net      # → geblockt (0.0.0.0)
dig @192.168.178.2 grafana.homeserver   # → 192.168.178.127 (Forward an dnsmasq)
dig @192.168.178.2 github.com           # → echte Auflösung (Upstream)

# dnsmasq bleibt unberührt
dig @192.168.178.127 grafana.homeserver # → weiter ok
```

Web-UI: <http://pihole.homeserver> → Login mit dem Admin-Passwort aus 1.2
(bzw. ohne Passwort, falls noch nicht gesetzt).

Per-Client-Test: an einem Client nach dem Lease-Renew `nslookup doubleclick.net`
→ geblockt; die Anfrage taucht im Pi-hole-Query-Log mit der Client-IP auf.

## 3. Troubleshooting

- **DNS-Service bleibt `<pending>`** → MetalLB-Controller/Speaker prüfen
  (`kubectl -n metallb get pods`); IPAddressPool vorhanden? `.2` außerhalb des
  DHCP-Bereichs? Bei frischem Deploy kann der Validating-Webhook von MetalLB
  beim ersten Sync zu spät sein — ArgoCD-Retry (`sync-wave 1`) konvergiert das,
  notfalls App in ArgoCD manuell *Sync*en.
- **Pod `CreateContainerConfigError`** → `admin.existingSecret: pihole-admin`
  gesetzt, aber `adminSecret.enabled` noch `false` (Secret wird nicht gerendert)
  oder Cipher für falschen Namespace/Namen gesealt. Beides zusammen setzen
  (Schritt 1.2).
- **`*.homeserver` löst nicht auf** → `customDnsEntries` greift nur, wenn
  Host-dnsmasq auf `192.168.178.127:53` erreichbar ist; vom Pod testen:
  `kubectl -n pihole exec deploy/pihole -- dig @192.168.178.127 grafana.homeserver`.
- **Service bleibt `<pending>` trotz laufendem MetalLB** → die `loadBalancer
  Class` muss auf **beiden** Seiten identisch sein: am Pi-hole-DNS-Service
  (`serviceDns.loadBalancerClass`) **und** am MetalLB-Controller
  (`metallb.loadBalancerClass` in `argocd/apps/metallb/values.yaml`). MetalLB
  ignoriert klassifizierte Services, wenn sein eigener `--lb-class` nicht passt.
- **Zwei EXTERNAL-IPs / Klipper greift mit** → k3s' ServiceLB (Klipper)
  überspringt Services mit gesetzter `loadBalancerClass` erst ab **k3s ≥ v1.26**.
  Bei älterem k3s die Klasse-Kopplung nicht nutzen, sondern ServiceLB ganz
  deaktivieren: in der k3s-Rolle `--disable servicelb` setzen, `make k3s` neu
  laufen lassen, und die `loadBalancerClass`-Zeilen aus beiden Charts entfernen
  (MetalLB übernimmt dann alle klassenlosen LB-Services). Das Repo floatet auf
  aktuelles k3s, daher ist die Klasse-Kopplung der Default.
- **IPv6-Leak** → Geräte mit IPv6 nutzen evtl. weiter den FritzBox-DNS und
  umgehen Pi-hole. Diese Integration ist bewusst IPv4-only; IPv6 (Pi-hole per
  RA/DHCPv6 oder IPv6-DNS in der FritzBox abschalten) ist ein Folgeschritt.

## 4. Tailscale-Geräte (VPN)

### `.homeserver`-Auflösung bleibt unberührt

Die bestehende **Tailscale-Split-DNS**-Regel (Domain `homeserver` → Tailscale-IP
des Servers, beantwortet von dnsmasq auf `tailscale0`) funktioniert **unverändert
weiter** — Pi-hole läuft auf der LAN-IP `.2` und berührt `tailscale0` nicht.
Dafür ist **nichts zu tun**. Test auf einem Tailscale-Gerät:
`nslookup grafana.homeserver` → `192.168.178.127`.

### Optional: Adblocking auch unterwegs

Standardmäßig blockt Pi-hole nur Geräte, die **zu Hause am LAN** hängen
(FritzBox → Pi-hole). Tailscale-Geräte bekommen **unterwegs kein** Pi-hole, weil
ihr Split DNS nur die Domain `homeserver` zum Server routet, nicht den restlichen
Traffic. Wer Adblocking auch remote will, macht Pi-hole zum **globalen
Tailscale-Nameserver**.

**Voraussetzungen (im Repo schon vorbereitet):**

- Die Tailscale-Rolle advertised `--advertise-routes=192.168.178.0/24`
  (`ansible/roles/tailscale/tasks/main.yml`). Die Route muss in der
  [Tailscale-Konsole → Machines](https://login.tailscale.com/admin/machines)
  **approved** sein.
- Jedes Gerät, das Remote-Adblocking will, braucht „Use Tailscale subnets" /
  `--accept-routes` aktiv — sonst ist `192.168.178.2` außerhalb des Heim-LANs
  nicht erreichbar.

**Einrichtung** ([Tailscale-Konsole → DNS](https://login.tailscale.com/admin/dns)):

1. **Nameservers → Add nameserver → Custom** → IP `192.168.178.2`, **ohne**
   „Restrict to search domain" (= globaler Nameserver).
2. **Override local DNS** aktivieren, damit die Geräte Pi-hole auch wirklich
   benutzen.
3. Die bestehende `homeserver`-Split-DNS-Regel kannst du behalten (greift als
   spezifischere Regel) oder entfernen — Pi-hole löst `.homeserver` ohnehin auf
   (Forward an dnsmasq).

Tailscale tunnelt DNS-Anfragen an einen per Subnet-Router erreichbaren privaten
Nameserver über WireGuard — `192.168.178.2` als Nameserver funktioniert also,
solange die Subnet-Route approved und auf dem Client akzeptiert ist.

**Stolpersteine (damit nichts schiefgeht):**

- **Exit-Node überschreibt DNS:** Nutzt ein Gerät einen Exit-Node, verwendet es
  per Default dessen DNS. Pro Nameserver in der Tailscale-Konsole die Option
  „use this nameserver even when an exit node is in use" aktivieren, sonst greift
  Pi-hole dort nicht.
- **Per-Client-Stats gehen remote verloren (SNAT):** Der Subnet-Router maskiert
  weitergeleiteten Traffic per Default — Pi-hole sieht alle Remote-Anfragen mit
  der LAN-IP des Home-Servers als *einen* Client. Wer echte Per-Client-Stats
  will, setzt am Server `tailscale up … --snat-subnet-routes=false` (Linux-only)
  und muss dann Rückrouten einrichten — für den Heim-Use-Case meist nicht den
  Aufwand wert.
- **DNS-Rebinding-Schutz:** Manche Resolver/Setups blocken private IPs in
  DNS-Antworten. Falls `*.homeserver` über Tailscale `NXDOMAIN`/`0.0.0.0`
  liefert (statt `192.168.178.127`), in Pi-hole unter
  *Settings → DNS → „Allow rebinding"* (bzw. FTL `dns.allowRebinding`) das
  Blocken privater Antworten erlauben. Die explizite `server=/homeserver/…`-
  Weiterleitung ist davon i.d.R. nicht betroffen, der Punkt ist nur zur
  Sicherheit notiert.

**Tradeoff / SPOF:** Mit globalem Nameserver hängt die *komplette* DNS-Auflösung
dieser Geräte an Pi-hole. Ist der Home-Server unten, haben sie auch unterwegs
**gar kein** DNS mehr — die enge `homeserver`-Regel allein hat dieses Risiko
nicht. Schnelles Rollback: globalen Nameserver in der Konsole wieder entfernen.

Verifikation (Tailscale-Gerät, unterwegs / über Mobilfunk):

```bash
nslookup doubleclick.net     # → geblockt (Pi-hole)
nslookup grafana.homeserver  # → 192.168.178.127
```

## 5. Rollback

- **Schnell (Clients zurück auf FritzBox-DNS):** FritzBox-Feld „Lokaler
  DNS-Server" wieder leeren.
- **Vollständig:** Verzeichnisse `argocd/apps/pihole/` und
  `argocd/apps/metallb/` entfernen, committen, pushen — ArgoCD entfernt beide
  Apps automatisch (prune). dnsmasq auf `.127` läuft unverändert weiter.
