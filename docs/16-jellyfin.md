# Jellyfin

Jellyfin streamt die Medienbibliothek vom UGREEN-NAS (SMB3) und zeigt frei empfangbares deutsches Live-TV
(M3U + XMLTV). Transcoding läuft über Intel Quick Sync, Direct Play bleibt der Normalfall.

| | |
|---|---|
| URL | http://jellyfin.homeserver · TV im LAN: `http://192.168.178.3:8096` · Tailscale-Sharees: `http://<tailscale-ip>:8096` |
| Namespace | `jellyfin` |
| Quelle | [`argocd/apps/jellyfin/`](../argocd/apps/jellyfin/), SMB-Treiber [`argocd/apps/csi-driver-smb/`](../argocd/apps/csi-driver-smb/) |
| Chart | `jellyfin-helm/jellyfin` 3.7.0, Image `jellyfin/jellyfin` 10.11.11 · `csi-driver-smb` 1.20.4 |
| NAS-Rolle | `ansible/roles/jellyfin_media/` (`make nas`) |

## Architektur

```text
//jays-ugreen/media  ── SMB3, csi-driver-smb, Secret jellyfin-smbcreds
        │
jellyfin (Deployment, Strategy Recreate)
  ├─ PV/PVC jellyfin-media   → /media   (statisch, RWX, cifs uid/gid 0)
  ├─ PVC config (local-path) → /config  (15Gi, SQLite-DB)
  ├─ emptyDir                → /cache   (Transcode-Scratch)
  └─ hostPath /dev/dri       → Quick Sync
```

Die Config-PVC liegt auf der Node-SSD, weil SQLite über CIFS sperrt und korrumpiert. Sie trägt
`Delete=false,Prune=false`, damit ArgoCD sie beim Löschen der App nicht mitnimmt. Der Cache ist ein `emptyDir`,
damit Transcodes die Config-PVC nicht füllen.

## Zugang

| Client | Adresse | Weg |
|---|---|---|
| Browser (LAN, Tailnet) | http://jellyfin.homeserver | Traefik-Ingress, Pi-hole-DNS |
| Smart-TV im LAN ohne Tailscale | `http://192.168.178.3:8096` | MetalLB-Pool `jellyfin`, am Traefik vorbei |
| Tailscale-Sharee (nur der Homeserver-Node geteilt) | `http://<tailscale-ip>:8096` oder `http://homeserver.<tailnet>.ts.net:8096` | Service `jellyfin-tailscale` (Klipper, hostPort 8096) |

Der TV braucht die eigene IP, weil Traefik nach Hostnamen routet und eine nackte Server-IP auf 404 läuft. Die
Adresse `192.168.178.3` muss außerhalb des FritzBox-DHCP-Bereichs liegen. Für eine andere IP beide Stellen ändern:
[`ipaddresspool-jellyfin.yaml`](../argocd/apps/metallb/templates/ipaddresspool-jellyfin.yaml) und
`jellyfin.service.loadBalancerIP` in [`values.yaml`](../argocd/apps/jellyfin/values.yaml).

