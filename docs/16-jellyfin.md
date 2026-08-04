# 16 – Jellyfin (Media-Server + deutsches Live-TV)

Jellyfin läuft als ArgoCD-App im k3s-Cluster, streamt die Medienbibliothek vom
UGREEN-NAS (per SMB3) und bindet frei empfangbare deutsche öffentlich-rechtliche
TV-Sender über Live-TV (M3U + XMLTV) ein. Transcoding nutzt Intel Quick Sync
(VAAPI-Hardwarebeschleunigung der iGPU, siehe
[Hardware-Transcoding](#hardware-transcoding-intel-quick-sync--vaapi)) – Direct
Play bleibt trotzdem der Normalfall, weil es am wenigsten Last erzeugt.

| | |
|---|---|
| URL | <http://jellyfin.homeserver> (LAN + Tailnet, von Pi-hole aufgelöst) |
| Namespace | `jellyfin` |
| Chart | `argocd/apps/jellyfin/` (offizielles `jellyfin`-Chart 3.2.0, App 10.11.10) |
| Storage-Treiber | `argocd/apps/csi-driver-smb/` (kubernetes-csi/csi-driver-smb 1.20.1) |

## Architektur

```
NAS (jays-ugreen, SMB-Share //jays-ugreen/media)        ← Medien liegen hier
        ▲ SMB3 (smb.csi.k8s.io, nodeStageSecretRef → SealedSecret jellyfin-smbcreds)
        │
k3s ─ csi-driver-smb (Controller + Node-DaemonSet, cifs-Mount auf dem Node)
   └─ jellyfin
        ├─ static PV/PVC "jellyfin-media"  → SMB-Share, gemountet als /media
        ├─ config-PVC (local-path, 15Gi)  → /config  (SQLite-DB, NIE aufs NAS!)
        ├─ cache (emptyDir)               → /cache    (Transcode-Scratch)
        └─ Ingress jellyfin.homeserver (traefik, TLS off)
```

Warum diese Aufteilung:

- **Config auf `local-path` (Node-SSD), nicht auf dem NAS** – Jellyfins SQLite-DB
  über CIFS führt zu Lock-/Korruptionsproblemen.
- **Cache als `emptyDir`** – Transcode-Scratch soll die persistente Config-PVC
  nicht volllaufen lassen.
- **Medien per `csi-driver-smb`** statt Host-Mount – GitOps-nativ und
  knotenunabhängig; die Credentials liegen als SealedSecret im Repo.

## Voraussetzungen

### 1. SMB-Share am NAS anlegen

Den dedizierten Share **`media`** einmalig in der UGOS-Oberfläche anlegen
(Control Panel → Shared Folders) und einem SMB-Konto Lese-/Schreibrechte geben
(dasselbe wie beim Scanner geht, siehe `scanner_smb_username`). UGOS verwaltet
Shares in einer eigenen DB — deshalb lässt sich das **Anlegen des Shares** nicht
per Ansible automatisieren, das **Anlegen der Unterordner** dagegen schon
(Schritt 2).

Share prüfen:

```bash
smbclient -L //jays-ugreen -U <smb-user>
```

Weicht der Sharename ab, in `argocd/apps/jellyfin/values.yaml` unter `smb.source`
anpassen (Format `//jays-ugreen/<share>`).

### 1b. Medien-Unterordner per Playbook anlegen

Die Rolle `jellyfin_media` legt `movies/` und `shows/` unterhalb des Shares
idempotent an (Owner/Gruppe werden vom Share geerbt, damit das SMB-Konto
schreiben darf). UGOS legt Shares unter `/volume<x>/<share>` ab; bei mehreren
Volumes `jellyfin_media_base_dir` in `ansible/host_vars/ugreen-nas/vars.yml`
anpassen (Default `/volume1/media`).

```bash
make nas                                   # alle NAS-Dienste inkl. Medienordner
# oder gezielt nur diese Rolle:
ansible-playbook -i ansible/inventory/hosts.yml ansible/ugreen-nas.yml \
  --tags jellyfin-media
```

> Existiert der Share noch nicht (Schritt 1 ausgelassen), bricht die Rolle mit
> einer klaren Fehlermeldung ab statt im falschen Pfad Ordner anzulegen.

### 2. SMB-Credentials als SealedSecret hinterlegen

Die `csi-driver-smb`-Node-Plugin mountet den Share mit Username/Passwort aus dem
Secret `jellyfin-smbcreds`. Beide Werte verschlüsselt mit `kubeseal` erzeugen und
in `values.yaml` (`smb.encryptedUsername` / `smb.encryptedPassword`) eintragen:

```bash
echo -n "<smb-username>" | kubeseal --raw \
  --namespace jellyfin --name jellyfin-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin

echo -n "<smb-password>" | kubeseal --raw \
  --namespace jellyfin --name jellyfin-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
```

> **Wichtig:** Solange die beiden Werte leer sind, schlägt der Medien-Mount fehl
> (Pod bleibt `Pending`/`CrashLoop`). Das ist der einzige manuelle Schritt – ohne
> gültige, gesealte Credentials kann der Cluster den NAS-Share nicht einbinden.

## Deployment

```bash
git add argocd/apps/csi-driver-smb argocd/apps/jellyfin
git commit -m "feat(apps): add jellyfin media server + smb csi driver"
git push
# ArgoCD erkennt beide Ordner in ~3 min; Namespaces werden automatisch erstellt.
```

ArgoCD legt zuerst `csi-driver-smb` und `jellyfin` als Apps an. Der CSI-Treiber
sollte vor dem ersten erfolgreichen Jellyfin-Mount laufen.

## Ersteinrichtung (Jellyfin-UI)

1. <http://jellyfin.homeserver> öffnen → Setup-Assistent.
2. Medienbibliothek hinzufügen, Pfad **`/media`** (bzw. `/media/movies`,
   `/media/shows`).

## Zugang (LAN / Smart-TV / Tailnet / Shared Nodes)

Jellyfin ist auf drei Wegen erreichbar:

| Client | Adresse | Weg |
|---|---|---|
| Browser / Tailnet | <http://jellyfin.homeserver> | Traefik-Ingress (Host-basiert), via Pi-hole aufgelöst |
| Smart-TV im LAN (ohne Tailscale) | `http://192.168.178.3:8096` | dedizierte MetalLB-LoadBalancer-IP, direkt am Traefik vorbei |
| Tailscale Shared Node (nur Homeserver geteilt) | `http://<tailscale-ip>:8096` | Klipper-LB `jellyfin-tailscale`, hostPort auf allen Interfaces inkl. `tailscale0` |

**Warum die feste IP für den TV:** Eine rohe Server-IP (`192.168.178.127`) trifft
keine Traefik-Regel (Traefik routet nach Hostname/Host-Header) → 404. Smart-TV-
Jellyfin-Apps kommen mit `.homeserver`-Namen zudem oft nicht klar. Darum bekommt
Jellyfin über MetalLB eine eigene LAN-IP (`192.168.178.3`), die der TV direkt als
`http://192.168.178.3:8096` ansprechen kann.

> **Voraussetzung:** `192.168.178.3` muss frei und **außerhalb des FritzBox-DHCP-
> Bereichs** liegen (gleiche Regel wie die Pi-hole-IP `.2`). DHCP-Bereich prüfen:
> FritzBox → Heimnetz → Netzwerk → Netzwerkeinstellungen → IPv4-Adressen.
>
> **Andere IP nötig?** An zwei Stellen ändern (plus DHCP-Ausschluss in der
> FritzBox): `argocd/apps/metallb/templates/ipaddresspool-jellyfin.yaml` (Pool)
> und `argocd/apps/jellyfin/values.yaml` (`jellyfin.service.loadBalancerIP`).

Im Jellyfin-TV-App also als Server `http://192.168.178.3:8096` eintragen.

## Tailscale Shared Nodes

Geräte, denen **nur der Homeserver-Node** per Tailscale Node-Sharing geteilt
wurde (z. B. Geräte von Freunden außerhalb des eigenen Tailnets), können weder
`jellyfin.homeserver` auflösen (kein Pi-hole-DNS) noch LAN-IPs wie
`192.168.178.3` erreichen. Für sie existiert der Service `jellyfin-tailscale`
(`argocd/apps/jellyfin/templates/service-tailscale.yaml`): ein
LoadBalancer-Service **ohne** `loadBalancerClass`, den k3s' Klipper ServiceLB
übernimmt und als hostPort `0.0.0.0:8096` auf dem Node bindet — also auch auf
`tailscale0`.

- **Adresse:** `http://<tailscale-ip>:8096` — die Tailscale-IPv4 des Servers
  liefert `tailscale ip -4` (auf dem Server) bzw. die Tailscale Admin Console.
  Alternativ funktioniert für Sharees auch der MagicDNS-Name des geteilten
  Nodes: `http://homeserver.<tailnet>.ts.net:8096`.
- **ACLs:** Die Tailnet-ACLs des Sharers müssen den Sharees Port 8096 auf dem
  Homeserver erlauben (z. B. Grant für `autogroup:shared`), analog zum
  Gameserver-Muster in `docs/19-gameserver.md`. Wegen der dort beschriebenen
  Shared-Node/Tag-ACL-Reibung ([tailscale/tailscale#14445](https://github.com/tailscale/tailscale/issues/14445))
  den Grant im Zweifel direkt auf die Tailscale-IP statt auf ein Tag schreiben.
- **Nebeneffekt:** Der hostPort bindet alle Interfaces — Jellyfin ist dadurch
  zusätzlich unter der Node-LAN-IP `http://192.168.178.127:8096` erreichbar
  (harmlos; UFW erlaubt LAN und Tailscale-CGNAT-Range ohnehin).
- Der bestehende MetalLB-Service (`192.168.178.3`) und der Traefik-Ingress
  bleiben davon unberührt.

## Deutsches Live-TV (M3U + XMLTV)

Jellyfin speichert Tuner/EPG in seiner DB – das wird **nicht** über GitOps,
sondern einmalig in der UI konfiguriert (Dashboard → **Live TV**).

1. **Tuner-Geräte → +** → Typ **M3U Tuner** → URL einer legalen, frei
   empfangbaren Senderliste eintragen. Bewährte Quelle: die kodinerds-„Free TV"-
   Liste (Deutschland, öffentlich-rechtlich): <https://github.com/jnk22/kodinerds-iptv>
   (Datei für frei empfangbare deutsche Sender wählen).
2. **TV-Programmdaten → XMLTV** → deutsche EPG-Quelle eintragen, z. B. aus
   <https://github.com/iptv-org/epg> (`de`-Guides) oder die kodinerds-EPG.
3. Programmführer aktualisieren und Sender den EPG-Einträgen zuordnen.

> **Hinweis (Quellen sind volatil):** öffentliche Stream-URLs ändern sich häufig.
> Die oben genannten Repos zur Einrichtungszeit auf aktuelle Listen prüfen.

## Hardware-Transcoding (Intel Quick Sync / VAAPI)

Der Node hat eine Intel UHD 630 iGPU (i5-9500T), die H.264/HEVC (8- und
10-bit) per Quick Sync hardwarebeschleunigt de-/encodieren kann. Das entlastet
die CPU massiv gegenüber Software-Transcoding – wichtig für 4K, wo
Software-Transcoding das CPU-Limit (4 Kerne, siehe unten) regelmäßig sprengt
und zu Ruckeln/Puffern führt.

**Voraussetzung (automatisch via Ansible, nur Diagnose):** Die Rolle `common`
(`ansible/roles/common/tasks/main.yml`) installiert `intel-media-va-driver-non-free`
+ `vainfo` und gibt bei jedem Lauf die VAAPI-Fähigkeiten sowie die GID der
Host-Gruppe `render` aus (`getent group render`). Das Jellyfin-Image bringt
seine eigenen VAAPI-Userspace-Treiber bereits mit ([offizielle Doku](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/intel/));
die Host-Pakete dienen nur dazu, die Hardware-Fähigkeit vorab zu bestätigen.

**Pod-Konfiguration (`argocd/apps/jellyfin/values.yaml`):** `/dev/dri` wird per
`hostPath`-Volume in den Pod gemountet, `podSecurityContext.supplementalGroups`
enthält die reale GID der `render`-Gruppe (aktuell `991`, per `getent group
render` auf dem Node bestätigt) **und** `securityContext.privileged: true` ist
gesetzt.

> **Warum `privileged: true` nötig ist (live verifiziert):** Auf diesem
> k3s/containerd-Setup gilt `device_ownership_from_security_context=false`
> (Standard). Ein reiner `hostPath`-Mount von `/dev/dri` gewährt – anders als
> Dockers `--device`-Flag – **keine** Device-Cgroup-Freigabe; ein Testpod mit
> korrekter `supplementalGroups`-GID aber ohne `privileged` scheiterte beim
> Öffnen von `/dev/dri/renderD128` mit `EPERM`. `privileged: true` umgeht das.
> Sauberer (aber aufwändiger) wäre der
> [Intel GPU Device Plugin](https://github.com/intel/intel-device-plugins-for-kubernetes)
> oder das Umschalten von `device_ownership_from_security_context` in der
> containerd-Config des Node – für einen Single-Node-Homelab mit einem
> einzelnen vertrauenswürdigen Media-Server-Container ist `privileged: true`
> hier der pragmatische Weg (der Container läuft ohnehin schon als root).

**Aktivierung in der Jellyfin-UI** (Config-DB, nicht GitOps-verwaltet):
Dashboard → **Wiedergabe** → Transcoding:

1. Hardwarebeschleunigung: **Intel QuickSync (QSV)**
2. VA-API-Gerät: `/dev/dri/renderD128`
3. Hardware-Decodierung aktivieren für **H264** und **HEVC**
4. „Hardware-Encodierung aktivieren" anhaken
5. **AV1 nicht aktivieren** – die UHD 630 (Gen9.5) hat kein AV1-Hardware-Decode

**Verifikation:** Das `jellyfin/jellyfin`-Image hat kein globales `vainfo` im
PATH; das gebündelte `jellyfin-ffmpeg` bringt aber sein eigenes mit:

```bash
sudo kubectl -n jellyfin exec deploy/jellyfin -- \
  /usr/lib/jellyfin-ffmpeg/vainfo --display drm
```

Das zeigt die verfügbaren VAAPI-Profile im Pod. Läuft ein Transcode aktiv,
markiert das Jellyfin-Dashboard (Wiedergabe) die Session mit einem
„HW"-Badge statt reinem Software-Transcode.

## Troubleshooting

- **Pod `Pending`, PVC `jellyfin-media` nicht `Bound`** → Credentials fehlen oder
  sind falsch gesealt; SealedSecret-Status prüfen:
  `sudo kubectl -n jellyfin get sealedsecret,secret`. Mount-Fehler des
  Node-Plugins: `sudo kubectl -n csi-driver-smb logs -l app=csi-smb-node -c smb`.
- **`/media` leer** → Sharename/Pfad in `smb.source` prüfen; am Host gegentesten:
  `smbclient -L //jays-ugreen -U <user>`.
- **Hohe CPU-Last / Ruckeln (v. a. bei 4K)** → im Dashboard → Wiedergabe
  prüfen, ob die Session ein „HW"-Badge zeigt. Fehlt es, läuft
  Software-Transcoding statt Quick Sync (siehe
  [Hardware-Transcoding](#hardware-transcoding-intel-quick-sync--vaapi)) –
  z. B. weil `privileged`/`supplementalGroups` in `values.yaml` fehlen (Pod-Logs
  zeigen dann `EPERM`/`Permission denied` auf `/dev/dri/renderD128`), oder
  der Client-Codec/Container nicht von der iGPU unterstützt wird. Alternativ
  Client-Qualität auf „Direct Play"/Original stellen oder Bitrate begrenzen;
  auch mit Hardware-Transcoding verträgt der Node nur wenige parallele
  Sessions (CPU-Limit: 4 Kerne für Audio/Untertitel/Deinterlacing).
- **Live-TV: kein Ton bei einzelnen ZDF-Sendern** → manche ZDF-`m3u8` haben
  getrennte Audio-/Video-Spuren, die Jellyfins LiveTV-Pipeline nicht sauber
  mischt (jellyfin/jellyfin#7267). Betroffene Sender aus der M3U-Liste entfernen.
- **DB-Fehler nach Umzug** → die Config-PVC ist absichtlich `local-path`; die
  SQLite-DB niemals auf den NAS legen.
