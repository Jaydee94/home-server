# Plan: Media-Stack (Sonarr/Radarr/Prowlarr/SABnzbd/Seerr) ins Homelab adaptieren

Stand: 2026-06-18 · Quelle: `/home/jaydee/git/media` → Ziel: `home-server`

## Entscheidungen (abgestimmt)

1. **Download-Pfad:** Usenet behalten — SABnzbd + Newznab-Indexer in Prowlarr.
   Voraussetzung: Usenet-Provider-Account (Server/Port/User/Pass) + Indexer-API-Key.
2. **Umfang:** Sonarr, Radarr, Prowlarr, SABnzbd, Seerr, media-api-exporter.
   **Kein** eigenes Jellyfin — Anbindung an das bestehende `argocd/apps/jellyfin`.
3. **NAS-Layout:** bestehenden Share `//jays-ugreen/media` erweitern (gemeinsamer
   Mount für Downloads + Bibliothek → Hardlinks/atomic moves möglich).

## Ausgangslage / Delta zum Quell-Repo

Das `media`-Repo läuft auf einem fremden Cluster und nutzt drei Muster, die im
Homelab ersetzt werden müssen:

| Quell-Muster (media-Repo) | Homelab-Ersatz |
|---|---|
| `hostPath: /home/mediastack/media` | Statisches SMB-CSI-PV auf `//jays-ugreen/media` (Muster von `argocd/apps/jellyfin`) |
| Shared MetalLB-IP `192.168.2.212` + viele Ports | ClusterIP-Services + Traefik-Ingress `*.homeserver` (kein MetalLB-IP nötig) |
| Eigenes Jellyfin im Stack | Bestehendes `jellyfin` (Namespace `jellyfin`, Svc `:8096`) wiederverwenden |
| Eigenes Dashboard (`dashboard.yaml`) | Einträge in bestehende Homepage (`argocd/apps/homepage`) |
| Plain `Secret` (live-only, nicht committed) | SealedSecrets (kubeseal gegen `sealed-secrets-controller`) |
| `monitoring.coreos.com/v1 ServiceMonitor` | `operator.victoriametrics.com/v1beta1 VMServiceScrape` (native im Repo) |
| `argocd/apps/media.yaml` (Application-Manifest) | Entfällt — Root-ApplicationSet erzeugt die App automatisch |

Bereits vorhandene Bausteine (keine Neu-Entwicklung nötig):
`csi-driver-smb`, statisches SMB-PV/PVC-Muster, SealedSecrets, MetalLB, Pi-hole
Wildcard-DNS `address=/homeserver/192.168.178.127`, VMAgent mit Auto-Convert.

## Zielarchitektur

```
Namespace: media   (vom Root-ApplicationSet aus argocd/apps/media/ erzeugt)

  SMB-PV "mediastack-data" ── //jays-ugreen/media (RWX, uid=1001/gid=1001)
     │   /data/movies     ← Radarr root folder  + Jellyfin "Filme"
     │   /data/shows      ← Sonarr root folder  + Jellyfin "Serien"
     │   /data/downloads  ← SABnzbd complete/incomplete  (NEU auf dem Share)
     ▼
  ┌─ sabnzbd   (config-PVC local-path)  ─ ClusterIP :8080 ─ sabnzbd.homeserver
  ├─ prowlarr  (config-PVC local-path)  ─ ClusterIP :9696 ─ prowlarr.homeserver
  ├─ sonarr    (config-PVC local-path)  ─ ClusterIP :8989 ─ sonarr.homeserver
  ├─ radarr    (config-PVC local-path)  ─ ClusterIP :7878 ─ radarr.homeserver
  ├─ seerr     (config-PVC local-path)  ─ ClusterIP :5055 ─ seerr.homeserver
  └─ media-api-exporter ─ ClusterIP :9108 ─ VMServiceScrape

  Cross-App (ClusterIP-DNS, kein LB):
    Prowlarr → sonarr:8989 / radarr:7878
    Sonarr/Radarr → sabnzbd:8080 (Download-Client)
    Sonarr/Radarr → prowlarr:9696 (Indexer)
    Seerr → jellyfin.jellyfin.svc:8096  + sonarr:8989 / radarr:7878
    Jellyfin-Refresh ← Sonarr/Radarr MediaBrowser-Notification → jellyfin.jellyfin.svc:8096
```

