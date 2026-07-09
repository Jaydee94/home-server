#!/bin/sh
set -eu

DATA_DIR="/data"
BACKUP_DIR="/backup"
TMP_DIR="/tmp/vaultwarden-backup"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="$BACKUP_DIR/vaultwarden-$TIMESTAMP.tar.gz"

notify_failure() {
  status=$?
  if [ "${GOTIFY_ENABLED:-false}" = "true" ] && [ -n "${GOTIFY_URL:-}" ] && [ -n "${GOTIFY_TOKEN:-}" ]; then
    curl -fsS -m 5 -X POST "$GOTIFY_URL/message?token=$GOTIFY_TOKEN" \
      -F "title=Vaultwarden backup failed" \
      -F "message=Backup job exited with status $status at $(date -Iseconds)" \
      -F "priority=8" || true
  fi
  exit "$status"
}
trap notify_failure EXIT

apk add --no-cache sqlite tar curl >/dev/null

if [ ! -f "$DATA_DIR/db.sqlite3" ]; then
  echo "No db.sqlite3 yet under $DATA_DIR — vault has never started successfully. Skipping."
  trap - EXIT
  exit 0
fi

STAGE_DIR="$TMP_DIR/stage"
rm -rf "$TMP_DIR"
mkdir -p "$STAGE_DIR" "$BACKUP_DIR"

echo "Running SQLite online backup..."
sqlite3 "$DATA_DIR/db.sqlite3" ".backup '$STAGE_DIR/db.sqlite3'"

for f in rsa_key.pem rsa_key.pub.pem config.json; do
  [ -f "$DATA_DIR/$f" ] && cp "$DATA_DIR/$f" "$STAGE_DIR/$f"
done
for d in attachments sends; do
  [ -d "$DATA_DIR/$d" ] && cp -a "$DATA_DIR/$d" "$STAGE_DIR/$d"
done

echo "Assembling archive $ARCHIVE..."
tar -C "$STAGE_DIR" -czf "$ARCHIVE" .

echo "Pruning archives older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name 'vaultwarden-*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete

rm -rf "$TMP_DIR"
echo "Backup completed: $ARCHIVE"
trap - EXIT
