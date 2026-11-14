# Backup & Restore

Nächtliches [restic](https://restic.net)-Backup aller Daten des Home-Servers,
die **nicht** aus Git wiederherstellbar sind. Ziel ist ein verschlüsseltes
restic-Repository auf einem SMB-Share der UGREEN NAS.

| | |
|---|---|
| Rolle | `ansible/roles/backup` (`make backup`) |
| Zeitplan | täglich 04:00 (`homeserver-backup.timer`) |
| Ziel | `//192.168.178.118/personal_folder/backups/homeserver/restic` |
| Aufbewahrung | 7 tägliche, 4 wöchentliche, 6 monatliche Snapshots |
| Integritätsprüfung | sonntags `restic check` |

## Was gesichert wird

| Inhalt | Quelle | Warum |
|---|---|---|
| k3s-Datastore | SQLite-Online-Backup von `server/db/state.db` | kompletter Cluster-Zustand |
| k3s-Token, TLS, Credentials | `/var/lib/rancher/k3s/server/{token,tls,cred}` | nötig, um den Datastore wieder zu starten |
| Sealed-Secrets-Keys | `kubectl get secret -l sealedsecrets.bitnami.com/sealed-secrets-key` | **ohne sie ist jedes SealedSecret im Repo wertlos** |
| Alle local-path-Volumes | `/var/lib/rancher/k3s/storage` | Home Assistant, Pi-hole, *arr-Configs, Grafana, … |
| Semaphore-Secrets | `/etc/semaphore-secrets` | Admin-Passwort, SSH-Key, Encryption-Key |

Nicht gesichert (Default `backup_excludes`): die OS-Disk der 7DTD-VM und das
SABnzbd-Incomplete-Volume — beides groß und neu erzeugbar.

> Der Sealed-Secrets-Controller rotiert seinen Schlüssel alle 30 Tage und
> behält alle alten. Ein einmaliger Export veraltet deshalb; das nächtliche
> Backup enthält immer alle Schlüssel.

### Grenzen

- Die Volumes werden im laufenden Betrieb auf Dateiebene gesichert. SQLite-
  Datenbanken der Apps (Home Assistant, *arr, Grafana, Pi-hole) sind dadurch
  „crash-konsistent“, nicht garantiert sauber. Für Remedy wird der
  Postgres-Dump aus dem `remedy-postgres-backup`-Volume mitgesichert.
- NAS und Server stehen im selben Haus — das Backup schützt vor Disk-Defekt
  und Fehlbedienung, nicht vor Brand oder Diebstahl.
- Daten auf dem NAS selbst (Medien, Paperless) sind nicht Teil dieses Backups.
  Paperless hat ein eigenes Export-Backup, siehe
  [Paperless-Backup auf dem NAS](#paperless-backup-auf-dem-nas).

## Einrichtung

1. Repository-Passwort erzeugen, **außerhalb des Servers** ablegen
   (Passwortmanager) und vault-verschlüsseln:

   ```bash
   ansible-vault encrypt_string "$(openssl rand -base64 32)" \
     --name 'backup_restic_password'
   ```

   Den `!vault |`-Block in `ansible/group_vars/all.yml` eintragen. Solange die
   Variable fehlt, überspringt die Rolle alles und meldet das im Lauf.

2. Optional `backup_ntfy_url` setzen (volle Topic-URL), damit Fehler als Push
   ankommen.

3. Ausrollen und einmal von Hand starten:

   ```bash
   make backup
   ssh jaydee@192.168.178.127 'sudo systemctl start homeserver-backup && sudo journalctl -u homeserver-backup -n 30'
   ```

Der SMB-Zugang nutzt standardmäßig die Zugangsdaten der Scanner-Rolle
(`scanner_smb_username` / `scanner_smb_password`).

## Status prüfen

```bash
systemctl list-timers homeserver-backup.timer
sudo journalctl -u homeserver-backup --since -2d
sudo cat /var/lib/homeserver-backup/last-success

# Snapshots auflisten
sudo RESTIC_REPOSITORY=/mnt/nas-backup/backups/homeserver/restic \
     RESTIC_PASSWORD_FILE=/etc/homeserver-backup/restic-password \
     restic snapshots
```

## Restore

Für alle Befehle:

```bash
export RESTIC_REPOSITORY=/mnt/nas-backup/backups/homeserver/restic
export RESTIC_PASSWORD_FILE=/etc/homeserver-backup/restic-password
```

### Einzelnes Volume (App kaputt, Server läuft)

```bash
# App stoppen, damit nichts ins Volume schreibt
sudo kubectl -n home-assistant scale sts home-assistant --replicas=0

# Pfad des Volumes im Snapshot finden und zurückspielen
sudo -E restic ls latest /var/lib/rancher/k3s/storage | grep home-assistant
sudo -E restic restore latest --target / \
  --include '/var/lib/rancher/k3s/storage/pvc-<id>_home-assistant_<name>'

sudo kubectl -n home-assistant scale sts home-assistant --replicas=1
```

ArgoCD (`selfHeal`) skaliert die App von selbst wieder hoch — den Restore
zügig durchführen oder Auto-Sync der App vorher pausieren.

### Kompletter Neuaufbau (Disk defekt)

1. Ubuntu installieren (`docs/00-ubuntu-server-install.md`).
2. `restic` und `cifs-utils` installieren, NAS-Share nach `/mnt/nas-backup`
   mounten, Passwort aus dem Passwortmanager in eine Datei schreiben.
3. Zustand **vor** dem ersten k3s-Start zurückspielen:

   ```bash
   sudo -E restic restore latest --target /
   sudo mkdir -p /var/lib/rancher/k3s/server/db
   sudo cp /var/lib/homeserver-backup/staging/k3s-state.db \
           /var/lib/rancher/k3s/server/db/state.db
   ```

4. `make install` — k3s startet mit dem alten Datastore, alle PVCs zeigen auf
   die zurückgespielten Verzeichnisse, die Sealed-Secrets-Keys sind Teil des
   Datastores.

Falls der Datastore nicht brauchbar ist: Cluster leer aufsetzen und **vor**
dem ersten ArgoCD-Sync nur die Schlüssel einspielen, dann den Controller neu
starten:

```bash
sudo kubectl apply -f /var/lib/homeserver-backup/staging/sealed-secrets-keys.yaml
sudo kubectl -n sealed-secrets rollout restart deploy
```

> Der Komplett-Restore ist bisher nicht praktisch erprobt. Einmal im Jahr
> lohnt ein Test: `restic restore latest --target /tmp/restore-test` und
> prüfen, ob `k3s-state.db` und `sealed-secrets-keys.yaml` enthalten sind.

## Paperless-Backup auf dem NAS

Unabhängig vom restic-Backup oben sichert die Rolle `ansible/roles/paperless`
das Dokumentenarchiv per Cron direkt auf dem NAS.

| | |
|---|---|
| Skript | `/opt/paperless/backup-paperless.sh` (Template `backup-paperless.sh.j2`) |
| Zeitplan | täglich 02:00 (root-Crontab, `paperless_backup_schedule`) |
| Ziel | `/volume1/paperless-backups/paperless-backup-<datum>.tar.gz` |
| Aufbewahrung | 7 Tage (`paperless_backup_retention_days`) |
| Log / Status | `/opt/paperless/backup.log` · `/opt/paperless/backup-last-success` |
| Metrik | `paperless_backup_last_success_timestamp_seconds{instance="ugreen-nas"}` |

### Wo die Daten liegen

- `/opt/paperless` (Originale in `media/`, Postgres in `db/`, Export in
  `export/`) liegt auf der **Systempartition** des NAS: `/` ist ein Overlay
  auf `/dev/mmcblk0p7` (eMMC, 19 GB, kein RAID).
- Die Archive lagen bis November 2026 ebenfalls dort
  (`/opt/paperless/backups`, 8 × 1,2 GB) und haben die Partition auf 83 %
  gefüllt. Seitdem zeigt `paperless_backup_dir` auf `/volume1` (RAID 1,
  3,6 TB). Das Skript bricht ab, wenn `/volume1` nicht gemountet ist
  (`paperless_backup_required_mount`), statt wieder auf die eMMC zu schreiben.
- **Ohne zweites Ziel liegen Daten und Backup weiterhin im selben Gerät.**
  Das schützt vor einem eMMC-Defekt und vor versehentlichem Löschen, nicht
  vor Diebstahl, Brand, Überspannung oder einem defekten NAS.

### Was das Skript prüft

`document_exporter ../export --delete --no-progress-bar`, danach muss
`manifest.json` vorhanden, groß genug und in diesem Lauf neu geschrieben
worden sein, der Export mindestens `paperless_backup_min_files` Dateien
enthalten und darf nicht mehr als 50 % kleiner sein als beim letzten guten
Lauf. Erst dann wird gepackt (`.partial` → `gzip -t` → umbenennen) und erst
dann werden alte Archive gelöscht. Ein fehlgeschlagener Lauf rührt die
vorhandenen Archive nicht an.

`--delete` entfernt im **Export-Verzeichnis** Dateien gelöschter oder
umbenannter Dokumente, damit sie nicht für immer in jedem neuen Archiv
landen. Originale (`media/`) und ältere Archive bleiben unberührt; ein in
Paperless gelöschtes Dokument ist also noch `paperless_backup_retention_days`
Tage lang aus den älteren Archiven wiederherstellbar.

Schlägt die Schrumpf-Prüfung nach bewusstem Aufräumen an:
`sudo FORCE=1 /opt/paperless/backup-paperless.sh`.

### Benachrichtigung und Überwachung

- Push bei Fehler (optional auch bei Erfolg) an eine ntfy-kompatible URL, in
  `ansible/host_vars/ugreen-nas/vars.yml`:

  ```yaml
  paperless_backup_notify_url: "https://ntfy.sh/<topic>"
  paperless_backup_notify_on_success: false
  ```

  Default ist leer, dann wird nur geloggt. Enthält die URL ein Token, gehört
  sie in den Vault.
- Der node-exporter des NAS liest `/opt/node-exporter/textfile/*.prom`
  (Textfile-Collector). Ein Push kommt nur, wenn das Skript überhaupt läuft;
  ein Alert auf die Metrik fängt auch „Cron läuft gar nicht mehr“ ab. Die
  Regel ist noch **nicht** angelegt, Vorschlag für
  `argocd/apps/monitoring/templates/vmrule-homeserver.yaml`:

  ```yaml
  - alert: PaperlessBackupStale
    expr: time() - paperless_backup_last_success_timestamp_seconds{instance="ugreen-nas"} > 36 * 3600
    for: 30m
    labels:
      severity: critical
  - alert: PaperlessBackupMetricMissing
    expr: absent(paperless_backup_last_success_timestamp_seconds{instance="ugreen-nas"})
    for: 26h
    labels:
      severity: warning
  ```

### Zweites Ziel aktivieren (USB-Platte oder anderes Volume)

1. Platte anschließen, in UGOS einbinden, Mountpoint ermitteln
   (`df -h | grep -v overlay`; USB-Platten hängen unter `/mnt/@usb/…`).
2. Zielverzeichnis einmalig von Hand anlegen, z. B.
   `sudo mkdir /mnt/@usb/<platte>/paperless-backups`. Das Skript legt es
   absichtlich **nicht** selbst an: fehlt das Verzeichnis, ist die Platte
   nicht eingehängt.
3. In `ansible/host_vars/ugreen-nas/vars.yml`:

   ```yaml
   paperless_backup_secondary_dir: /mnt/@usb/<platte>/paperless-backups
   # optional, Default = paperless_backup_retention_days
   paperless_backup_secondary_retention_days: 30
   ```

4. `make nas` (oder den nächsten 06:00-Lauf abwarten), dann
   `sudo /opt/paperless/backup-paperless.sh` und das Log prüfen.

Das Skript kopiert das fertige Archiv zusätzlich dorthin und vergleicht die
Kopie. Liegt das Ziel auf demselben Dateisystem wie das erste Backup oder wie
`/opt/paperless` (Platte abgezogen, Mountpoint leer), wird nicht kopiert und
der Lauf als Fehler gemeldet; das erste Archiv bleibt gültig. Für Schutz vor
Brand/Diebstahl die Platte regelmäßig tauschen oder das Verzeichnis
`/volume1/paperless-backups` zusätzlich außer Haus sichern.

### Restore

```bash
sudo tar -xzf /volume1/paperless-backups/paperless-backup-<datum>.tar.gz \
  -C /opt/paperless/export
cd /opt/paperless && sudo docker compose exec -T paperless document_importer ../export
```

Der Importer erwartet eine leere Paperless-Instanz. Der Restore ist bisher
nicht praktisch erprobt.