**Ports vereinfacht:** Im Quell-Repo wurden „+1"-Ports benutzt (8990/7879/9697/8101),
weil ein einziger Shared-LB-IP genutzt wurde. Mit separaten ClusterIP-Services
entfällt das — wir nutzen die **nativen** App-Ports (8989/7878/9696/8080/5055).

## Storage-Design (wichtigster Punkt)

### Ein gemeinsamer SMB-Mount für alle *arr + SABnzbd

Sonarr/Radarr brauchen Downloads UND Bibliothek im **selben** Mount, sonst keine
Hardlinks → atomic moves werden zu „copy+delete" (doppelter Platz, langsam).

- **PV/PVC:** ein statisches SMB-PV `mediastack-data` (RWX) auf `//jays-ugreen/media`,
  gemountet als `/data` in sonarr, radarr, sabnzbd.
- **NAS-Vorbereitung:** im bestehenden Share neben `movies/` und `shows/` einen
  Ordner `downloads/` (mit `complete/` + `incomplete/`) anlegen.
- **Root-Folders:** Radarr → `/data/movies`, Sonarr → `/data/shows`
  (= dieselben Ordner, aus denen das bestehende Jellyfin liest → keine zweite Kopie).
- **SABnzbd:** complete → `/data/downloads/complete`, incomplete → `/data/downloads/incomplete`.

### CIFS-uid/gid-Gotcha

- linuxserver-Images (sonarr/radarr/prowlarr/sabnzbd) laufen als **PUID/PGID 1001**.
  Bei CIFS erscheinen alle Dateien als Eigentum der **Mount-**uid/gid. Daher das
  media-stack-PV mit `uid=1001,gid=1001` mounten (statt `uid=0` wie bei Jellyfin).
- Jellyfins bestehendes PV mountet denselben Share mit `uid=0/gid=0` (offizielles
  Image läuft als root) — das bleibt unverändert. Zwei separate CIFS-Mounts
  desselben Shares mit unterschiedlichen uid/gid sind unproblematisch; bei
  `file_mode=0664,dir_mode=0775` kann Jellyfin (root) die von *arr (1001)
  geschriebenen Dateien lesen.
- **volumeHandle muss clusterweit eindeutig sein** → `mediastack-data-media`
  (nicht mit `jellyfin-media-jellyfin` kollidieren).

### Hardlinks über CIFS — Verifikationspunkt

SMB2/3 + Samba unterstützen Hardlinks; da Downloads und Bibliothek im selben
Mount liegen, sollten Sonarr/Radarr „Use Hard Links instead of Copy" nutzen
können. **Nach Deployment verifizieren** (Datei in `/data/downloads` anlegen,
hardlinken nach `/data/movies`, `ls -li` Inode-Vergleich). Falls die NAS-Samba
keine Hardlinks liefert → *arr fällt automatisch auf Copy zurück (funktioniert,
braucht transient 2× Platz). Kein Blocker.

## Secrets (SealedSecrets statt live-only)

Pro App ein SealedSecret im Namespace `media`, gesealt gegen
`sealed-secrets-controller` (Namespace `sealed-secrets`). Muster exakt wie
`argocd/apps/jellyfin/templates/smb-sealedsecret.yaml`.

| SealedSecret | Keys | Erzeugt durch / Quelle |
|---|---|---|
| `mediastack-smbcreds` | `username`, `password` | NAS-SMB-Account (gleicher wie Jellyfin) |
| `sonarr-secrets` | `sonarr-api-key` | frei wählbarer 32-hex-Key (seed-config schreibt ihn in config.xml) |
| `radarr-secrets` | `radarr-api-key` | dito |
| `prowlarr-secrets` | `prowlarr-api-key` | dito |
| `sabnzbd-secrets` | `sabnzbd.ini` | komplette ini inkl. Usenet-Creds + API-Key (nach UI-Erstsetup sealen) |
| `media-api-exporter-secrets` | `jellyfin-api-key` (optional) | Jellyfin-API-Key für Stream-Metriken |

Seal-Befehl pro Wert (Beispiel Sonarr-API-Key):

