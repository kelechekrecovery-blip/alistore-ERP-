# Wave 1 release evidence — 2026-08-05

## Local web build and cache gate

`npm run build -w @alistore/web` passed. A production `next start` on port 3100 passed `scripts/deployment-smoke.mjs` with:

- `/healthz`: 200
- `/checkout`: `Cache-Control: no-store`
- `/cart`: `Cache-Control: no-store`
- API liveness/readiness: 200
- catalog: 200 with items

## iOS release gates

`npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing` passed for all four apps (metadata, privacy manifest, ASC credentials, distribution identity and provisioning profiles).

`npm run ios:review-readiness -- --env-file apps/ios/.env.production` passed for client, staff, courier and POS reviewer configurations.

## Public deployment state

GitHub CD run: [30961519089](https://github.com/kelechekrecovery-blip/alistore-ERP-/actions/runs/30961519089).

- migration rehearsal: passed;
- deploy job: failed because Render deploy-hook secrets are not configured;
- health-check: skipped by workflow after deploy failure.

This remains `BLOCKED_OWNER`: configure `RENDER_DEPLOY_HOOK_API_PROD`, `RENDER_DEPLOY_HOOK_WEB_PROD`, and `RENDER_DEPLOY_HOOK_WORKER_PROD`, then rerun the workflow and purge any stale edge cache if needed. No release completion is claimed here.
