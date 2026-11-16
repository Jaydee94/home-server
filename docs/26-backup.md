# Backup und Restore

Ein nächtliches [restic](https://restic.net)-Backup sichert alle Daten des Home-Servers, die sich nicht aus Git wiederherstellen lassen. Ziel ist ein verschlüsseltes restic-Repository auf einem SMB-Share der UGREEN NAS. Paperless auf dem NAS sichert sich separat (siehe unten).

| | |
|---|---|
| Rolle | `ansible/roles/backup/` (`make backup`) |
| Zeitplan | täglich 04:00 (`homeserver-backup.timer`, `backup_on_calendar`) |
| Ziel | `//192.168.178.118/personal_folder/backups/homeserver/restic`, gemountet unter `/mnt/nas-backup` |
| Aufbewahrung | 7 tägliche, 4 wöchentliche, 6 monatliche Snapshots |
| Prüfung | sonntags `restic check` |

## Was gesichert wird

| Inhalt | Quelle | Warum |
|---|---|---|
| k3s-Datastore | SQLite-Online-Backup von `server/db/state.db` nach `staging/k3s-state.db` | kompletter Cluster-Zustand |
| k3s-Token, TLS, Credentials, Config | `/var/lib/rancher/k3s/server/{token,tls,cred}`, `/etc/rancher/k3s/config.yaml` | nötig, um den Datastore wieder zu starten |
| Sealed-Secrets-Keys | `kubectl get secret -l sealedsecrets.bitnami.com/sealed-secrets-key` | ohne sie ist kein SealedSecret im Repo mehr entschlüsselbar |
| alle local-path-Volumes | `/var/lib/rancher/k3s/storage` | Home Assistant, Pi-hole, *arr-Configs, Grafana, Semaphore usw. |
| Semaphore-Secrets | `/etc/semaphore-secrets` | Admin-Passwort, SSH-Key, Encryption-Key |

`backup_excludes` lässt die OS-Disk der 7DTD-VM und das SABnzbd-Incomplete-Volume weg, beide sind groß und neu erzeugbar. Der Sealed-Secrets-Controller rotiert seinen Schlüssel alle 30 Tage und behält die alten. Ein einmaliger Export veraltet deshalb, das nächtliche Backup enthält immer alle Schlüssel.

Grenzen:

- Die Volumes werden im laufenden Betrieb auf Dateiebene gesichert. SQLite-Datenbanken der Apps sind dadurch nur crash-konsistent. Für Remedy landet der Postgres-Dump aus dem Volume `remedy-postgres-backup` mit im Backup, für webtrees der MariaDB-Dump aus `webtrees-mariadb-backup`.
- NAS und Server stehen im selben Haus. Das Backup schützt vor Plattendefekt und Fehlbedienung, nicht vor Brand oder Diebstahl.
- Medien und Paperless-Daten auf dem NAS sind nicht Teil dieses Backups.

## Einrichtung

1. Repository-Passwort erzeugen, außerhalb des Servers ablegen (Passwortmanager) und als `backup_restic_password` vault-verschlüsselt in `ansible/group_vars/all.yml` eintragen. Ohne diese Variable überspringt die Rolle alles; in `all.yml` steht der Block derzeit auskommentiert.

   ```bash
   ansible-vault encrypt_string "$(openssl rand -base64 32)" --name 'backup_restic_password'
   ```

2. Optional `backup_ntfy_url` setzen (volle Topic-URL), damit Fehler als Push ankommen.
3. Ausrollen und einmal von Hand starten:

   ```bash
   make backup
   ssh jaydee@192.168.178.127 'sudo systemctl start homeserver-backup && sudo journalctl -u homeserver-backup -n 30'
   ```

Für den SMB-Zugang nutzt die Rolle die Zugangsdaten des Scanners (`scanner_smb_username`, `scanner_smb_password`). Fehler meldet zusätzlich der Alert `SystemdUnitFailed` (siehe [gotchas.md](gotchas.md#alerting)).

## Status prüfen

```bash
systemctl list-timers homeserver-backup.timer
sudo journalctl -u homeserver-backup --since -2d
sudo cat /var/lib/homeserver-backup/last-success
sudo RESTIC_REPOSITORY=/mnt/nas-backup/backups/homeserver/restic \
     RESTIC_PASSWORD_FILE=/etc/homeserver-backup/restic-password \
     restic snapshots
```

## Restore

```bash
export RESTIC_REPOSITORY=/mnt/nas-backup/backups/homeserver/restic
export RESTIC_PASSWORD_FILE=/etc/homeserver-backup/restic-password
```

### Einzelnes Volume

```bash
sudo kubectl -n home-assistant scale sts home-assistant --replicas=0
sudo -E restic ls latest /var/lib/rancher/k3s/storage | grep home-assistant
sudo -E restic restore latest --target / \
  --include '/var/lib/rancher/k3s/storage/pvc-<id>_home-assistant_<name>'
sudo kubectl -n home-assistant scale sts home-assistant --replicas=1
```

ArgoCD (`selfHeal`) skaliert die App von selbst wieder hoch. Den Restore deshalb zügig durchführen oder vorher Auto-Sync der App pausieren.

### Kompletter Neuaufbau

1. Ubuntu installieren ([Ubuntu-Installation](00-ubuntu-server-install.md)).
2. `restic` und `cifs-utils` installieren, den NAS-Share nach `/mnt/nas-backup` mounten, das Passwort aus dem Passwortmanager in eine Datei schreiben.
3. Den Zustand vor dem ersten k3s-Start zurückspielen:

   ```bash
   sudo -E restic restore latest --target /
   sudo mkdir -p /var/lib/rancher/k3s/server/db
   sudo cp /var/lib/homeserver-backup/staging/k3s-state.db /var/lib/rancher/k3s/server/db/state.db
   ```

4. `make install`. k3s startet mit dem alten Datastore, die PVCs zeigen auf die zurückgespielten Verzeichnisse, die Sealed-Secrets-Keys stecken im Datastore.

Ist der Datastore unbrauchbar, den Cluster leer aufsetzen und vor dem ersten ArgoCD-Sync nur die Schlüssel einspielen:

```bash
sudo kubectl apply -f /var/lib/homeserver-backup/staging/sealed-secrets-keys.yaml
sudo kubectl -n sealed-secrets rollout restart deploy
```

> [!NOTE]
> Der Komplett-Restore ist nicht praktisch erprobt. Ein jährlicher Test reicht: `restic restore latest --target /tmp/restore-test` und prüfen, ob `k3s-state.db` und `sealed-secrets-keys.yaml` enthalten sind.

## Paperless-Backup auf dem NAS

Die Rolle `ansible/roles/paperless` sichert das Dokumentenarchiv per Cron direkt auf dem NAS.

| | |
|---|---|
| Skript | `/opt/paperless/backup-paperless.sh` (Template `backup-paperless.sh.j2`) |
| Zeitplan | täglich 02:00 (root-Crontab, `paperless_backup_schedule`) |
| Ziel | `/volume1/paperless-backups/paperless-backup-<datum>.tar.gz` (RAID 1) |
| Aufbewahrung | 7 Tage (`paperless_backup_retention_days`) |
| Log, Status | `/opt/paperless/backup.log`, `/opt/paperless/backup-last-success` |
| Metrik | `paperless_backup_last_success_timestamp_seconds{instance="ugreen-nas"}` |
| Konfiguration | `ansible/host_vars/ugreen-nas/vars.yml` |

`/opt/paperless` (Originale, Postgres, Export) liegt auf der Systempartition des NAS, einer eMMC ohne RAID. Die Archive liegen deshalb auf `/volume1`. Ist `/volume1` nicht gemountet, bricht das Skript ab (`paperless_backup_required_mount`), statt auf die eMMC zu schreiben. Daten und Backup stecken trotzdem im selben Gerät; gegen Diebstahl, Brand oder ein defektes NAS hilft nur ein zweites Ziel.

Das Skript ruft `document_exporter ../export --delete --no-progress-bar` auf und packt erst, wenn `manifest.json` neu und groß genug ist, der Export mindestens `paperless_backup_min_files` Dateien hat und nicht um mehr als 50 % geschrumpft ist. Das Archiv entsteht als `.partial`, wird mit `gzip -t` geprüft und umbenannt. Erst danach löscht das Skript alte Archive, ein fehlgeschlagener Lauf rührt sie nicht an. `--delete` räumt nur das Export-Verzeichnis auf; ein in Paperless gelöschtes Dokument bleibt in den älteren Archiven noch `paperless_backup_retention_days` Tage erhalten. Nach bewusstem Aufräumen überstimmst du die Schrumpf-Prüfung mit `sudo FORCE=1 /opt/paperless/backup-paperless.sh`.

### Benachrichtigung

`paperless_backup_notify_url` (ntfy-kompatible URL, mit Token in den Vault) schickt bei Fehlern einen Push, mit `paperless_backup_notify_on_success: true` auch bei Erfolg. Default ist leer, dann wird nur geloggt.

Die Metrik schreibt das Skript in den Textfile-Collector des NAS-node-exporters (`/opt/node-exporter/textfile/`). Ein Alert darauf würde auch einen Cron erkennen, der gar nicht mehr läuft. Eine solche Regel gibt es in [`vmrule-homeserver.yaml`](../argocd/apps/monitoring/templates/vmrule-homeserver.yaml) noch nicht; naheliegend wäre `time() - paperless_backup_last_success_timestamp_seconds{instance="ugreen-nas"} > 36 * 3600` plus ein `absent(...)`-Alert.

### Zweites Ziel

Für eine USB-Platte oder ein anderes Volume die Platte in UGOS einbinden, den Mountpoint ermitteln (`df -h | grep -v overlay`, USB-Platten hängen unter `/mnt/@usb/…`) und das Zielverzeichnis von Hand anlegen. Das Skript legt es absichtlich nicht selbst an: Fehlt das Verzeichnis, ist die Platte nicht eingehängt. Dann `paperless_backup_secondary_dir` (optional `paperless_backup_secondary_retention_days`) in `ansible/host_vars/ugreen-nas/vars.yml` setzen, `make nas` ausführen oder den Semaphore-Lauf um 06:00 abwarten und `sudo /opt/paperless/backup-paperless.sh` einmal von Hand starten.

Das Skript kopiert das Archiv dorthin und vergleicht die Kopie. Liegt das Ziel auf demselben Dateisystem wie das erste Backup oder wie `/opt/paperless` (Platte abgezogen, Mountpoint leer), kopiert es nicht und meldet einen Fehler; das erste Archiv bleibt gültig.

### Restore

```bash
sudo tar -xzf /volume1/paperless-backups/paperless-backup-<datum>.tar.gz -C /opt/paperless/export
cd /opt/paperless && sudo docker compose exec -T paperless document_importer ../export
```

Der Importer erwartet eine leere Paperless-Instanz. Auch dieser Restore ist nicht praktisch erprobt.
