# Spec: SABnzbd-Cleanup — incomplete auf SSD + Auto-Aufräumen des Completed-Ordners

- **Datum:** 2026-06-19
- **Branch:** `feat/sabnzbd-cleanup`
- **Status:** Design abgestimmt
- **Betroffen:** `argocd/apps/media/` (Helm-Chart), SABnzbd/Sonarr/Radarr UI-Config, `docs/21-media-stack.md`

## Problem

In `/data/downloads/complete/` (SMB-Mount auf der UGREEN NAS) sammeln sich
RAR-Dateien und nicht aufgeräumte Job-Ordner an (Stand 2026-06-19: **116** RAR-Dateien).
Diagnose der laufenden Instanz hat **drei verschiedene** Ursachen ergeben:

1. **Importiert, aber Reste bleiben** — z. B. `A.Knight…S01E05/` enthält weder
   `.mkv` noch `.rar` mehr (Video bereits von Sonarr rausgemoved), nur `.par2`/`.nfo`.
   → `cleanup_list` ist leer (`cleanup_list = ,`) und Sonarrs *Completed Download
   Handling → Remove* ist aus → leere Ordnerhülle bleibt liegen.
2. **Steckengebliebener Unpack** — `_UNPACK_Breaking.Bad.S05E09/` mit fertig
   entpacktem Unterordner, aber `_UNPACK_`-Prefix wurde nie entfernt → Unpack
   mittendrin abgebrochen (Pod-Restart / SMB-Hänger). SAB räumt solche Leichen nicht auf.
3. **Doppelte Roh-Downloads, nie entpackt** — `Breaking.Bad.S01.COMPLETE/` mit
   `…part01.rar.2.rar` **und** `…part01.rar.3.rar` (gleicher Job zweimal geladen).
   Obfuskierte RAR-Sätze, nie entpackt — Hauptquelle der 116 RARs.

### Root Cause

Sorte 1 ist reine Config (cleanup_list + *arr Remove). Sorte 2 + 3 sind
**architektonisch**: SABnzbd entpackt **direkt auf dem SMB/CIFS-Mount**. Unpack
über SMB ist langsam und bricht bei jedem Pod-Restart ab → `_UNPACK_`-Leichen und
Retry-Dubletten. Kein UI-Schalter behebt das dauerhaft, solange der
Temporary-Download-/Unpack-Pfad auf SMB liegt.

## Ziel

Nach einem erfolgreichen Download landet ausschließlich das fertige Medium in
`complete/`, wird von Sonarr/Radarr in die Bibliothek gemoved, und die Job-Hülle
wird vollständig entfernt. Keine RAR-/par2-/`_UNPACK_`-Reste mehr — dauerhaft,
auch über Pod-Restarts.

## Nicht-Ziele (YAGNI)

- Kein separater Cleanup-CronJob im Cluster (verworfen zugunsten der
  Root-Cause-Lösung).
