# AliStore Production Runbook

This runbook is the operator checklist for a single-store self-hosted MVP.
It assumes one Linux host for the app and edge proxy, plus PostgreSQL reachable
from that host. Replace example domains and paths before production use.

## 1. Host Baseline

- Ubuntu 22.04+ or Debian 12.
- Node.js 20+ and npm.
- PostgreSQL client tools: `psql`, `pg_dump`, `pg_restore`.
- Docker with Compose plugin for MinIO and Metabase.
- Caddy 2 for TLS and reverse proxy.
- A deploy user with passwordless service restart permissions.

Suggested app path:

```bash
/opt/alistore
```

## 2. Environment Checklist

Create a production env file outside git, for example:

```bash
/etc/alistore/api.env
```

Required values:

```bash
DATABASE_URL=postgresql://alistore_app:<secret>@127.0.0.1:5432/alistore_prod?schema=public
PORT=4000
JWT_SECRET=<32+ byte random secret>
AUTH_OTP_DEV_ECHO=false
OUTBOX_RELAY_ENABLED=true
RESERVATION_SWEEP_ENABLED=true
SERVICE_SLA_SWEEP_ENABLED=true
DEBT_REMINDERS_ENABLED=true
# Production must use a configured provider transport; `log` is development-only
# and is rejected by the strict production preflight.
NOTIFICATION_TRANSPORT=channels
MEDIA_STORAGE=s3
MEDIA_PUBLIC_BASE=https://api.ali.kg/uploads
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
MINIO_BUCKET=alistore
MINIO_ROOT_USER=<secret>
MINIO_ROOT_PASSWORD=<secret>
METABASE_DB_PASS=<secret>
```

When Novu is ready:

```bash
NOTIFICATION_TRANSPORT=novu
NOVU_API_URL=https://api.novu.co
NOVU_API_KEY=<secret>
```

For `NOTIFICATION_TRANSPORT=channels`, configure every channel that the business
uses (including SMTP for email) and verify delivery before enabling the outbox
relay. Missing providers are fail-closed and remain retryable; production must
not be worked around by switching back to `log`.

Never enable `AUTH_OTP_DEV_ECHO=true` outside local development.

## 3. Build And Deploy

From the repository root on the host:

```bash
npm ci
npm run api:build
npm run build -w @alistore/web
npm run db:deploy -w @alistore/api
```

Start the API and web app with your process manager. Example systemd command
shape:

```bash
EnvironmentFile=/etc/alistore/api.env
WorkingDirectory=/opt/alistore
ExecStart=/usr/bin/npm run start:prod -w @alistore/api
```

For Next.js:

```bash
NEXT_PUBLIC_API_BASE=https://api.ali.kg/api npm run start -w @alistore/web
```

### Workstation-backed public demo tunnel

The public demo uses the named Cloudflare tunnel `alistore-erp` and routes
`ali.kg` to the local Web service on port `3000` and `api.ali.kg` to the API on
port `4000`. Start it only for sandbox/demo traffic:

```bash
export CLOUDFLARE_TUNNEL_TOKEN='paste-locally-from-Cloudflare'
npm run public:up
```

The token is read only from the shell environment. Do not put it in Git,
`.env.example`, process logs, screenshots, or chat. This is not a durable
production deployment: a workstation shutdown stops the public site until the
services and tunnel are started again. The production path is the Render
Blueprint and should replace this tunnel before real sales.

## 4. Self-Hosted Services

