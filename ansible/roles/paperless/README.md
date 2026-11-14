# Ansible role: `paperless`

Deploys [Paperless-ngx](https://docs.paperless-ngx.com/) on a Linux host
using Docker Compose, together with its Postgres database, Redis broker,
an optional Paperless-AI sidecar, and a daily document-exporter backup.

The role provisions the Docker host (on Debian/Ubuntu and RHEL-family
systems), creates a dedicated unprivileged system user, renders the
Compose stack from templates, and brings it up via the
`community.docker.docker_compose_v2` module.

## What gets deployed

The rendered `docker-compose.yml` defines:

- **`db`** — Postgres (default `postgres:16-alpine`), data persisted in
  `{{ paperless_db_dir }}` on the host (owned by UID/GID `70:70`, the
  default for the alpine image).
- **`broker`** — Redis (default `redis:8-alpine`), used as Paperless's
  task broker. Ephemeral.
- **`paperless`** — Paperless-ngx, with host volumes for data, media,
  consume, and export directories, and `paperless_http_port` on the host
  mapped to `8000` in the container.
- **`paperless-ai`** *(optional)* — Inline Paperless-AI sidecar, enabled
  by `paperless_ai_enabled: true`. Connects to the Paperless service over
  the shared `paperless_net` network at `http://paperless:8000`.

In addition to the Compose stack, the role installs a `cron` job that
runs a Paperless `document_exporter` every night, checks the export for
plausibility, archives it, and prunes archives older than the configured
retention (see [Backup and restore](#backup-and-restore)).

## Requirements

- A Debian/Ubuntu or RHEL-family host. The role installs `docker-ce`,
  `docker-ce-cli`, `containerd.io`, and `docker-compose-plugin` on
  Debian/Ubuntu via the official Docker apt repository, and `docker` via
  `yum`/`dnf` on RHEL-family systems.
- SSH access with `become: true` (root) to install packages, create the
  system user, write to `/opt/paperless`, and install the cron entry.
- For Paperless-AI: an outgoing network path from the NAS to the LLM
  provider configured inside Paperless-AI (this role does not manage
  provider credentials).

## Variables

All variables live in [`defaults/main.yml`](defaults/main.yml). Defaults
shown verbatim.

### Ownership

| Variable           | Default       | Purpose                                            |
| ------------------ | ------------- | -------------------------------------------------- |
| `paperless_user`   | `paperless`   | System user that owns the stack files              |
| `paperless_group`  | `paperless`   | Primary group for the user                         |
| `paperless_uid`    | `1100`        | Fixed UID (mapped into the container as `USERMAP_UID`) |
| `paperless_gid`    | `1100`        | Fixed GID (mapped into the container as `USERMAP_GID`) |

### Paths

| Variable                  | Default                              | Purpose                                          |
| ------------------------- | ------------------------------------ | ------------------------------------------------ |
| `paperless_base_dir`      | `/opt/paperless`                     | Root directory for the Compose file and state   |
| `paperless_media_dir`     | `{{ paperless_base_dir }}/media`     | Document media (originals, thumbnails)          |
| `paperless_data_dir`      | `{{ paperless_base_dir }}/data`      | Paperless app data (search index, settings)     |
| `paperless_db_dir`        | `{{ paperless_base_dir }}/db`        | Postgres data directory                         |
| `paperless_consume_dir`   | `{{ paperless_base_dir }}/consume`   | Inbox watched for new documents                 |
| `paperless_export_dir`    | `{{ paperless_base_dir }}/export`    | `document_exporter` output (read by backup job) |
| `paperless_backup_dir`    | `{{ paperless_base_dir }}/backups`   | Archived backups (NAS: `/volume1/paperless-backups`) |

### Networking

| Variable               | Default | Purpose                                          |
| ---------------------- | ------- | ------------------------------------------------ |
| `paperless_http_port`  | `8000`  | Host port mapped to Paperless's container port 8000 |
| `paperless_ai_port`    | `3000`  | Host port for the optional Paperless-AI sidecar  |

### Images

| Variable                | Default                                            |
| ----------------------- | -------------------------------------------------- |
| `paperless_image`       | `ghcr.io/paperless-ngx/paperless-ngx:3.0.5`        |
| `paperless_db_image`    | `postgres:16-alpine`                               |
| `paperless_redis_image` | `redis:8-alpine`                                   |
| `paperless_ai_image`    | `clusterzx/paperless-ai:3.0.9`                     |

### Database

| Variable                | Default                       | Purpose                                       |
| ----------------------- | ----------------------------- | --------------------------------------------- |
| `paperless_db_user`     | `paperless`                   | Postgres role                                 |
| `paperless_db_name`     | `paperless`                   | Database name                                 |
| `paperless_db_password` | `paperless_pass_change_me`    | **Change this.** Override via Ansible Vault.  |
| `paperless_db_uid`      | `70`                          | UID that owns `{{ paperless_db_dir }}` — must match the `postgres:alpine` user |
| `paperless_db_gid`      | `70`                          | GID that owns `{{ paperless_db_dir }}`        |

### Backup

| Variable                                    | Default                                    | Purpose |
| ------------------------------------------- | ------------------------------------------ | ------- |
| `paperless_backup_schedule`                 | `0 2 * * *`                                | Five-field crontab schedule for the nightly backup |
| `paperless_backup_retention_days`           | `7`                                        | Number of days of `.tar.gz` archives to keep |
| `paperless_backup_log_file`                 | `{{ paperless_base_dir }}/backup.log`      | Cron output of the backup script |
| `paperless_backup_status_file`              | `{{ paperless_base_dir }}/backup-last-success` | `key=value` file written after every good run (timestamp, archive, sizes, document count) |
| `paperless_backup_exporter_args`            | `[--delete, --no-progress-bar]`            | Extra arguments for `document_exporter` |
| `paperless_backup_min_files`                | `10`                                       | Minimum number of files in the export, otherwise the run fails |
| `paperless_backup_min_manifest_bytes`       | `1024`                                     | Minimum size of `manifest.json` |
| `paperless_backup_max_shrink_percent`       | `50`                                       | Fail if the export shrank by more than this vs. the last good run (`0` = off, `FORCE=1` overrides once) |
| `paperless_backup_required_mount`           | `""`                                       | Path that must be a mount point, otherwise the run aborts (NAS: `/volume1`) |
| `paperless_backup_secondary_dir`            | `""`                                       | Optional second target directory; the finished archive is copied there too |
| `paperless_backup_secondary_retention_days` | `{{ paperless_backup_retention_days }}`    | Retention in the second target |
| `paperless_backup_notify_url`               | `""`                                       | Optional ntfy-compatible URL for a push on failure |
| `paperless_backup_notify_on_success`        | `false`                                    | Also push after a successful run |
| `paperless_backup_textfile_dir`             | `""`                                       | node-exporter textfile directory for `paperless_backup.prom` |

### Paperless-AI sidecar

| Variable                | Default   | Purpose                                                       |
| ----------------------- | --------- | ------------------------------------------------------------- |
| `paperless_ai_enabled`  | `false`   | When `true`, an additional `paperless-ai` service is added to the Compose stack |
| `paperless_ai_image`    | see above | Image used for the sidecar                                    |
| `paperless_ai_port`     | `3000`    | Host port mapped to the sidecar's container port 3000         |

### Initial admin user

These are read by `env.j2` and used by Paperless-ngx to create the first
superuser on a fresh installation. None of them have a corresponding
entry in `defaults/main.yml`; set them in `host_vars` or a vaulted file.
`paperless_admin_password` is **required** — a pre-flight `assert` fails
the run if it's unset, so the deployment can no longer silently fall back
to the `admin` / `admin` default. `paperless_admin_user` and
`paperless_admin_email` still fall back to `admin` /
`admin@example.com` if unset.

| Variable                    | Fallback                   |
| --------------------------- | --------------------------- |
| `paperless_admin_user`      | `admin`                    |
| `paperless_admin_password`  | *(required, no fallback)*  |
| `paperless_admin_email`     | `admin@example.com`        |

### Compose internals

| Variable                  | Default               | Purpose                                          |
| ------------------------- | --------------------- | ------------------------------------------------ |
| `paperless_compose_file`  | `docker-compose.yml`  | Filename of the rendered Compose file            |

## Backup and restore

The role templates `backup-paperless.sh.j2` to
`{{ paperless_base_dir }}/backup-paperless.sh` and registers a cron entry
matching `paperless_backup_schedule` (default: every night at 02:00).

The script (`set -euo pipefail`, one run at a time via `flock`):

1. Aborts if `paperless_backup_required_mount` is set and not mounted.
2. Runs `docker compose exec -T paperless document_exporter ../export
   --delete --no-progress-bar`, updating the export in
   `{{ paperless_export_dir }}`. `--delete` removes files from the export
   directory that no longer belong to the current export (deleted or
   renamed documents); it does not touch `media/` or existing archives.
3. Checks the export: `manifest.json` exists, is large enough and was
   rewritten by this run; minimum number of files; not drastically smaller
   than the last good export; enough free space for the archive.
4. Creates `{{ paperless_backup_dir }}/paperless-backup-YYYYMMDD_HHMMSS.tar.gz`
   (written as `.partial`, verified with `gzip -t`, then renamed; mode `0600`).
5. Writes the status file and, if configured, `paperless_backup.prom`
   (`paperless_backup_last_success_timestamp_seconds`,
   `paperless_backup_last_run_success`, `paperless_backup_archive_size_bytes`,
   `paperless_backup_documents`).
6. Removes archives older than `paperless_backup_retention_days` — only in
   runs that passed all checks, so a broken export never rotates good
   archives away.
7. Optionally copies the archive to `paperless_backup_secondary_dir`
   (must exist and be on another filesystem; a failed copy fails the run
   but keeps the primary archive).

Any failure is logged with the failing stage, sets
`paperless_backup_last_run_success 0` and, if `paperless_backup_notify_url`
is set, sends a push (`curl -H "Title: …" -d "…" <url>`).

Output is appended to `{{ paperless_backup_log_file }}`. Operational notes
for the NAS (target volume, second target, alerting): `docs/26-backup.md`.

To restore, copy the most recent archive into the export directory,
extract it, and run the importer inside the container:

```bash
tar -xzf paperless-backup-YYYYMMDD_HHMMSS.tar.gz -C {{ paperless_export_dir }}
docker compose -f {{ paperless_base_dir }}/docker-compose.yml \
  exec -T paperless document_importer ../export
```

## Paperless-AI sidecar

Setting `paperless_ai_enabled: true` adds a second service to the Compose
file that runs `{{ paperless_ai_image }}`, mounts a named volume
(`paperless-ai_data`) for state, publishes `paperless_ai_port` on the
host, and is configured with:

- `PUID` / `PGID` matching `paperless_uid` / `paperless_gid`
- `RAG_SERVICE_URL=http://paperless:8000` (resolved on the
  `paperless_net` Docker network)
- `RAG_SERVICE_ENABLED=true`

LLM provider credentials are configured through the Paperless-AI web UI
on first access, not through this role.

This is the **inline** Paperless-AI deployment, intended for hosts that
also run Paperless-ngx. For a standalone Paperless-AI install on a
different host (such as a Raspberry Pi), use the separate `paperless-ai`
role and point its `paperless_url` at the NAS.

## Example usage

```yaml
- hosts: ugreen-nas
  become: true
  roles:
    - role: paperless
      vars:
        paperless_base_dir: /volume1/@docker/paperless
        paperless_http_port: 8000
        paperless_ai_enabled: true
        paperless_db_password: "{{ vault_paperless_db_password }}"
        paperless_admin_password: "{{ vault_paperless_admin_password }}"
```

With the corresponding vault file
(`inventory/host_vars/ugreen-nas/vault.yml`, encrypted):

```yaml
vault_paperless_db_password: replace-with-a-strong-password
vault_paperless_admin_password: replace-with-a-strong-password
```

## Files and directories created

On the target host, after a successful run:

```
{{ paperless_base_dir }}/
├── .env
├── docker-compose.yml
├── backup-paperless.sh
├── backup.log
├── backup-last-success
├── backups/            # or paperless_backup_dir elsewhere
│   └── paperless-backup-*.tar.gz
├── consume/
├── data/
├── db/                 # owned by paperless_db_uid:paperless_db_gid
├── export/
└── media/
```

A `Paperless Daily Backup` cron entry is added for `root`, running
`{{ paperless_base_dir }}/backup-paperless.sh` on
`paperless_backup_schedule`.
