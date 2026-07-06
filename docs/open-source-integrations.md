# Open Source Integration Map

AliStore is a retail operating system, not a generic storefront. Integrations must
protect the core invariants: append-only Event Ledger, IMEI/SN uniqueness,
server-side approvals, payment reconciliation, offline/POS recovery, and consent.

## Adopt Now

| Project | Fit | How to integrate |
|---|---|---|
| `@nestjs/swagger` | API contracts for web, POS, mobile, and future SDK generation. | Installed in `apps/api`; `/api/docs` and `/api/docs-json` now expose the current orders/payments REST contract. |
| `openapi-typescript` | Generate shared TS types from `/api/docs-json` for Next.js and mobile clients. | Add after web scaffold exists; keep generated code out of hand-written domain services. |
| `Orval` | Generate typed fetch/React Query hooks from OpenAPI. | Use after the first real storefront pages land; pair with stable operation ids. |

## MVP / v1 Candidates

| Project | Fit | Recommended timing |
|---|---|---|
| Meilisearch | Catalog search with typo tolerance, facets, category filters, search-as-you-type. | MVP storefront, after Product/SKU APIs exist. Keep Postgres as source of truth; index from Product events. |
| BullMQ | Redis-backed queues for Notifications Outbox, payment webhook retry, expired reservations, offline POS sync. | MVP infra once Redis is introduced. Do not mutate money/stock outside audited service transactions. |
| CASL | Shared TypeScript permission rules for Role Permission Matrix. | v1 approvals/role work. Server remains authoritative; UI only hides unavailable actions. |
| Keycloak | Self-hosted identity provider for SSO, 2FA, social login, account management. | After MVP auth shape is settled. Use only if OTP/social/2FA complexity justifies external IdP overhead. |
| MinIO | S3-compatible storage for Evidence Vault: photos, acts, contracts, warranty/trade-in files. | v1 evidence workflows. Note AGPL license and keep files referenced by audit events. |
| Temporal | Durable workflows for long-running approval, courier COD, warranty/RMA, offline recovery. | v1/v2 if BullMQ jobs become too stateful or need durable orchestration. |
| PostHog | Product analytics, session replay, feature flags, experiments. | v2 growth/CRM, consent-gated. Avoid capturing PII without masking and consent. |

## Reference, Not Core Replacement

| Project | Why not core |
|---|---|
| Medusa | Strong commerce modules, but adopting it as core would duplicate AliStore's Event Ledger, IMEI, cash/COD, and approval invariants. Use as reference for storefront/admin patterns. |
| Vendure | Technically close to NestJS and commerce-heavy, but replacing the backend would move the project to GraphQL/plugin semantics and away from the current audited REST core. Use as reference, not as the AliStore source of truth. |

## First Integration Completed

`@nestjs/swagger@7.4.2` was selected because the project uses NestJS 10 and this
major line explicitly supports Nest 9/10 peer dependencies. The latest
`@nestjs/swagger` line targets Nest 11, so it was intentionally not used.

Validation:

- `npm run api:build`
- `npm run api:test`
- Runtime check: `GET /api/docs` returned `200`; `GET /api/docs-json` exposed the
  current `/api/orders` and `/api/payments` paths.
