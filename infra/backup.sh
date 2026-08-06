#!/usr/bin/env bash
# AliStore — local/self-hosted PostgreSQL backup (custom format + gzip + rotation).
#
# This is not the production workstation/R2 path. Production uses
# scripts/production-postgres-backup.mjs so that the dump is verified, encrypted
# before upload, checked for private access, and retained both locally and in R2.
#
# Status: run and restore-verified locally on 2026-07-18 — full drill log in
# docs/acceptance/BACKUP-RESTORE-DRILL-2026-07-18.md (129/129 table row counts and
# schema match after restore). The historic dev LaunchAgent has been retired; it
# referenced a copied script that could disappear. See infra/RUNBOOK.md for the
# gated production agent.
# Server cron example:
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
