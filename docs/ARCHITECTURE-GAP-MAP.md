# AliStore target architecture gap map

This document maps the architecture requested in the 2026-07-12 Codex handoff
against executable repository evidence. A checkmark means the implementation has
been built or tested; it does not mean external production certification is complete.

## Platform

| Target | Current implementation | Status | Acceptance gate |
|---|---|---|---|
| Next.js storefront + ERP/admin | 37 routes, production build and 23-flow Playwright coverage | Ready | `npm run build -w @alistore/web`, full Playwright |
| NestJS modular monolith | 47 domain modules behind one API | Ready | API build and 110 Jest suites |
| PostgreSQL + Prisma | 34 migrations, transactional domain services | Ready | isolated test DB reset + migration deploy |
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
| Client | Native target builds and runs; live catalog, cart/quantity, pickup/courier checkout, JWT-owned idempotent order/payment intents, persistent SwiftData order queue with foreground replay/conflict/manual retry, card/MBank/O!Деньги/installment handoff, payment-return reconciliation, OTP/Keychain refresh, protected orders, owned-device warranty, APNs permission/token/customer registry and typed API | Native Compose APK builds with prototype-aligned home/catalog/favorites/cart/account shell; typed OTP and encrypted refreshable session; stock-capped quantity cart; JWT-owned pickup/courier checkout with server-authoritative pricing; stable order/payment/warranty/support/return/address idempotency; SQLite queued/syncing/conflict/failed replay; card/MBank/O!Деньги/installment handoff; payment-return routing; protected order history; owned-device warranty; owner-scoped support/returns; server-backed loyalty, coupons, addresses, profile and notification consent/preferences | iOS live APNs delivery plus final visual/device smoke; Android final provider/device smoke |
| Staff | Native target builds; staff login; live order fulfillment queue; Customer 360 and guarded warranty SLA; camera EAN/QR/Code128 scanner with manual fallback; camera/photo Evidence Vault upload for all supported entity types; live reconciled shift lifecycle through staff JWT and RBAC | Native Compose APK with Keystore staff session restore, active-staff validation, RBAC order queues/fulfillment actions, idempotent cash-shift reconciliation, Customer 360 with masked PII/spend/debt, role-gated warranty/support actions, CameraX/ML Kit scanner, staff-JWT Evidence upload, PostgreSQL-backed assigned tasks and staff-bound FCM registration/deep-link routing | iOS shared task UI and APNs routing; Android physical FCM/scanner/camera certification |
| Courier | Native target builds; staff login and route/COD shell | Native Compose app with courier-only Keystore session, JWT-owned assigned routes, customer/address/slot/items, map and phone handoff, dedicated start/deliver/fail transitions, order-scoped Evidence upload, transactional FCM assignment routing, server-reconciled COD handover and isolated SQLite/WorkManager replay with stable idempotency keys | iOS full flow; Android live FCM plus physical maps/camera/network certification |
| POS | Native target builds; staff login and sale/offline shell | Separate Compose APK with cashier-only Keystore session, live catalog/cart, server-canonical price/SKU and exact IMEI checks, cash/card/MBank split tender, discount approval retry, isolated SQLite/WorkManager replay, explicit shift lifecycle, queued-approval recovery, server-rendered ESC/POS receipt, return/refund operations and atomic idempotent exchange | physical scanner, ESC/POS printer and bank-terminal certification |

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
- All four Debug APKs build; unit tests, Android Lint and the Client/Staff/Courier/POS Compose UI suite passes on Android API 36.
  Client OTP/login, process-restart session restore, cart/checkout, payment-return routing, server order status, owned-device warranty, support, returns, loyalty, address and settings UI are verified on Android API 36.
- Staff login/session ownership, order-queue transitions, retry-safe cash-shift reconciliation, Customer 360, guarded warranty/support operations, camera scanner, staff-authorized Evidence upload, shared assigned-task transitions and FCM deep-link routing are verified on Android API 36. Live FCM delivery and physical-device camera/scanner certification remain explicitly open.
- Courier assignment ownership, route listing, start/deliver/fail, exact command replay, COD collection/handover, offline persistence, staff-authorized Evidence upload and scoped FCM deep-link routing are verified through API integration/RBAC tests plus Android JVM and API 36 Compose gates. Live FCM delivery and physical maps/camera/network certification remain open.
- POS login, catalog/cart, stock-capped quantity, keyboard/camera scanning, exact server-validated IMEI sale, cash/card/MBank split tender, explicit shift reconciliation, approval parking/retry, exact offline command retention, server-rendered receipt, return/refund operations and idempotent exchange are verified through API integration, Android JVM/Lint and API 36 Compose gates. Silent physical printing and scanner/payment-terminal certification remain open.
- Customer loyalty balance/coupons/history, address book and profile/preferences are shared by web and Android through owner-scoped NestJS endpoints. Loyalty redemption, earning and refund compensation use an order-linked atomic ledger under a per-customer PostgreSQL lock; a browser regression proves canonical promo pricing and a repeated authenticated checkout cannot double-spend points.

## Execution order

1. Native parity wave: Client final provider/device smoke; Staff iOS task/push parity and Android physical certification; Courier iOS parity plus Android live-push/device certification;
   POS physical printer/scanner/terminal certification. Each flow must run against the existing Nest contracts.
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
