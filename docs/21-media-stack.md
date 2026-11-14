# Media-Stack

Usenet-Automatisierung für [Jellyfin](16-jellyfin.md): Prowlarr verwaltet die Indexer, Sonarr und Radarr suchen
Serien und Filme, SABnzbd lädt, Seerr nimmt Wünsche entgegen.

| | |
|---|---|
| Namespace | `media` |
| Quelle | [`argocd/apps/media/`](../argocd/apps/media/) (lokales Chart ohne Upstream-Dependency) |
| Images | linuxserver.io (`sonarr`, `radarr`, `prowlarr`, `sabnzbd`), `ghcr.io/seerr-team/seerr`, gepinnt in `values.yaml` > `images` |

| App | URL | Port |
|---|---|---|
| Prowlarr | http://prowlarr.homeserver | 9696 |
| SABnzbd | http://sabnzbd.homeserver | 8080 |
| Sonarr | http://sonarr.homeserver | 8989 |
| Radarr | http://radarr.homeserver | 7878 |
| Seerr | http://seerr.homeserver | 5055 |
| `media-api-exporter` | intern, `VMServiceScrape` | 9108 |

## Architektur

```text
PV/PVC mediastack-data = //jays-ugreen/media (RWX, cifs uid/gid 1001) → /data
  /data/movies      Radarr-Root, Jellyfin /media/movies
  /data/shows       Sonarr-Root, Jellyfin /media/shows
  /data/downloads/complete   SABnzbd fertige Jobs
PVC sabnzbd-incomplete (local-path) → /incomplete-downloads   Download, par2, Entpacken
PVC <app>-config (local-path)       → /config                  SQLite der Apps

Prowlarr → Sonarr/Radarr → SABnzbd → /data/downloads/complete
Sonarr/Radarr → Move nach /data/movies|shows → Library-Refresh an jellyfin.jellyfin.svc:8096
```

Downloads und Bibliothek liegen im selben Mount, deshalb ist der Import ein serverseitiges Rename auf dem NAS.
Hardlinks gehen über SMB nicht; bei Usenet ohne Seeding fehlen sie nicht. Jellyfin mountet denselben Share unter
`/media` statt `/data`, beide Seiten zeigen auf dieselben Ordner `movies/` und `shows/`.

SABnzbd entpackt auf der lokalen SSD, weil Entpacken über CIFS langsam ist und bei Pod-Neustarts `_UNPACK_`-Reste
hinterlässt. `incomplete.size` (100Gi) ist nominal: `local-path` erzwingt keine Größe und kann nicht wachsen. Wer die
Größe ändern will, löscht die leere PVC und lässt sie neu anlegen.

## Einrichtung

1. Im Share `//jays-ugreen/media` neben `movies/` und `shows/` die Ordner `downloads/complete/` und
   `downloads/incomplete/` anlegen.
2. SMB-Zugangsdaten (dasselbe Konto wie bei Jellyfin) für den Namespace `media` neu sealen, da kubeseal an den
   Namespace bindet. Ergebnis in `smb.encryptedUsername` und `smb.encryptedPassword` eintragen. Ohne die Werte
   bleiben die Pods in `ContainerCreating`.

```bash
echo -n "<smb-username>" | kubeseal --raw \
  --namespace media --name mediastack-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
# dasselbe für <smb-password>
```

3. Die Apps erzeugen ihre API-Keys beim ersten Start selbst. Danach in dieser Reihenfolge per UI konfigurieren:

| App | Einstellungen |
|---|---|
| SABnzbd | Usenet-Provider eintragen. Config > Folders: Temporary `/incomplete-downloads`, Completed `/data/downloads/complete`. Config > Special > `host_whitelist`: `sabnzbd.homeserver` ergänzen |
| Prowlarr | Newznab-Indexer, Download-Client `sabnzbd:8080`, Apps `http://sonarr:8989` und `http://radarr:7878` mit deren API-Keys |
| Sonarr, Radarr | Root-Folder `/data/shows` bzw. `/data/movies`, Download-Client `sabnzbd:8080`, Connect > Emby/Jellyfin (siehe unten) |
| Seerr | Jellyfin `http://jellyfin.jellyfin.svc.cluster.local:8096`, Jellyfin-Login an, Sonarr und Radarr verknüpfen |