```sh
echo -n "<32-hex-api-key>" | kubeseal --raw \
  --namespace media --name sonarr-secrets \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
```

`sabnzbd.ini` als Datei sealen:

```sh
kubeseal --namespace media --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --format yaml \
  < sabnzbd-secret.yaml > sabnzbd-sealedsecret.yaml
```

API-Keys vorab frei generieren: `openssl rand -hex 16`.
**Empty-by-default-Konvention beibehalten:** solange ein SealedSecret-Wert leer
ist, wird das Template übersprungen (wie bei Jellyfin) → Repo bleibt lint-fähig.

## Netzwerk / Ingress / DNS

- **Kein MetalLB-IP** für die Web-UIs (anders als Jellyfin, das wegen Smart-TV
  einen rohen IP braucht). Stattdessen je App ein `Ingress`/IngressRoute
  (className `traefik`, Host `*.homeserver`, kein TLS — LAN-intern).
- **Pi-hole:** keine Änderung nötig — `address=/homeserver/192.168.178.127` ist
  ein Wildcard; `sonarr.homeserver` etc. lösen automatisch auf .127 auf,
  Traefik routet per Host-Header.
- **Cross-App-Kommunikation** ausschließlich über ClusterIP-Service-DNS.
- **Authentifizierung:** *arr-Apps mit `AuthenticationRequired=DisabledForLocalAddresses`
  (wie Original). Da nun per Ingress LAN-weit erreichbar, ggf. auf
  `Enabled` + Forms-Login härten (Überlegung, kein Muss — kein Public-Port).

## Monitoring

- `media-api-exporter` (Python-stdlib, scrapet *arr/SABnzbd/Jellyfin-APIs) wird
  übernommen — **aber** den mitgelieferten `ServiceMonitor` durch eine
  `VMServiceScrape` ersetzen (Repo-Muster: `argocd/apps/monitoring/templates/
  vmservicescrape-minio.yaml`). Grund: Repo nutzt nativ VMServiceScrape; die
  Prometheus-`ServiceMonitor`-CRD ist im Cluster nicht garantiert vorhanden.
- Optional: Grafana-Dashboard für die `media_*`-Metriken (über das
  `monitoring-dashboards`-Muster als ConfigMap).

## Dashboard-Integration (Homepage)

`dashboard.yaml` aus dem media-Repo **nicht** übernehmen. Stattdessen in
`argocd/apps/homepage/values.yaml` in der bestehenden **Media**-Gruppe ergänzen
(Homepage hat native Widgets für sonarr/radarr/prowlarr/sabnzbd/jellyseerr):

```yaml
- Media:
    - Jellyfin: { ... bestehend ... }
    - Sonarr:   { href: http://sonarr.homeserver,   widget: { type: sonarr,   url: http://sonarr.media.svc:8989,   key: "{{HOMEPAGE_VAR_SONARR_KEY}}" } }
    - Radarr:   { href: http://radarr.homeserver,   widget: { type: radarr,   url: http://radarr.media.svc:7878,   key: "{{HOMEPAGE_VAR_RADARR_KEY}}" } }
    - Prowlarr: { href: http://prowlarr.homeserver, widget: { type: prowlarr, url: http://prowlarr.media.svc:9696, key: "{{HOMEPAGE_VAR_PROWLARR_KEY}}" } }
    - SABnzbd:  { href: http://sabnzbd.homeserver,  widget: { type: sabnzbd,  url: http://sabnzbd.media.svc:8080,  key: "{{HOMEPAGE_VAR_SABNZBD_KEY}}" } }
    - Seerr:    { href: http://seerr.homeserver,    widget: { type: jellyseerr, url: http://seerr.media.svc:5055, key: "{{HOMEPAGE_VAR_SEERR_KEY}}" } }
```

Widget-API-Keys über das bestehende `homepage`-SealedSecret
(`sealedsecret-credentials.yaml`, `envFrom secretRef`) als `HOMEPAGE_VAR_*`
nachziehen — keine Keys im Klartext in values.yaml.

## Datei-Struktur im home-server-Repo

