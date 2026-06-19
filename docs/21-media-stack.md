# 21 — Media-Stack (Sonarr / Radarr / Prowlarr / SABnzbd / Seerr)

Usenet-basierter Media-Automations-Stack, der das **bestehende Jellyfin**
(`argocd/apps/jellyfin`, Namespace `jellyfin`) befüllt. Deployt via ArgoCD aus
`argocd/apps/media/` (lokales Helm-Chart, Namespace `media`).

| App | URL | Port | Zweck |
|---|---|---|---|
| Prowlarr | http://prowlarr.homeserver | 9696 | Indexer-Manager (Newznab) |
| SABnzbd | http://sabnzbd.homeserver | 8080 | Usenet-Downloader |
| Sonarr | http://sonarr.homeserver | 8989 | Serien-Automation |
| Radarr | http://radarr.homeserver | 7878 | Film-Automation |
| Seerr | http://seerr.homeserver | 5055 | Request-UI (gegen Jellyfin) |
| media-api-exporter | (intern) | 9108 | Prometheus-Metriken (VMServiceScrape) |

Alle Web-UIs laufen als **ClusterIP + Traefik-Ingress** (kein MetalLB-IP nötig);
Pi-hole löst `*.homeserver` per Wildcard auf `192.168.178.127` auf.

## Architektur

```
SMB-PV "mediastack-data" ── //jays-ugreen/media (RWX, cifs uid/gid 1001)  → /data
   /data/movies     Radarr root folder + Jellyfin "Filme"
   /data/shows      Sonarr root folder + Jellyfin "Serien"
   /data/downloads  SABnzbd complete/ + incomplete/

Prowlarr ──(Indexer)──▶ Sonarr/Radarr ──(Download)──▶ SABnzbd ──▶ /data/downloads
Sonarr/Radarr ──(import: server-side move)──▶ /data/movies | /data/shows
Sonarr/Radarr ──(MediaBrowser-Notify)──▶ jellyfin.jellyfin.svc:8096  (Library-Refresh)
Seerr ──▶ jellyfin.jellyfin.svc:8096  +  sonarr:8989 / radarr:7878
```

Wichtig: Downloads UND Bibliothek liegen im **selben** SMB-Mount → der Import ist
ein serverseitiges, atomares **Rename** (schnell, kein Copy über Mount-Grenzen).
**Hardlinks** funktionieren über SMB/CIFS generell **nicht** (*arr fällt sonst auf
Copy zurück) — bei diesem **Usenet**-Stack ist das egal: es gibt kein Seeding, die
Apps verschieben den Download einfach in die Bibliothek. Daher: *arr auf **Move**
stellen, „Use Hardlinks instead of Copy" **deaktivieren**. (Wer echte Hardlinks
will, müsste den Mount auf **NFS** umstellen statt SMB.)

## 1. NAS vorbereiten

Im bestehenden Share `//jays-ugreen/media` (denselben, den Jellyfin liest):

```
movies/        # existiert bereits (Jellyfin "Filme")
shows/         # existiert bereits (Jellyfin "Serien")
downloads/
  complete/
  incomplete/
```

Der SMB-Account ist derselbe wie für Jellyfin.

## 2. SMB-Credentials sealen (Pflicht — sonst mountet nichts)

kubeseal ist **namespace-gebunden**: die Jellyfin-Creds müssen für `media` neu
gesealt werden.

```sh
echo -n "<smb-username>" | kubeseal --raw \
  --namespace media --name mediastack-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin

echo -n "<smb-password>" | kubeseal --raw \
  --namespace media --name mediastack-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
```

Die zwei Ausgaben in `argocd/apps/media/values.yaml` unter
`smb.encryptedUsername` / `smb.encryptedPassword` eintragen. Solange leer, wird
das SealedSecret übersprungen und die Pods bleiben `ContainerCreating`
(gleiches Muster wie Jellyfin).

## 3. Deployen

```sh
git add argocd/apps/media docs/21-media-stack.md && \
  git commit -m "feat(apps): add media stack" && git push
```

ArgoCD legt den Namespace `media` an und synct (~3 min). Das statische SMB-PV
bindet, danach starten die Pods.

## 4. Erstkonfiguration (UI-Reihenfolge)

Die *arr-Apps und SABnzbd **generieren ihre API-Keys selbst** beim ersten Start
— kein Secret nötig zum Booten. Reihenfolge:

1. **SABnzbd** (http://sabnzbd.homeserver): Wizard durchlaufen, Usenet-Provider
   (Server/Port/User/Pass) eintragen. Ordner: complete → `/data/downloads/complete`,
   incomplete → `/data/downloads/incomplete`.
   ⚠️ **Host-Whitelist**: SABnzbd weist Requests mit unbekanntem Host-Header ab
   ("Access denied - Hostname verification failed"). Beim ersten Zugriff per
   `kubectl -n media port-forward deploy/sabnzbd 8080:8080` öffnen und unter
   *Config → Special → host_whitelist* `sabnzbd.homeserver` ergänzen.
2. **Prowlarr** (http://prowlarr.homeserver): Newznab-Indexer hinzufügen
   (Indexer-API-Key vom Provider). Download-Client → SABnzbd (`sabnzbd:8080`,
   API-Key aus SABnzbd → Config → General). Apps → Sonarr (`http://sonarr:8989`)
   + Radarr (`http://radarr:7878`) mit deren API-Keys (Settings → General).
3. **Sonarr / Radarr**: Auth-Wizard, Root-Folder setzen
   (Sonarr `/data/shows`, Radarr `/data/movies`), Download-Client SABnzbd
   (`sabnzbd:8080`). Optional: Connect → Emby/Jellyfin-Notification auf
   `http://jellyfin.jellyfin.svc.cluster.local:8096` (Library-Auto-Refresh).
4. **Seerr** (http://seerr.homeserver): Wizard → Jellyfin-Server
   `http://jellyfin.jellyfin.svc.cluster.local:8096`, Jellyfin-Login aktivieren,
   Sonarr/Radarr verknüpfen.

## 5. Exporter- & Homepage-Keys nachziehen (optional)

Nach Schritt 4 die API-Keys aus den App-UIs sealen, damit Exporter-Metriken und
Homepage-Widgets funktionieren — alle in **ein** SealedSecret `media-api-keys`:

```sh
for app in sonarr radarr prowlarr sabnzbd jellyfin; do
  echo -n "<$app-api-key>" | kubeseal --raw \
    --namespace media --name media-api-keys \
    --controller-name sealed-secrets-controller \
    --controller-namespace sealed-secrets --from-file=/dev/stdin
done
```

Ausgaben in `values.yaml` unter `apiKeys.{sonarr,radarr,prowlarr,sabnzbd,jellyfin}`
eintragen. (jellyfin-Key: Jellyfin → Dashboard → API-Schlüssel.)

Die Homepage-Widgets nutzen `HOMEPAGE_VAR_{SONARR,RADARR,PROWLARR,SABNZBD,SEERR}_KEY`
aus dem `homepage-credentials`-SealedSecret — dort analog ergänzen (siehe
docs/14-homepage.md).

## 6. Import-Verhalten (Move, nicht Hardlink)

Über SMB/CIFS funktionieren **keine** Hardlinks — das ist eine Protokoll-/
Mount-Limitierung, kein Konfigurationsfehler. Für diesen Usenet-Stack ist das
unkritisch (kein Seeding). In Sonarr/Radarr unter *Settings → Media Management*:
„Use Hard Links instead of Copy" **AUS** lassen, damit importiert wird per Move.

Verifizieren, dass ein Move innerhalb des Mounts schnell (serverseitiges Rename)
ist und nicht über Mount-Grenzen kopiert:

```sh
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sonarr -- sh -c "\
  touch /data/downloads/complete/.mvtest && \
  mv /data/downloads/complete/.mvtest /data/shows/.mvtest && \
  ls -l /data/shows/.mvtest && rm -f /data/shows/.mvtest"'
```

Wenn das ohne Fehler durchläuft, sind Download- und Bibliotheks-Ordner im selben
Mount und Imports sind günstig. (Lägen sie in getrennten Mounts, würde *arr
copy+delete machen — langsam, transient 2× Platz.)

## 7. Aufräumen / Cleanup (keine RAR-Reste in complete/)

Damit `complete/` nach jedem Import rückstandsfrei bleibt, müssen **drei** Dinge
zusammenspielen — sonst sammeln sich RAR-, par2- und `_UNPACK_`-Reste an.

### Folder-Architektur: Unpack auf SSD, nicht auf SMB

SABnzbd entpackt **nicht** auf dem SMB-Mount (langsam, bricht bei Pod-Restarts ab
→ steckengebliebene `_UNPACK_`-Ordner und Retry-Dubletten), sondern auf einer
lokalen **local-path-SSD-PVC** (`sabnzbd-incomplete`, gemountet als
`/incomplete-downloads`, siehe `values.yaml → incomplete`):

```
Download + par2-Repair + Unpack  →  /incomplete-downloads     (SSD, local-path)
fertiges Medium                  →  /data/downloads/complete   (SMB)
*arr-Import (same-FS move)        →  /data/movies | /data/shows (SMB)
```

In **SABnzbd → Config → Folders**:
- *Temporary Download Folder* = `/incomplete-downloads`
- *Completed Download Folder* = `/data/downloads/complete`

> **Gotcha — Ordnerwechsel nur bei leerer Queue:** SABnzbd lehnt das Ändern des
> Temporary/Completed-Ordners ab, solange Jobs in der Queue stehen
> („Ordner kann nicht geändert werden, da die Warteschlange nicht leer ist" —
> *pausiert* zählt **nicht** als leer). Vor dem Umstellen die Queue komplett
> abarbeiten lassen **oder** löschen (Queue → Delete all, „Dateien auch löschen").
> Beim Wechsel auf ein neues `download_dir` werden laufende Teildownloads im alten
> Pfad verwaist → per *Status → Orphaned Jobs → Delete All* aufräumen.

> **Sizing:** Die `sabnzbd-incomplete`-PVC ist `local-path` — die Größe in
> `values.yaml` (`incomplete.size`) ist **nominal und wird nicht erzwungen**
> (hostPath-Bind); die PVC nimmt physisch bis zum freien Node-Platz auf. Ein
> In-place-Vergrößern geht nicht (`allowVolumeExpansion` der SC ist false) —
> für eine echte Anpassung die (leere) PVC löschen und neu rendern lassen. Da
> SAB-Jobs nacheinander durchlaufen (SSD → complete → Library, dann frei), bleibt
> der SSD-Peak weit unter der Nominalgröße.

### SABnzbd Post-Processing + Cleanup-Liste

**Config → Switches → Post-Processing**:
- Default-Post-Processing = **+Delete** (entpacken **und** Archive löschen).
- *Direct Unpack* = **an**.

**Config → Switches → Cleanup List**: `nfo,sfv,srr,par2,jpg,nzb,sub,idx`
⚠️ **niemals** `mkv`/`mp4`/`avi` aufnehmen (löscht sonst die Videos). Hinweis:
Die Cleanup-Liste entfernt nur **direkt heruntergeladene** Dateien, keine aus RAR
entpackten — deshalb ist das *arr-Remove unten zwingend ergänzend.

### Sonarr/Radarr: Completed Download Handling

**Settings → Download Clients → SABnzbd**:
- **Category** setzen: Sonarr `tv`, Radarr `movies`.
- *Completed Download Handling → Remove* = **an** — entfernt nach dem Import die
  ganze Job-Hülle (samt par2/nfo-Resten) aus `complete/`.

### Einmaliges Aufräumen des Altbestands

```sh
# 1. SAB-Queue pausieren (UI) und aktive Downloads prüfen, damit nichts
#    Laufendes getroffen wird.
# 2. Steckengebliebene/verwaiste Ordner zählen:
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  sh -c "find /data/downloads/complete -iname \"*.rar\" | wc -l"'
# 3. _UNPACK_- und Dubletten-Ordner löschen (nach Sichtprüfung):
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  sh -c "rm -rf /data/downloads/complete/_UNPACK_* "'
# 4. Restliche bereits importierte Hüllen entfernen und SAB-History leeren (UI).
```

## Troubleshooting

- **Pods `ContainerCreating`**: SMB-Creds nicht gesealt (Schritt 2) oder Share
  `downloads/` fehlt. `sudo kubectl -n media describe pod <pod>` zeigt den
  Mount-Fehler.
- **SABnzbd "Access denied"**: host_whitelist (Schritt 4.1).
- **Jellyfin sieht neue Medien nicht**: Sonarr/Radarr-Notification auf Jellyfin
  prüfen, oder in Jellyfin Bibliothek manuell scannen. Sicherstellen, dass *arr
  in dieselben Ordner schreiben, aus denen Jellyfin liest.
- **Exporter-Metriken 0**: API-Keys in `media-api-keys` nicht gesetzt
  (Schritt 5) — der Exporter meldet dann `media_exporter_scrape_success 0`.

## Image-Pinning (Follow-up)

Die linuxserver-Images sind aktuell auf `latest` (`values.yaml → images`).
linuxserver-Versions-Tags tragen ein Build-Suffix (z. B. `4.0.x-ls283`), das
nicht geraten wird. Zum Pinnen: aktuelle Tags von
https://hub.docker.com/r/linuxserver/sonarr/tags übernehmen und Renovate-Regel
in `renovate.json` ergänzen.