Sharees lösen keine `.homeserver`-Namen auf und erreichen keine LAN-IPs. Für sie bindet Klipper Port 8096 auf allen
Node-Interfaces, also auch auf `tailscale0` (und nebenbei auf `192.168.178.127:8096`). Die Tailnet-ACL muss
`autogroup:shared` Port 8096 auf dem Homeserver erlauben, am besten per Grant direkt auf die Tailscale-IP (siehe
[Gotchas: KubeVirt / Gameserver](gotchas.md#kubevirt--gameserver), Punkt Node-Sharing).

## Einrichtung

1. Share `media` einmalig in UGOS anlegen (Control Panel > Shared Folders) und dem SMB-Konto Schreibrechte geben.
   UGOS verwaltet Shares in einer eigenen Datenbank, Ansible kann das nicht.
2. `make nas` legt `movies/` und `shows/` unter `jellyfin_media_base_dir` (Default `/volume1/media`, in
   `ansible/host_vars/ugreen-nas/vars.yml`) an. Fehlt der Share, bricht die Rolle mit einer Meldung ab.
3. SMB-Zugangsdaten für den Namespace `jellyfin` sealen und als `smb.encryptedUsername` und
   `smb.encryptedPassword` in `values.yaml` eintragen. Solange beide leer sind, rendert kein SealedSecret und der
   Medien-Mount schlägt fehl.

```bash
echo -n "<smb-username>" | kubeseal --raw \
  --namespace jellyfin --name jellyfin-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
# dasselbe für <smb-password>
```

4. Im Setup-Assistenten die Bibliotheken `/media/movies` und `/media/shows` anlegen.

## Live-TV

Tuner und EPG liegen in Jellyfins Datenbank und werden in der UI gepflegt (Dashboard > Live TV):

- Tuner-Gerät vom Typ M3U mit einer Liste frei empfangbarer deutscher Sender, z. B. aus
  [kodinerds-iptv](https://github.com/jnk22/kodinerds-iptv).
- XMLTV-Programmdaten, z. B. die `de`-Guides aus [iptv-org/epg](https://github.com/iptv-org/epg).

Öffentliche Stream-URLs ändern sich oft. Bei Ausfällen zuerst die Listen aktualisieren.

## Hardware-Transcoding

Die iGPU des Nodes (i5-9500T, UHD 630) decodiert und encodiert H.264 und HEVC (8 und 10 Bit). In `values.yaml` sind
dafür `/dev/dri` als `hostPath`, `supplementalGroups: [991]` (GID der Host-Gruppe `render`) und
`privileged: true` gesetzt. Die `common`-Rolle installiert `intel-media-va-driver-non-free` und `vainfo` nur zur
Diagnose und gibt die `render`-GID aus. Das Jellyfin-Image bringt eigene VAAPI-Treiber mit.

In der UI aktivieren (Dashboard > Wiedergabe > Transcoding): Intel QuickSync (QSV), Gerät `/dev/dri/renderD128`,
Hardware-Decodierung für H264 und HEVC, Hardware-Encodierung an. AV1 aus lassen, die UHD 630 kann es nicht.

```bash
sudo kubectl -n jellyfin exec deploy/jellyfin -- /usr/lib/jellyfin-ffmpeg/vainfo --display drm
```

Ein laufender Hardware-Transcode trägt im Dashboard das Badge „HW“.

## Betrieb

```bash
sudo kubectl -n jellyfin get pods,pvc,sealedsecret,secret
sudo kubectl -n csi-driver-smb logs -l app=csi-smb-node -c smb   # Mount-Fehler
smbclient -L //jays-ugreen -U <smb-user>                           # Share von außen prüfen
```

## Fallstricke

- `privileged: true` ist nötig. containerd läuft mit `device_ownership_from_security_context=false`, ein reiner
  `hostPath`-Mount gibt keine Device-Cgroup frei, und ohne `privileged` endet das Öffnen von `/dev/dri/renderD128`
  mit `EPERM`. Fehlt das Badge „HW“ und ruckelt 4K, zuerst danach in den Pod-Logs suchen.
- Bleibt der Pod `Pending` und die PVC `jellyfin-media` ungebunden, fehlen die gesealten SMB-Zugangsdaten oder sie
  gehören zu einem anderen Namespace.
- Bei manchen ZDF-Streams fehlt der Ton, weil Audio und Video getrennt kommen
  ([jellyfin#7267](https://github.com/jellyfin/jellyfin/issues/7267)). Diese Sender aus der M3U-Liste nehmen.
- Den Service `jellyfin-tailscale` nicht mit `loadBalancerClass` versehen, siehe
  [Gotchas: MetalLB](gotchas.md#metallb--networking).

## Siehe auch

- [Media-Stack](21-media-stack.md) befüllt die Bibliothek.
- [Pi-hole](15-pihole.md) für die `*.homeserver`-Auflösung.
