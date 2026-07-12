# AliStore — self-hosted v1 infrastructure

> Docker is not installed on the current dev machine, so the Compose document is
> parser-validated but still requires a live container smoke on staging.

## Services (`docker-compose.yml`)

| Service       | Port                         | Purpose                                            |
| ------------- | ---------------------------- | -------------------------------------------------- |
| `redis`       | 6379                         | BullMQ/cache transport; never business truth       |
| `meilisearch` | 7700                         | Catalog search with PostgreSQL fallback            |
| `minio`       | 9000 (S3 API), 9001 (console)| Object storage — product photos, Evidence Vault    |
| `minio-init`  | —                            | One-shot: creates the default bucket               |
| `metabase`    | 3001                         | Owner BI / Command Center dashboards               |
| `metabase-db` | —                            | Postgres for Metabase's own app data               |

## Run

```bash
cp apps/api/.env.example .env        # fill MINIO_/METABASE_/NOVU_ values
docker compose -f infra/docker-compose.yml --env-file .env up -d
```

For production deployment, backup, restore drill and rollback steps, use
[`RUNBOOK.md`](./RUNBOOK.md).

- **MinIO console** — http://localhost:9001 (login: `MINIO_ROOT_USER` /
  `MINIO_ROOT_PASSWORD`). S3 endpoint for the app: `http://localhost:9000`.
- **Metabase** — http://localhost:3001. On first boot, connect it to the AliStore
  Postgres (`alistore_dev`) with a **read-only** reporting user — never the app's
  read-write credentials.
- **Redis** — password is required even locally; use the matching `REDIS_URL` in
  the API/worker environment.
- **Meilisearch** — configure `MEILI_HOST=http://localhost:7700`, the same
  `MEILI_API_KEY`, and run the protected catalog reindex endpoint once after boot.

## Notifications (Novu)

The API delivers outbox messages via Novu's REST trigger API
(`NovuHttpTransport`, no SDK). Two ways to get a Novu:

1. **Novu Cloud** (simplest for a single store) — create a workflow whose trigger
   identifier equals the outbox `template` (e.g. `reservation_expired`), copy the
   API key, then in `.env`:

   ```bash
   NOTIFICATION_TRANSPORT=novu
   NOVU_API_KEY=<your key>
   # NOVU_API_URL stays https://api.novu.co for Cloud
   ```

2. **Self-hosted Novu** — Novu ships an official compose; it is an 8-service
   cluster (api, worker, ws, web, MongoDB, Redis). It is intentionally **not**
   reproduced here to avoid shipping an unverified cluster. Follow
   <https://docs.novu.co/community/self-hosting-novu/deploy-with-docker> and point
   `NOVU_API_URL` at your instance.

Until `NOTIFICATION_TRANSPORT=novu`, outbox deliveries are logged
(`LogNotificationTransport`) — no external calls, so nothing breaks without Novu.

## Wiring summary

| Concern       | App env                                   | Where it's used            |
| ------------- | ----------------------------------------- | -------------------------- |
| Notifications | `NOTIFICATION_TRANSPORT`, `NOVU_API_*`    | `OutboxModule` transport   |
| Object store  | `MINIO_*`                                 | (pending an upload surface)|
| Jobs/cache    | `REDIS_URL`, `REDIS_PASSWORD`             | BullMQ/cache runtime       |
| Search        | `MEILI_HOST`, `MEILI_API_KEY`             | Catalog adapter            |
| BI            | connect Metabase → `alistore_dev` (RO)    | Metabase UI                |
