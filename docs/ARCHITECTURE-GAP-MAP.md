# AliStore target architecture gap map

This document maps the architecture requested in the 2026-07-12 Codex handoff
against executable repository evidence. A checkmark means the implementation has
been built or tested; it does not mean external production certification is complete.

## Platform

| Target | Current implementation | Status | Acceptance gate |
|---|---|---|---|
| Next.js storefront + ERP/admin | 37 routes, production build and 22-flow Playwright coverage | Ready | `npm run build -w @alistore/web`, full Playwright |
| NestJS modular monolith | 47 domain modules behind one API | Ready | API build and 108 Jest suites |
| PostgreSQL + Prisma | 30 migrations, transactional domain services | Ready | isolated test DB reset + migration deploy |
| Append-only Event Ledger | `AuditService.transaction` commits mutations and events together | Ready | ledger/invariant/concurrency suites |
| Redis cache | Password-protected persistent Compose service and healthcheck exist; cache adapter is absent | Partial | cache port, fail-open reads, invalidation tests, live compose smoke |
| Meilisearch | Catalog adapter, Postgres fallback and pinned Compose runtime/healthcheck exist; automatic indexing is absent | Partial | live compose smoke, bootstrap settings, incremental reindex worker, fallback test |
| S3/MinIO | S3 adapter, compressed WebP ingestion and MinIO compose exist | Partial | live MinIO integration test, private evidence policy, signed URLs, backup |
| BullMQ workers | Transactional outbox has a BullMQ producer/scheduler and separate fail-fast worker; reservation/debt jobs remain on `pg-boss` during migration | Partial | migrate remaining jobs, DLQ dashboard, job metrics and staging soak |
| API gateway / edge | Render Blueprint plus Cloudflare host/CORS contract are implemented; live accounts and DNS are external | Partial | import staging Blueprint, TLS/WAF/Access, origin-blocking smoke |
| Managed deployment | Production/staging Render Blueprints, API/web/worker images, migration pre-deploy and private data-service wiring exist | Partial | live Render deploy, backup/restore, rollback and soak; Kubernetes is deferred until operational evidence requires it |
| GitHub Actions | API/web/test/Playwright, image builds, Trivy and secret scanning exist | Partial | add native builds and signed release workflows |

## Native applications

The Expo application under `apps/mobile` is now a legacy behavioral reference and
is not the final App Store/Google Play artifact.

| App | iOS SwiftUI | Android Kotlin | Remaining feature parity |
|---|---|---|---|
| Client | Native target builds and runs; live catalog, cart/quantity, pickup/courier checkout, JWT-owned idempotent order/payment intents, persistent SwiftData order queue with foreground replay/conflict/manual retry, card/MBank/O!Деньги/installment handoff, payment-return reconciliation, OTP/Keychain refresh, protected orders, owned-device warranty, APNs permission/token/customer registry and typed API | Native Compose APK builds with prototype-aligned home/catalog/favorites/cart/account shell; typed OTP and encrypted refreshable session; stock-capped quantity cart; JWT-owned pickup/courier checkout with server-authoritative pricing; stable order/payment/warranty/support/return/address idempotency; SQLite queued/syncing/conflict/failed replay; card/MBank/O!Деньги/installment handoff; payment-return routing; protected order history; owned-device warranty; owner-scoped support/returns; server-backed loyalty, coupons, addresses, profile and notification consent/preferences | iOS live APNs delivery plus final visual/device smoke; Android final provider/device smoke; server-authoritative loyalty redemption is a separate money-flow task |
| Staff | Native target builds; staff login; live order fulfillment queue; Customer 360 and guarded warranty SLA; camera EAN/QR/Code128 scanner with manual fallback; camera/photo Evidence Vault upload for all supported entity types; live reconciled shift lifecycle through staff JWT and RBAC | Separate Compose APK builds with role shell and shared secure/offline core | physical-device scanner/camera certification, full support actions, general tasks and push |
| Courier | Native target builds; staff login and route/COD shell | Separate Compose APK builds with role shell and shared secure/offline core | assigned runs, map/navigation, delivery transitions, evidence, COD handover |
| POS | Native target builds; staff login and sale/offline shell | Separate Compose APK builds with role shell and shared secure/offline core | catalog sync, scanner, ticket, split tender, approval, receipt/hardware, replay |

Shared iOS foundation:

- `AliStoreCore` typed REST client with server error propagation.
- Keychain token storage using device-only accessibility.
- SwiftData `PendingMutation` model with a mandatory idempotency key.
- Per-app bundle IDs and deep-link schemes.
- Debug API is local; Release resolves `ALISTORE_API_BASE_URL` and fails at startup
  if it was not injected as a valid URL.

Shared Android foundation:

- Four independently installable Kotlin/Jetpack Compose application modules and
  one shared Android library.
- Typed REST catalog/auth client with server-error propagation and strict API URL validation.
- Android Keystore AES-GCM access/refresh encryption, refresh-on-401 restore and server logout; ciphertext alone is stored in preferences.
- SQLite-backed persistent mutation queue with unique idempotency keys, explicit
  queued/syncing/conflict/failed states and a token-refreshing WorkManager replay worker.
- Custom deep-link schemes, emulator-local Debug API and cleartext disabled in Release.
- All four Debug APKs build; unit tests, Android Lint and 10 Client Compose UI tests pass.
  Client OTP/login, process-restart session restore, cart/checkout, payment-return routing, server order status, owned-device warranty, support, returns, loyalty, address and settings UI are verified on Android API 36.
- Customer loyalty balance/coupons/history, address book and profile/preferences are shared by web and Android through owner-scoped NestJS endpoints. A browser regression proves a server-created balance/coupon and a UI-created primary address are visible in the cabinet and checkout without relying on local storage.

## Execution order

1. Native parity wave: Client final provider/device smoke; Staff operations; Courier delivery/COD;
   POS sale/offline sync. Each flow must run against the existing Nest contracts.
2. Complete BullMQ migration: move reservation/debt schedulers after parity tests,
   add dead-letter visibility and job metrics. Keep PostgreSQL/Event Ledger as
   business truth; Redis is never authoritative.
3. Meilisearch runtime: service, index bootstrap and product mutation jobs with
   Postgres fallback.
4. S3 hardening: private evidence objects, signed reads, lifecycle and restore drill.
5. Kubernetes/CDN: API, web and worker workloads, migration job, secrets, probes,
   ingress, autoscaling and rollback validation.
6. Store release: signing, production URLs, privacy manifests/data safety, push,
   TestFlight/Play Internal and physical-device smoke.

## Non-negotiable validation

- Native clients never implement business authorization or approval thresholds locally.
- Every money, stock and status mutation remains idempotent and Ledger-backed on the API.
- Offline commands carry a stable idempotency key and expose conflict states to users.
- Redis, Meilisearch and S3 outages degrade explicitly without corrupting PostgreSQL truth.
- No release build may contain localhost API configuration.
