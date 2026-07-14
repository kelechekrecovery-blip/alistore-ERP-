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
NOTIFICATION_TRANSPORT=log
MEDIA_STORAGE=s3
MEDIA_PUBLIC_BASE=https://api.alistore.kg/uploads
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
NEXT_PUBLIC_API_BASE=https://api.alistore.kg/api npm run start -w @alistore/web
```

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
curl -fsS https://api.alistore.kg/api/health
curl -I https://alistore.kg
```

Expected:

- API health returns HTTP 200.
- Storefront returns HTTP 200/308.
- `Strict-Transport-Security` and `Content-Security-Policy` are present.

## 6. Backup Schedule

Install the backup script on the DB host:

```bash
sudo install -m 0750 infra/backup.sh /opt/alistore/infra/backup.sh
sudo mkdir -p /var/backups/alistore
```

Cron example:

```cron
0 3 * * * DATABASE_NAME=alistore_prod BACKUP_DIR=/var/backups/alistore BACKUP_KEEP_DAYS=14 /opt/alistore/infra/backup.sh
```

After the first run:

```bash
ls -lh /var/backups/alistore
```

The newest file should match:

```bash
alistore_prod-YYYYMMDD-HHMMSS.dump.gz
```

## 7. Restore Drill

Run this on a non-production database at least once before launch and monthly
after launch.

```bash
createdb alistore_restore_check
gzip -dc /var/backups/alistore/<backup>.dump.gz | pg_restore --clean --if-exists --dbname=alistore_restore_check
psql alistore_restore_check -c 'select count(*) from "AuditEvent";'
dropdb alistore_restore_check
```

Pass criteria:

- `pg_restore` exits 0.
- `AuditEvent` query succeeds.
- A recent order/customer/payment spot-check matches the source database.

## 8. Release Smoke

After every deploy:

```bash
curl -fsS https://api.alistore.kg/api/health
curl -fsS https://api.alistore.kg/api/reports/dashboard >/tmp/alistore-dashboard.json
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
