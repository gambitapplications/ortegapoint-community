#!/bin/bash
# Ortega Point Community nightly backup.
#   - Consistent SQLite snapshot via `.backup`
#   - Storage dir via rsync with --link-dest (hardlinked time-machine style)
#   - Keeps the last 14 snapshots

set -euo pipefail

STORAGE_ROOT="${ORTEGA_STORAGE_ROOT:-$HOME/ortegapoint-community-storage}"
DATA_DIR="${ORTEGA_DATA_DIR:-$HOME/ortegapoint-community-data}"
BACKUP_DIR="${ORTEGA_BACKUP_DIR:-$HOME/ortegapoint-community-backups}"
RETAIN=14

DB_FILE="$DATA_DIR/ortegapoint-community.sqlite"
STAMP="$(date +%Y-%m-%dT%H-%M)"
DEST="$BACKUP_DIR/$STAMP"
LATEST="$BACKUP_DIR/latest"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR" "$DEST"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"
}

log "start snapshot $STAMP -> $DEST"

if [ -f "$DB_FILE" ]; then
  /usr/bin/sqlite3 "$DB_FILE" ".backup '$DEST/ortegapoint-community.sqlite'"
  log "sqlite snapshot ok ($(du -h "$DEST/ortegapoint-community.sqlite" | cut -f1))"
else
  log "warn: sqlite file missing at $DB_FILE"
fi

LINK_ARGS=()
if [ -L "$LATEST" ] && [ -d "$LATEST/storage" ]; then
  LINK_ARGS=(--link-dest="$LATEST/storage")
fi

if [ -d "$STORAGE_ROOT" ]; then
  /usr/bin/rsync -a ${LINK_ARGS[@]+"${LINK_ARGS[@]}"} "$STORAGE_ROOT/" "$DEST/storage/"
  log "storage snapshot ok ($(du -sh "$DEST/storage" | cut -f1))"
else
  log "warn: storage dir missing at $STORAGE_ROOT"
fi

ln -sfn "$DEST" "$LATEST"

# Prune old snapshots (keep the last $RETAIN, plus the 'latest' symlink).
cd "$BACKUP_DIR"
ls -1dt 20*-* 2>/dev/null | tail -n +$((RETAIN + 1)) | while read -r old; do
  if [ -n "$old" ] && [ -d "$old" ]; then
    rm -rf "$old"
    log "pruned $old"
  fi
done

log "done $STAMP"
