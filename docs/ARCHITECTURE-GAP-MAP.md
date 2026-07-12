# AliStore target architecture gap map

This document maps the architecture requested in the 2026-07-12 Codex handoff
against executable repository evidence. A checkmark means the implementation has
been built or tested; it does not mean external production certification is complete.

## Platform

| Target | Current implementation | Status | Acceptance gate |
|---|---|---|---|
| Next.js storefront + ERP/admin | 35 routes, production build and Playwright coverage | Ready | `npm run build -w @alistore/web`, full Playwright |
| NestJS modular monolith | 47 domain modules behind one API | Ready | API build and 104 Jest suites |
| PostgreSQL + Prisma | 24 migrations, transactional domain services | Ready | isolated test DB reset + migration deploy |
| Append-only Event Ledger | `AuditService.transaction` commits mutations and events together | Ready | ledger/invariant/concurrency suites |
| Redis cache | No Redis runtime or cache adapter | Missing | cache port, fail-open reads, invalidation tests, compose health |
| Meilisearch | Optional catalog adapter and Postgres fallback exist; runtime service and automatic indexing are absent | Partial | compose service, bootstrap settings, incremental reindex worker, fallback test |
| S3/MinIO | S3 adapter, compressed WebP ingestion and MinIO compose exist | Partial | live MinIO integration test, private evidence policy, signed URLs, backup |
| BullMQ workers | Background jobs currently use durable `pg-boss` on PostgreSQL | Missing versus target | Redis/BullMQ worker process, retries/DLQ, idempotent jobs, observability |
| API gateway / edge | Caddy edge exists; Nest is the only application API | Partial | production routing, TLS, limits and gateway health in staging |
| Kubernetes + CDN | No manifests or Helm/Kustomize deployment | Missing | staging namespace, migrations job, probes, autoscaling, rollback drill |
| GitHub Actions | API/web/test/Playwright CI exists | Partial | add native builds, worker/infra validation and signed release workflows |

## Native applications

The Expo application under `apps/mobile` is now a legacy behavioral reference and
is not the final App Store/Google Play artifact.

| App | iOS SwiftUI | Android Kotlin | Remaining feature parity |
|---|---|---|---|
| Client | Native target builds and runs; live catalog, typed API, Keychain and SwiftData queue foundation | Missing | OTP/account, cart/checkout/payment, orders, warranty, push, offline replay |
| Staff | Native target builds; staff login and role shell | Missing | task queues, Customer 360, scanner, warranty/support, shift evidence |
| Courier | Native target builds; staff login and route/COD shell | Missing | assigned runs, map/navigation, delivery transitions, evidence, COD handover |
| POS | Native target builds; staff login and sale/offline shell | Missing | catalog sync, scanner, ticket, split tender, approval, receipt/hardware, replay |

Shared iOS foundation:

- `AliStoreCore` typed REST client with server error propagation.
- Keychain token storage using device-only accessibility.
- SwiftData `PendingMutation` model with a mandatory idempotency key.
- Per-app bundle IDs and deep-link schemes.
- Debug API is local; Release resolves `ALISTORE_API_BASE_URL` and fails at startup
  if it was not injected as a valid URL.

## Execution order

1. Android native workspace: Kotlin, Jetpack Compose, Room, encrypted storage,
   WorkManager, four application modules and shared typed API core.
2. Native parity wave: Client checkout/account; Staff operations; Courier delivery/COD;
   POS sale/offline sync. Each flow must run against the existing Nest contracts.
3. Redis + BullMQ: introduce explicit cache/job ports, a separate worker process,
   idempotent job IDs, retries and dead-letter visibility. Keep PostgreSQL/Event Ledger
   as business truth; Redis is never authoritative.
4. Meilisearch runtime: service, index bootstrap and product mutation jobs with
   Postgres fallback.
5. S3 hardening: private evidence objects, signed reads, lifecycle and restore drill.
6. Kubernetes/CDN: API, web and worker workloads, migration job, secrets, probes,
   ingress, autoscaling and rollback validation.
7. Store release: signing, production URLs, privacy manifests/data safety, push,
   TestFlight/Play Internal and physical-device smoke.

## Non-negotiable validation

- Native clients never implement business authorization or approval thresholds locally.
- Every money, stock and status mutation remains idempotent and Ledger-backed on the API.
- Offline commands carry a stable idempotency key and expose conflict states to users.
- Redis, Meilisearch and S3 outages degrade explicitly without corrupting PostgreSQL truth.
- No release build may contain localhost API configuration.
