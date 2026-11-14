# Rolle `paperless`

Die Rolle betreibt [Paperless-NGX](https://docs.paperless-ngx.com/) per Docker Compose auf der UGREEN NAS, mit Postgres, Redis und einem nächtlichen Backup über `document_exporter`. Dokumente kommen vor allem vom [Scanner](../../../docs/10-scanner.md) am Home-Server; [Paperless-AI](../../../docs/12-paperless-ai.md) läuft im Cluster.

| | |
|---|---|
| URL | http://jays-ugreen:8000 (`192.168.178.118:8000`) |
| Playbook | [`ansible/ugreen-nas.yml`](../../ugreen-nas.yml) (Tag `paperless`) |
| Make | `make nas`, Dry-run `make nas-check` |
| Host-Variablen | [`ansible/host_vars/ugreen-nas/vars.yml`](../../host_vars/ugreen-nas/vars.yml), Secrets in `vault.yml` (Vorlage [`vault.yml.example`](../../host_vars/ugreen-nas/vault.yml.example)) |
| Defaults | [`defaults/main.yml`](defaults/main.yml) |

## Aufbau

Die Rolle prüft zuerst die Secrets und ob `docker compose version` funktioniert. Danach legt sie den Systembenutzer `paperless` (UID/GID 1100) an, rendert `.env` und `docker-compose.yml` nach `/opt/paperless` und startet den Stack mit `community.docker.docker_compose_v2`.

| Service | Image | Daten |
|---|---|---|
| `db` | `paperless_db_image` (`postgres:16-alpine`) | `./db`, Besitzer `70:70` |
| `broker` | `paperless_redis_image` (`redis:8-alpine`) | flüchtig |
| `paperless` | `paperless_image` (`ghcr.io/paperless-ngx/paperless-ngx`) | `./data`, `./media`, `./export`, `./consume`; Port `paperless_http_port` auf 8000 |
| `paperless-ai` | `paperless_ai_image`, nur mit `paperless_ai_enabled: true` | Volume `paperless-ai_data`, Port `paperless_ai_port` |

Renovate pflegt die Image-Tags über die `# renovate:`-Kommentare in `defaults/main.yml`. Secrets stehen nur in `.env` (`0640`). Die Tasks für `.env` und Compose-Datei laufen mit `diff: false`, damit `make nas-check` sie nicht ausgibt.

## Konfiguration

Auf der NAS gesetzt (`vars.yml`):

| Variable | Wert | Zweck |
|---|---|---|
| `paperless_base_dir` | `/opt/paperless` | Compose-Datei, `.env`, Daten und Datenbank |
| `paperless_http_port` | `8000` | Host-Port der Web-UI und API |
| `paperless_ai_enabled` | `false` | Paperless-AI läuft im Cluster, nicht als Sidecar |
| `paperless_db_password`, `paperless_secret_key`, `paperless_admin_password` | Vault (`vault_paperless_*`) | Pflicht, der Pre-flight bricht sonst ab |
| `paperless_admin_user` / `paperless_admin_email` | `admin` / `admin@example.com` | erster Superuser bei Neuinstallation |
| `paperless_backup_dir` | `/volume1/paperless-backups` | Archive auf dem RAID statt auf der eMMC |
| `paperless_backup_required_mount` | `/volume1` | Backup bricht ab, wenn das Volume fehlt |
| `paperless_backup_textfile_dir` | `{{ node_exporter_base_dir }}/textfile` | Metriken für den node-exporter |

Weitere Defaults für das Backup:

| Variable | Default | Zweck |
|---|---|---|
| `paperless_backup_schedule` | `0 2 * * *` | Cron-Zeit (root, Eintrag „Paperless Daily Backup") |
| `paperless_backup_retention_days` | `7` | Aufbewahrung der Archive |
| `paperless_backup_min_files` / `paperless_backup_min_manifest_bytes` | `10` / `1024` | Mindestgröße des Exports |
| `paperless_backup_max_shrink_percent` | `50` | Abbruch, wenn der Export stärker schrumpft (`0` = aus, `FORCE=1` übergeht es einmal) |
| `paperless_backup_secondary_dir` | `""` | optionales zweites Ziel auf anderem Dateisystem |
| `paperless_backup_notify_url` / `paperless_backup_notify_on_success` | `""` / `false` | ntfy-kompatible Push-URL bei Fehlern |

## Backup und Restore

`backup-paperless.sh` läuft per `flock` nie doppelt. Es exportiert mit `document_exporter ../export --delete --no-progress-bar` nach `export/` (`--delete` räumt nur das Export-Verzeichnis auf). Danach prüft es Manifest, Dateizahl, Schrumpfung und freien Platz und schreibt `paperless-backup-YYYYMMDD_HHMMSS.tar.gz` nach `paperless_backup_dir` (erst `.partial`, dann `gzip -t`, Modus `0600`). Alte Archive löscht es nur nach einem Lauf, der alle Prüfungen bestanden hat.

Ergebnis und Metriken landen in `backup.log`, `backup-last-success` und `paperless_backup.prom` (`paperless_backup_last_success_timestamp_seconds`, `paperless_backup_last_run_success` u. a.). Ziel-Volume, zweites Ziel und Alerting beschreibt [Backup](../../../docs/26-backup.md).

```bash
# Backup von Hand, auf der NAS
sudo /opt/paperless/backup-paperless.sh
sudo FORCE=1 /opt/paperless/backup-paperless.sh   # Schrumpf-Prüfung einmal übergehen

# Restore
tar -xzf paperless-backup-YYYYMMDD_HHMMSS.tar.gz -C /opt/paperless/export
docker compose -f /opt/paperless/docker-compose.yml exec -T paperless document_importer ../export
```

## Fallstricke

- Die Compose-Datei bindet relativ (`./data`, `./db` usw.) unter `paperless_base_dir`. `paperless_media_dir`, `paperless_data_dir` und `paperless_consume_dir` legen nur Verzeichnisse an und verschieben keine Mounts.
- `paperless_install_docker` bleibt auf der NAS `false`. UGOS bringt Docker mit; die Option ist nur für ein nacktes Debian/Ubuntu gedacht.
- Projektname `name: paperless`, Postgres-Major-Version und die eMMC-Systempartition: siehe [gotchas.md](../../../docs/gotchas.md#ugreen-nas--portainer--paperless).