Copy `apps/api/.env.example` to a host-local `.env`, fill MinIO and Metabase
secrets, then start:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker-compose.yml --env-file .env ps
```

Expected:

- `minio` is healthy.
- `minio-init` exits successfully after bucket creation.
- `metabase` is up on port `3001`.
- `metabase-db` is healthy.

After the first Metabase migration completes, verify the read-only health probe:

```bash
METABASE_URL=http://127.0.0.1:3001 npm run infra:metabase-smoke
```

Metabase must connect to AliStore PostgreSQL with a read-only reporting user,
not the app read-write user.

## 5. Caddy Edge

Validate and reload Caddy:

```bash
caddy validate --config infra/Caddyfile
sudo caddy reload --config infra/Caddyfile
```

Smoke checks:

```bash
curl -fsS https://api.ali.kg/api/health
curl -I https://ali.kg
```

Expected:

- API health returns HTTP 200.
- Storefront returns HTTP 200/308.
- `Strict-Transport-Security` and `Content-Security-Policy` are present.

## 6. Production PostgreSQL Backup Schedule

The macOS production path is `scripts/production-postgres-backup.mjs`. It:

- reads `apps/api/.env.production.local` first, then
  `apps/api/.env.production`; root-level equivalents are compatibility
  fallbacks only, and inherited process variables win over every file;
- requires `BACKUP_EXPECTED_DATABASE_IDENTITY` to exactly match the canonical
  `host:port/database` derived from `DATABASE_URL`;
- produces either a custom dump (default) or plain SQL, verifies it, compresses
  it, and asks the installed `age` binary to validate the public recipient
  before PostgreSQL is contacted;
- uploads only to the private `alistore-backups-prod` R2 bucket over HTTPS,
  downloads the object again to verify its actual SHA-256 bytes, and checks both
  Cloudflare public-domain controls and anonymous S3 access before rotating;
- keeps encrypted local copies and applies the same `BACKUP_KEEP_DAYS` retention
  to exact script-owned names under `postgres/alistore-production/` only;
- holds an exclusive local lock and handles SIGINT/SIGTERM so plaintext working
  files, partial ciphertext, and the lock are cleaned up before launchd's
  120-second exit timeout.

Required production env keys (names only; never put values in tracked files):

```text
DATABASE_URL
BACKUP_EXPECTED_DATABASE_IDENTITY
S3_ENDPOINT
BACKUP_AGE_RECIPIENT
AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
  or MINIO_ROOT_USER + MINIO_ROOT_PASSWORD (existing app aliases)
```

One fail-closed public-surface gate is also required:

```text
# Preferred: account token with only `Workers R2 Storage Read`
CLOUDFLARE_ACCOUNT_ID + BACKUP_CLOUDFLARE_READ_TOKEN

