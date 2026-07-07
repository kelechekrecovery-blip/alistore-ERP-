#!/usr/bin/env bash
# AliStore — nightly PostgreSQL backup (pg_dump custom format + gzip + rotation).
#
# ⚠️ Authored, NOT run locally. Wire to cron on the DB host, e.g.:
#     0 3 * * *  DATABASE_NAME=alistore_prod /opt/alistore/infra/backup.sh
# For continuous PITR (point-in-time recovery) use pgBackRest or wal-g instead —
# this script is the simple daily-snapshot baseline.
set -euo pipefail

DB="${DATABASE_NAME:-alistore_prod}"
DIR="${BACKUP_DIR:-/var/backups/alistore}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$DIR/$DB-$stamp.dump.gz"

pg_dump --format=custom "$DB" | gzip > "$out"

# Rotate: drop backups older than KEEP_DAYS.
find "$DIR" -name "$DB-*.dump.gz" -mtime +"$KEEP_DAYS" -delete

echo "backup written: $out"
