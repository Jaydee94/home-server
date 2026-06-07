# 16 – Jellyfin (Media-Server + deutsches Live-TV)

Jellyfin läuft als ArgoCD-App im k3s-Cluster, streamt die Medienbibliothek vom
UGREEN-NAS (per SMB3) und bindet frei empfangbare deutsche öffentlich-rechtliche
TV-Sender über Live-TV (M3U + XMLTV) ein. Transcoding erfolgt **CPU-only**
(kein GPU-Passthrough) – darum ist Direct Play der Normalfall.

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

Auf dem UGREEN-NAS einen dedizierten Medien-Share anlegen, z. B. `media` mit
Unterordnern `movies/` und `shows/`. Lese-/Schreibrechte für ein SMB-Konto
vergeben (dasselbe wie beim Scanner geht, siehe `scanner_smb_username`).

Share prüfen:

```bash
smbclient -L //jays-ugreen -U <smb-user>
```

Weicht der Sharename/Pfad ab, in `argocd/apps/jellyfin/values.yaml` unter
`smb.source` anpassen (Format `//jays-ugreen/<share>`).

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

## Troubleshooting

- **Pod `Pending`, PVC `jellyfin-media` nicht `Bound`** → Credentials fehlen oder
  sind falsch gesealt; SealedSecret-Status prüfen:
  `sudo kubectl -n jellyfin get sealedsecret,secret`. Mount-Fehler des
  Node-Plugins: `sudo kubectl -n csi-driver-smb logs -l app=csi-smb-node -c smb`.
- **`/media` leer** → Sharename/Pfad in `smb.source` prüfen; am Host gegentesten:
  `smbclient -L //jays-ugreen -U <user>`.
- **Hohe CPU-Last / Ruckeln** → ein Client transkodiert. Client-Qualität auf
  „Direct Play"/Original stellen oder Bitrate begrenzen; CPU-only verträgt nur
  wenige parallele Transcodes (Limit: 4 Kerne).
- **Live-TV: kein Ton bei einzelnen ZDF-Sendern** → manche ZDF-`m3u8` haben
  getrennte Audio-/Video-Spuren, die Jellyfins LiveTV-Pipeline nicht sauber
  mischt (jellyfin/jellyfin#7267). Betroffene Sender aus der M3U-Liste entfernen.
- **DB-Fehler nach Umzug** → die Config-PVC ist absichtlich `local-path`; die
  SQLite-DB niemals auf den NAS legen.