Vor dem Eintrag der `host_whitelist` lehnt SABnzbd Aufrufe über den Hostnamen ab („Hostname verification failed“).
Für den ersten Zugriff:

```bash
sudo kubectl -n media port-forward deploy/sabnzbd 8080:8080
```

4. Optional die API-Keys von Sonarr, Radarr, Prowlarr, SABnzbd und Jellyfin in das SealedSecret `media-api-keys`
   sealen und unter `apiKeys.<app>` eintragen. Erst dann liefert der Exporter Werte. Die Homepage-Widgets lesen
   `HOMEPAGE_VAR_{SONARR,RADARR,PROWLARR,SABNZBD,SEERR}_KEY` aus `homepage-credentials`
   ([Homepage](14-homepage.md)).

```bash
for app in sonarr radarr prowlarr sabnzbd jellyfin; do
  echo -n "<$app-api-key>" | kubeseal --raw \
    --namespace media --name media-api-keys \
    --controller-name sealed-secrets-controller \
    --controller-namespace sealed-secrets --from-file=/dev/stdin
done
```

## Jellyfin-Benachrichtigung

Jellyfins Real-Time Monitoring braucht inotify, und das funktioniert auf CIFS nicht. Ohne Benachrichtigung tauchen
neue Medien erst beim nächsten geplanten Scan auf. In Sonarr und Radarr deshalb unter Connect > Emby/Jellyfin
eintragen: Host `jellyfin.jellyfin.svc.cluster.local`, Port `8096`, ohne SSL, API-Key aus Jellyfin (Dashboard >
API-Schlüssel), Trigger On Import und On Upgrade, Update Library an.

## Aufräumen nach dem Import

Damit in `complete/` keine RAR-, par2- und `_UNPACK_`-Reste liegen bleiben:

| Wo | Einstellung |
|---|---|
| SABnzbd, Config > Switches | Default-Post-Processing `+Delete`, Direct Unpack an |
| SABnzbd, Config > Switches > Cleanup List | `nfo,sfv,srr,par2,jpg,nzb,sub,idx` (nie `mkv`, `mp4`, `avi`) |
| Sonarr, Radarr, Download Clients > SABnzbd | Category `tv` bzw. `movies`, Completed Download Handling > Remove an |
| Sonarr, Radarr, Media Management | „Use Hardlinks instead of Copy“ aus |

Die Cleanup-Liste löscht nur direkt geladene Dateien. Reste aus entpackten Archiven entfernt erst das Remove in
Sonarr und Radarr.

## Deutsche Releases

Sonarr und Radarr laden nur deutsche bzw. German-DL-Releases. Dafür sorgen die Quality-Profile „[German] UHD Bluray + WEB“
und „[German] HD Bluray + WEB“ mit den German-Custom-Formats. Sie liegen nur in den SQLite-Datenbanken auf
den `*-config`-PVCs und werden in der UI gepflegt, siehe [Gotchas: Media-Stack](gotchas.md#media-stack). Grabben die
Apps nichts mehr, führt der Indexer vermutlich keine passenden deutschen Releases.

## Betrieb

```bash
sudo kubectl -n media get pods,pvc
sudo kubectl -n media describe pod <pod>        # Mount-Fehler bei ContainerCreating
# Prüfen, dass Downloads und Bibliothek im selben Mount liegen (Move ohne Kopie):
sudo kubectl -n media exec deploy/sonarr -- sh -c \
  'touch /data/downloads/complete/.mvtest && mv /data/downloads/complete/.mvtest /data/shows/.mvtest && rm /data/shows/.mvtest'
```

`media_exporter_scrape_success 0` heißt meist, dass `media-api-keys` fehlt.

## Fallstricke

- Den Temporary- oder Completed-Ordner ändert SABnzbd nur bei leerer Queue, pausierte Jobs zählen mit. Vorher die
  Queue abarbeiten oder löschen; Teildownloads im alten Pfad danach unter Status > Orphaned Jobs entfernen.
- Die Benachrichtigungen, Profile und alle übrigen Einstellungen leben in den `*-config`-PVCs. Nach einem PVC-Verlust
  muss alles neu angelegt werden.
- linuxserver-Images sind mit den reinen App-Tags (z. B. `4.0.20`) gepinnt, nicht mit `-lsNNN`. Renovate sortiert
  nur die reinen Tags sauber.