- Keine zusätzliche App (Cleanuperr o. ä.).
- Keine Umstellung von SMB auf NFS / keine Hardlinks (Usenet-Stack braucht kein Seeding).
- Kein Seeden der SABnzbd-/*arr-Config über Git (Stack bleibt UI-konfiguriert,
  konsistent mit dem bestehenden Setup).

## Design

### 1. Architektur-Änderung (Helm-Chart `argocd/apps/media/`)

Neue **local-path-PVC** `sabnzbd-incomplete`, **nur** im SABnzbd-Pod gemountet
unter `/incomplete-downloads`. Download + par2-Repair + Unpack passieren damit auf
der lokalen Node-SSD; nur das fertige Medium wird auf den SMB-Mount geschrieben.

```
Download + par2-Repair + Unpack  →  /incomplete-downloads     (SSD local-path, restart-fest)
fertiges Medium                  →  /data/downloads/complete   (SMB)
*arr-Import (same-FS move)        →  /data/movies | /data/shows (SMB)
```

Der schnelle Same-FS-Move beim Import bleibt erhalten (complete + Library liegen
weiter im selben SMB-Mount). Nur das fragile Unpack wandert von SMB auf SSD.

**Konkrete Chart-Änderungen:**

- `values.yaml`: neuer Block
  ```yaml
  incomplete:
    enabled: true
    storageClass: local-path
    size: 100Gi
  ```
- `templates/storage.yaml` (oder `sabnzbd.yaml`): PVC `sabnzbd-incomplete`
  (`accessModes: [ReadWriteOnce]`, `storageClassName: {{ .Values.incomplete.storageClass }}`,
  `storage: {{ .Values.incomplete.size }}`), gerendert nur wenn `incomplete.enabled`.
- `templates/sabnzbd.yaml`: zusätzlicher `volumeMount` (`name: incomplete`,
  `mountPath: /incomplete-downloads`) + `volume` mit `claimName: sabnzbd-incomplete`.

**Sizing:** 100Gi. Node-SSD: 466G gesamt, 354G frei, local-path thin-provisioned →
unkritisch. ~2× größter Job Headroom (Download + entpackt parallel).

**Hinweis:** Der incomplete-Pfad selbst ist eine SAB-**ini/UI**-Einstellung
(`download_dir`), kein linuxserver-Env. Das Chart stellt nur das Volume bereit;
SAB wird per UI auf `/incomplete-downloads` gezeigt (Schritt 2).

### 2. SABnzbd-Einstellungen (UI — in docs/21 dokumentiert, nicht im Chart)

- **Config → Folders**: *Temporary Download Folder* = `/incomplete-downloads`;
  *Completed Download Folder* bleibt `/data/downloads/complete`.
- **Config → Switches → Post-Processing**: Default = **+Delete** (entpacken **und**
  Archive löschen); *Direct Unpack* = **an**.
- **Config → Switches → Cleanup List**: `nfo,sfv,srr,par2,jpg,nzb,sub,idx` —
  **ohne** `mkv/mp4/avi` (sonst werden Videos gelöscht). Achtung laut SABnzbd-Doku:
  Cleanup-List löscht nur **direkt heruntergeladene** Dateien, keine aus RAR
  entpackten — deshalb ist das *arr-Remove (Schritt 3) zwingend ergänzend.

### 3. Sonarr/Radarr (UI)

- Settings → Download Clients → SABnzbd: **Category** setzen (Sonarr `tv`,
  Radarr `movies`) **und** *Completed Download Handling → Remove* = **an**.
  Entfernt nach dem Import die ganze Job-Hülle aus `complete/`.

### 4. Einmaliges Aufräumen des Altbestands

- SAB-Queue pausieren; aktive Downloads prüfen, damit nichts Laufendes getroffen wird.
- Steckengebliebene `_UNPACK_*`- und Dubletten-Ordner in `complete/` löschen.
- SAB-History leeren (Failed + abgeschlossen ohne Import).

### 5. Doku

Neuer Abschnitt „Aufräumen / Cleanup" in `docs/21-media-stack.md`, der die
Folder-Architektur (SSD-incomplete vs. SMB-complete) und die UI-Schritte 2+3
festhält.

## Verifikation (Infra statt Unit-Tests)

1. `make lint` (yamllint + ansible-lint + `helm lint argocd/apps/media`) grün.
2. `helm template argocd/apps/media` rendert PVC `sabnzbd-incomplete` + Mount
   `/incomplete-downloads` korrekt; PVC entfällt bei `incomplete.enabled: false`.
3. Nach ArgoCD-Sync auf dem Server:
   - PVC `sabnzbd-incomplete` ist `Bound`.
   - SAB-Pod hat `/incomplete-downloads` gemountet (`kubectl exec … df`).
   - Test-Download: entpackt auf `/incomplete-downloads`, landet **ohne** RARs in
     `complete/`, *arr-Import moved in die Library **und** entfernt die Job-Hülle.
4. Altbestand: `find /data/downloads/complete -iname '*.rar' | wc -l` → 0 nach Cleanup.

## Risiken / Edge Cases

- **Cleanup-List zu aggressiv** → Videos gelöscht. Mitigation: `mkv/mp4/avi`
  explizit NICHT aufnehmen; Liste in der Doku fixieren.
- **SSD-incomplete läuft voll** bei vielen parallelen Großdownloads → 100Gi +
  354G frei; bei Bedarf `incomplete.size` erhöhen (thin-provisioned).
- **Einmaliges `rm` trifft aktiven Job** → vorher Queue pausieren + aktive Jobs prüfen.
- **`incomplete.enabled: false`-Pfad** muss sauber rendern (PVC + Mount entfallen
  gemeinsam), sonst dangling volumeMount → Pod startet nicht.

## Referenzen (Recherche)

- TRaSH Guides — SABnzbd Basic-Setup (Completed Download Handling, beide Boxen):
  https://trash-guides.info/Downloaders/SABnzbd/Basic-Setup/
- TRaSH Guides — Paths and Categories (Download- vs. Library-Trennung):
  https://trash-guides.info/Downloaders/SABnzbd/Paths-and-Categories/
- SABnzbd Wiki — Job-Options / Post-Processing-Level:
  https://sabnzbd.org/wiki/extra/job-options
- SABnzbd Forum — Cleanup-List löscht keine aus RAR entpackten Dateien:
  https://forums.sabnzbd.org/viewtopic.php?t=3595
