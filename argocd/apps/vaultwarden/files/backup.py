#!/usr/bin/env python3
import os
import sqlite3
import sys
import tarfile
import time
import urllib.error
import urllib.request

DATA_DIR = "/data"
BACKUP_DIR = "/backup"
TMP_DIR = "/tmp/vaultwarden-backup"
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "14"))
GOTIFY_ENABLED = os.environ.get("GOTIFY_ENABLED", "false") == "true"
GOTIFY_URL = os.environ.get("GOTIFY_URL", "")
GOTIFY_TOKEN = os.environ.get("GOTIFY_TOKEN", "")


def notify_failure(message):
    if not (GOTIFY_ENABLED and GOTIFY_URL and GOTIFY_TOKEN):
        return
    data = f"title=Vaultwarden backup failed&message={message}&priority=8".encode()
    req = urllib.request.Request(f"{GOTIFY_URL}/message?token={GOTIFY_TOKEN}", data=data, method="POST")
    try:
        urllib.request.urlopen(req, timeout=5)
    except urllib.error.URLError:
        pass


def backup_database(db_path, stage_db_path):
    # Read-only URI so this never attempts to write the live, read-only-mounted DB.
    source = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    dest = sqlite3.connect(stage_db_path)
    with dest:
        source.backup(dest)
    dest.close()
    source.close()


def build_archive(stage_db_path, archive_path):
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(stage_db_path, arcname="db.sqlite3")
        for name in ("rsa_key.pem", "rsa_key.pub.pem", "config.json"):
            path = os.path.join(DATA_DIR, name)
            if os.path.isfile(path):
                tar.add(path, arcname=name)
        for name in ("attachments", "sends"):
            path = os.path.join(DATA_DIR, name)
            if os.path.isdir(path):
                tar.add(path, arcname=name)


def prune_old_archives():
    cutoff = time.time() - RETENTION_DAYS * 86400
    for entry in os.listdir(BACKUP_DIR):
        if not (entry.startswith("vaultwarden-") and entry.endswith(".tar.gz")):
            continue
        path = os.path.join(BACKUP_DIR, entry)
        if os.path.getmtime(path) < cutoff:
            os.remove(path)


def main():
    db_path = os.path.join(DATA_DIR, "db.sqlite3")
    if not os.path.isfile(db_path):
        print(f"No db.sqlite3 yet under {DATA_DIR} — vault has never started successfully. Skipping.")
        return

    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stage_db_path = os.path.join(TMP_DIR, "db.sqlite3")

    print("Running SQLite online backup...")
    backup_database(db_path, stage_db_path)

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    archive_path = os.path.join(BACKUP_DIR, f"vaultwarden-{timestamp}.tar.gz")
    print(f"Assembling archive {archive_path}...")
    build_archive(stage_db_path, archive_path)

    print(f"Pruning archives older than {RETENTION_DAYS} days...")
    prune_old_archives()

    print(f"Backup completed: {archive_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # top-level guard: notify Gotify + fail the Job
        notify_failure(str(exc))
        print(f"Backup failed: {exc}", file=sys.stderr)
        sys.exit(1)