```
argocd/apps/media/
  kustomization.yaml          (namespace: media; resources unten)
  sonarr.yaml                 Deployment (initContainer seed-config) + ClusterIP-Svc + Ingress
  radarr.yaml                 dito
  prowlarr.yaml               dito (kein /data-Mount nötig)
  sabnzbd.yaml                Deployment + Svc + Ingress; /data + /config
  seerr.yaml                  Deployment + Svc + Ingress; zeigt auf jellyfin.jellyfin.svc
  media-api-exporter.yaml     ConfigMap(exporter.py) + Deployment + Svc + VMServiceScrape
  storage.yaml                SMB-PV "mediastack-data" + PVC (uid=1001/gid=1001)
  sealedsecrets.yaml          alle SealedSecrets (leer-by-default)
docs/21-media-stack.md        Setup/Verify/Troubleshooting (nach Implementierung)
```

**Anpassungen je Manifest gegenüber dem Original:**
- `hostPath` → `persistentVolumeClaim: mediastack-data`, Pfade `/data/movies|shows|downloads`.
- `Service type: LoadBalancer` + `loadBalancerIP` + `metallb.io/*` → `ClusterIP` + nativer Port.
- Pro App ein `Ingress` (Host `<app>.homeserver`).
- `secretKeyRef`-Namen auf neue SealedSecret-Namen (oben) mappen.
- Resource requests/limits ergänzen (Original hat keine) — Single-Node:
  *arr je `req 100m/128Mi, lim 1/512Mi`; SABnzbd höher (par2/unrar-CPU):
  `req 200m/256Mi, lim 2/1Gi`.
- `theme.park`-DOCKER_MODS optional behalten (kosmetisch, lädt aus ghcr beim Start).
- Seerr-Image `ghcr.io/seerr-team/seerr:latest` (Tag pinnen, Renovate-Kommentar).

## Reihenfolge / Sync-Waves

1. NAS: `downloads/` (+ `complete/incomplete`) im Share anlegen.
2. SealedSecrets erzeugen (mind. `mediastack-smbcreds` + API-Keys) und einsetzen.
3. `argocd/apps/media/` committen+pushen → ArgoCD legt Namespace `media` an.
4. PV/PVC bindet → Pods starten (Reihenfolge unkritisch; *arr retryen Verbindungen).
5. Erstkonfiguration via UI/Bootstrap-Skripte:
   Prowlarr-Indexer + SABnzbd-Download-Client → Sonarr/Radarr Apps in Prowlarr →
   Root-Folders setzen → Seerr-Wizard gegen Jellyfin + *arr.
6. Homepage-Einträge + Widget-Keys ergänzen.
7. Hardlink-Verifikation; ggf. Auth härten.

## Offene Punkte / Risiken

- **Usenet-Account**: Provider-Creds + Indexer-Key sind extern und nötig (sonst
  läuft die Pipeline nicht). Nicht im Repo.
- **Hardlinks über CIFS**: verifizieren (s.o.); Fallback Copy ist akzeptabel.
- **Ressourcen Single-Node**: 6 zusätzliche Pods; SABnzbd-Entpacken kann CPU
  ziehen. Limits gesetzt, ggf. nachjustieren.
- **Jellyfin-Bibliothekspfade**: bestehendes Jellyfin liest aus `/media/movies`
  bzw. `/media/shows` — sicherstellen, dass *arr in **dieselben** Ordner schreibt
  (Mapping `/data/movies` ⇄ Share-`movies/`). Andernfalls Jellyfin-Libraries
  anpassen.
- **Bestehende Bibliothek/Configs des fremden Clusters** werden NICHT migriert
  (anderer Host, andere Daten) — fresh Setup, eigene Medien.

## Recherche / Quellen

- Lokal verifiziert: `csi-driver-smb` + statisches RWX-SMB-PV-Muster
  (`argocd/apps/jellyfin/templates/`), VM-Operator `disable_prometheus_converter:
  false` + native VMServiceScrape (`argocd/apps/monitoring/`), Pi-hole
  Wildcard-DNS, Homepage Media-Gruppe.
- Quell-Stack: `/home/jaydee/git/media` (manifests + migration-plan).
- Zu prüfen vor Implementierung (context7/WebSearch): aktuelle linuxserver-
  Image-Tags (sonarr/radarr/prowlarr/sabnzbd) zum Pinnen, Seerr-Release-Tag,
  Homepage-Widget-Feldnamen (`type: jellyseerr` vs `seerr`).
```
