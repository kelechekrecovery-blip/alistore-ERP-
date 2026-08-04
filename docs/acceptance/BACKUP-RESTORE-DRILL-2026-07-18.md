# Backup/Restore Drill — 2026-07-18 (GAP-BACKUP-OPS-001, local slice)

Scope: **local dev machine proof** (macOS, Homebrew PostgreSQL 16.14). This is NOT a
staging certification — staging/prod require the owner (server + credentials) and the
staging gate in `BACKLOG.md` stays open.

## What was proven

1. `infra/backup.sh` runs unmodified against the local dev database.
2. A pg_dump custom-format backup restores into a separate throwaway database with
   **zero row-count drift across all 129 public tables** and an identical schema.
3. The backup of the real local `alistore_dev` database also restores cleanly.
4. Daily scheduling is live on this machine via a user-level LaunchAgent
   (`gui/501/kg.alistore.backup`, daily 03:17), loaded and smoke-kickstarted with
   exit code 0.

## Source database (throwaway, seeded)

`alistore_dev` holds schema only (117 migrations, 1 StorePoint row, 0 business rows),
so a throwaway source was built to make the drill meaningful:

```bash
createdb alistore_backup_drill_src
cd apps/api
DATABASE_URL="postgresql://alistore@localhost:5432/alistore_backup_drill_src?schema=public" \
  npx prisma migrate deploy            # exit 0 — all migrations applied
DATABASE_URL=... npx ts-node prisma/seed.ts   # exit 0 — repo minimal seed
# + scratch supplementary seed (not committed): 1 Order + 1 OrderItem + 1 Payment
#   (card, received, 109900) + 1 AuditEvent + 1 OutboxMessage — exit 0
```

Source contents: 6 Product, 12 DeviceUnit, 1 Customer, 1 StorePoint, 1 Order,
1 OrderItem, 1 Payment, 1 AuditEvent, 1 OutboxMessage (+129 tables total).

## Backup run (script as committed)

```bash
DATABASE_NAME=alistore_dev BACKUP_DIR="$HOME/backups/alistore" BACKUP_KEEP_DAYS=14 \
  bash infra/backup.sh                # exit 0
DATABASE_NAME=alistore_backup_drill_src BACKUP_DIR="$HOME/backups/alistore" \
  BACKUP_KEEP_DAYS=14 bash infra/backup.sh   # exit 0
```

SHA-256 of the dumps:

```
894de9d0be259504153a961563d1e86c03623894547234a8e76b7b250d13c98f  alistore_backup_drill_src-20260718-091512.dump.gz
045fefbd79a731dfc4a5c0c9a6b6e2c541dcb7e6f897014a9f6cae90a162dd1a  alistore_dev-20260718-091512.dump.gz
d907656ea74b1ebc3b620e1240a488ef24512054a80f214e0f1d5586e5e6ce8b  alistore_dev-20260718-091829.dump.gz  (LaunchAgent kickstart run)
```

## Restore drill

```bash
createdb alistore_backup_drill_restore
gzip -dc ~/backups/alistore/alistore_backup_drill_src-20260718-091512.dump.gz \
  | pg_restore --dbname=alistore_backup_drill_restore --no-owner --no-privileges
# pg_restore exit 0
```

Integrity checks (all PASS):

- **Row counts, all 129 public tables**: `SELECT count(*)` per table on source and
  restore, `diff` → empty (`COUNTS_MATCH_129_TABLES=yes`).
- **Schema**: `pg_dump --schema-only --no-owner --no-privileges` on both, `diff` →
  identical after filtering pg_dump's per-run random `\restrict`/`\unrestrict` tokens
  (`SCHEMA_MATCH=yes`).
- **Spot checks, identical on both databases**:

  | Check | Value |
  | --- | --- |
  | Order | `cmrpsmtat00011335sjqysa30`, status `paid`, total `109900` |
  | Payment | `cmrpsmtbg00041335bjfwujbi`, `card`, `received`, `109900` |
  | AuditEvent | `order.paid` / actor `backup-drill`, payload md5 `4f42956a842cd32bfe86d7728b352bfb` |
  | OutboxMessage | `sms` / `order_paid`, payload md5 `b86e7155000c3dba7f87e86787aa0efb` |
  | Product sums | `sum(price)=539400`, `sum(cost)=452000` |
  | DeviceUnit IMEIs | all 12 serials identical |

- **Real dev DB backup restores too**: `alistore_dev-20260718-091512.dump.gz` →
  fresh database, `pg_restore` exit 0, 129 tables, 117 `_prisma_migrations` rows.

Cleanup: `dropdb alistore_backup_drill_src; dropdb alistore_backup_drill_restore`
— both dropped, `psql -l | grep backup_drill` → 0 matches. The drill-source dump was
deleted; the two `alistore_dev` dumps stay in `~/backups/alistore/` under 14-day
rotation.

## Scheduling (this machine, user-level, no sudo)

- Plist: `~/Library/LaunchAgents/kg.alistore.backup.plist`
  (template committed at `infra/macos/kg.alistore.backup.plist`).
- Loaded: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/kg.alistore.backup.plist` → exit 0.
- Smoke run: `launchctl kickstart gui/$(id -u)/kg.alistore.backup` → `last exit code = 0`,
  log `backup written: /Users/alistore/backups/alistore/alistore_dev-20260718-091829.dump.gz`.
- Schedule: daily 03:17 (`StartCalendarInterval`), logs at
  `~/Library/Logs/alistore-backup{,.err}.log`, retention 14 days via `BACKUP_KEEP_DAYS`.
- Target DB: local `alistore_dev`; destination `~/backups/alistore/`.

**macOS caveat found during the drill**: launchd children are TCC-restricted from
`~/Desktop` ("Operation not permitted", exit 126). The agent therefore runs an
installed copy at `~/bin/alistore-backup.sh` (mirrors the RUNBOOK `install` pattern
on servers). Refresh it after editing the repo script:
`cp infra/backup.sh ~/bin/alistore-backup.sh`.

Unload: `launchctl bootout gui/$(id -u)/kg.alistore.backup` (optionally delete the
plist file afterwards).

## Not done here (remains for the staging gate)

- Scheduled backups **on the staging DB host** + recorded restore on staging.
- PITR (wal-g/pgBackRest) — daily snapshots only; RPO = up to 24 h.
- Backup of Evidence objects (S3/MinIO bucket versioning/replication).