# Or an authenticated HTTPS attestation service
BACKUP_PRIVACY_GATE_URL + BACKUP_PRIVACY_GATE_TOKEN
```

The Cloudflare gate reads both the managed `r2.dev` domain and all custom R2
domains; either being enabled/configured blocks the backup. An external gate
must return a fresh (15 minutes maximum) JSON attestation with
`bucket="alistore-backups-prod"`, `private=true`,
`managedDomainEnabled=false`, `customDomains=[]`, and `checkedAt`. A bare
environment assertion is intentionally not accepted. It must also return the
exact `s3Endpoint` being attested; the native Cloudflare gate similarly requires
its account ID to match the account embedded in `S3_ENDPOINT`.

`S3_BACKUP_BUCKET` may be omitted because it safely defaults to
`alistore-backups-prod`; any other value is rejected. Optional keys are
`S3_REGION` (default `auto`), `BACKUP_FORMAT` (`custom` or `plain`),
`BACKUP_DIR`, and `BACKUP_KEEP_DAYS` (default `14`). The `age` private identity
must be stored separately from the workstation and R2 credentials. Only its
public recipient belongs in the production environment. R2/Cloudflare/database
secrets are never inherited by `pg_dump`, `pg_restore`, `age`, or `psql` child
processes.

Validate tools/configuration and the read-only privacy control-plane gate without
connecting to PostgreSQL or reading/writing R2 objects:

```bash
npm run backup:production:check
```

Validate the generated plist and activation gate without changing launchd:

```bash
npm run backup:production:activate
```

After reviewing that dry run, merge/deploy the files to the stable checkout and
run the activation there. The installer rejects Codex and `/tmp` worktrees so a
cleaned-up worktree cannot silently break the schedule again. Explicitly
install/reload the daily 03:17 agent:

```bash
npm run backup:production:activate -- --apply
```

Installation does not run a backup immediately. A first production run is a
separate, explicit operation; monitor both logs while it runs:

```bash
npm run backup:production:activate -- --apply --run-now
tail -f ~/Library/Logs/alistore-production-backup{,.err}.log
```

The activation script refuses to interrupt a running backup and atomically
replaces the historic broken `kg.alistore.backup` plist. An installation or
bootstrap failure restores/re-bootstraps the previous plist. If only the
explicit `--run-now` kickstart fails, the successfully installed schedule stays
active and the command reports the failed immediate run for investigation. The
generated plist contains only paths and safe runtime settings—not database or
R2 credentials. Do not hand-edit or copy a checkout-specific plist into
`~/Library/LaunchAgents`.

Activation holds the same coordination lock used by backups/drills and checks
launchd once more immediately before bootout. This closes the idle-check race
where a scheduled backup could start while the replacement plist was staged.

The coordination lock records PID, process start token, purpose, and timestamp.
After a hard kill or power loss, a later run recovers it only after proving the
PID exited or was reused with a different start token. The stale metadata is
preserved as `.production-backup.stale-*.json` and an `ALERT` is emitted. An
unreadable/unverifiable lock fails closed and requires manual process review.

For local-only/self-hosted snapshots without R2, `infra/backup.sh` remains
available, but it is not an acceptable production backup path.

## 7. Restore Drill

Run the committed offsite path against an expendable non-production database at
least once before launch and monthly after launch. This is deliberately more
than a local file check: it retrieves the selected object from R2, verifies the
downloaded bytes against its SHA-256 metadata, decrypts it with the separately
held identity, verifies the dump, and restores it.

First create an empty drill database, give the database object a unique sentinel
comment, and pin both. The drill database name must differ from the production
database name regardless of host, DNS alias, tunnel, or alternate endpoint. Put
the following values in a protected operator environment (never a tracked file
or shell history):

```bash
createdb alistore_restore_check
psql postgres -c "COMMENT ON DATABASE alistore_restore_check IS 'alistore-restore-drill:<unique-random-sentinel>'"
export BACKUP_DRILL_OBJECT_KEY=postgres/alistore-production/<exact-object-key>.dump.gz.age
export BACKUP_AGE_IDENTITY_FILE=/secure/offline/backup-identity.txt
export BACKUP_DRILL_DATABASE_URL=postgresql://restore:<secret>@localhost:5432/alistore_restore_check
export BACKUP_EXPECTED_DRILL_DATABASE_IDENTITY=localhost:5432/alistore_restore_check
export BACKUP_EXPECTED_DRILL_SENTINEL=alistore-restore-drill:<unique-random-sentinel>
export BACKUP_ALLOW_DRILL_RESTORE=YES_I_UNDERSTAND
npm run backup:production:restore-drill
psql alistore_restore_check -c 'select count(*) from "AuditEvent";'
dropdb alistore_restore_check
```

The script selects `pg_restore --single-transaction --exit-on-error` for a
`.dump.gz.age` key and `psql --single-transaction --set ON_ERROR_STOP=on` for a
`.sql.gz.age` key. It refuses keys outside the exact owned prefix/filename
contract. Before retrieving the object—and before any `pg_restore --clean` or
restoring `psql`—it runs a read-only catalog query for `current_database()` and
the server-side database comment. A missing/mismatched sentinel, a different
server-reported database name, or the production database name fails closed.

Pass criteria:

- remote byte checksum, decryption, dump verification, and restore all exit 0;
- `AuditEvent` query succeeds.
- A recent order/customer/payment spot-check matches the source database.

Recorded drills:

- 2026-07-18, local dev machine (macOS, PostgreSQL 16.14): PASS — 129/129 table
  row counts and schema identical after restore; full log in
  [`docs/acceptance/BACKUP-RESTORE-DRILL-2026-07-18.md`](../docs/acceptance/BACKUP-RESTORE-DRILL-2026-07-18.md).
  Ran `infra/backup.sh` (local dump), **not** the production path.
- 2026-07-24, local + MinIO: PASS — first drill of the **production code path**
  (`apps/api/src/ops/backup-to-s3.ts` → S3 → `pg_restore` → integrity check via
  `scripts/verify-restored-database.mjs`, 7/7, row counts matched). Surfaced and
  fixed five defects in the backup job (integrity, libpq URL, SSE, rotation,
  memory — commit `d543b9bc`). Full log in
  [`docs/acceptance/BACKUP-RESTORE-DRILL-2026-07-24.md`](../docs/acceptance/BACKUP-RESTORE-DRILL-2026-07-24.md).
  Restore from the actual production R2 bucket and a staging backup job are still
  pending and remain the launch gate.

## 8. Release Smoke

After every deploy:

```bash
curl -fsS https://api.ali.kg/api/health
curl -fsS https://api.ali.kg/api/reports/dashboard >/tmp/alistore-dashboard.json
```

Manual smoke:

- Open storefront.
- Login by OTP.
- Open ERP dashboard.
- Open POS with a staff session.
- Render a receipt or document through the print/export endpoint.

## 9. Rollback

Keep the previous git revision and env file.

```bash
git checkout <previous-sha>
npm ci
npm run api:build
npm run build -w @alistore/web
sudo systemctl restart alistore-api alistore-web
```

Only roll back database migrations if the release plan explicitly marked the
migration reversible. Prefer forward fixes for data-bearing migrations.
