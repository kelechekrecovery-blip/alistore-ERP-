# AliStore master execution plan

Version: 2026-07-17  
Repository: `/Users/alistore/Desktop/alistore-erp`  
Branch: `codex/open-source-integrations`

This is the current execution plan, not a readiness claim. A phase is accepted
only when its gate has been executed against the current commit and its evidence
is recorded in `PROGRESS.md` and, where applicable, `docs/acceptance/`.

## Operating model

The project is a modular monolith around NestJS, PostgreSQL/Prisma and an append-only
Event Ledger. Next.js is the customer storefront and ERP shell. SwiftUI and Kotlin
Compose are the final native clients. PostgreSQL and the Ledger are business truth;
Redis, Meilisearch, R2/S3 and local queues are replaceable infrastructure.

Every vertical slice follows this loop:

1. Read the relevant handoff, API contract, schema and existing tests.
2. Define the acceptance gate before editing.
3. Implement the smallest complete cross-surface flow.
4. Cover loading, empty, error, permission, retry and offline states where relevant.
5. Verify ownership/RBAC, idempotency, money/stock invariants and Ledger events.
6. Run the strongest practical API/Web/native gate.
7. Update `BACKLOG.md` and `PROGRESS.md`.
8. Create one coherent commit and record its hash.

Shared API contracts, Prisma migrations, acceptance manifests and release documents
are coordinated by the main lane. Native and UI work may proceed independently only
when it uses an already frozen contract.

## Current baseline

Accepted locally:

- NestJS API regression and production builds;
- Next.js production build and Playwright storefront/ERP coverage;
- four iOS targets, XCTest and committed iOS UI evidence;
- four Android modules, APK builds, JVM/Lint and committed packaged UI evidence;
- POS/refund, Courier/COD, service/loaner and procurement/sale reconciliation profiles;
- ERP CMS publication, catalog, promotion and storefront checkout integration.

Not accepted globally:

- strict ecosystem audit, because 64 linked design references are absent;
- live payment, SMS, fiscal, push, storage and messaging provider certification;
- physical iOS/Android and POS hardware certification;
- App Store/Google Play submission and TestFlight/Internal Testing;
- staging/production backup, restore, rollback and first-store UAT.

## Phase 0: controlled baseline

Tasks:

- preserve user changes and keep the active branch clean between slices;
- run `mvp:verify`, native build/UI gates and `ecosystem:audit`;
- keep the design corpus fail-closed and never fabricate missing references;
- keep credentials out of Git and rotate any exposed credentials;
- synchronize backlog, progress, readiness and traceability documents.

Gate:

```bash
git diff --check
npm run mvp:verify
npm run ecosystem:audit
```

## Phase 1: ERP and storefront contract

Detailed execution checklist: `docs/PHASE-1-ERP-STOREFRONT-EXECUTION.md`.

Goal: prove that ERP changes are reflected in the customer site through one
server-authoritative catalog/CMS contract.

Tasks:

- product CRUD, variants, bundles, media, tax and tracking mode;
- price changes through approval rules, with no client-side price authority;
- CMS drafts, ordered blocks, product collections, scheduling and publication;
- active store points, stock availability, delivery slots and checkout revalidation;
- review moderation, promotion activation and server-side quote redemption;
- customer storefront routes: home, catalog, product, search, cart, checkout and account;
- desktop/mobile overflow, loading/empty/error/permission states and visual evidence;
- map every accepted route to API, Prisma model, RBAC, Ledger and browser evidence.

Gate:

```bash
npm run mvp:verify
npx playwright test e2e/admin-products.spec.ts e2e/storefront-cms-ui.spec.ts
npm run visual:e2e
```

## Phase 2: financial and inventory correctness

Tasks:

- complete Refund/RefundAllocation/RefundLine and provider execution;
- validate partial, full, mixed-tender, gift-card and replay-safe refunds;
- finish exchange aggregate, non-cash surcharge and immutable snapshots;
- complete inventory valuation, COGS, quarantine and valuation-aware adjustments;
- complete AP/AR, supplier bills, advances, landed cost and statement matching;
- validate tax classification, FX policy, period close and primary documents with a KR accountant;
- reconcile Payment, Refund, Journal, Inventory and Event Ledger for each flow.

Gate:

- API unit/integration/concurrency/RBAC suites;
- refund/exchange/procurement/POS browser journeys;
- exact debit/credit, stock and Ledger invariants;
- accountant-reviewed staging dataset.

## Phase 3: native Client parity

iOS and Android Client must implement the same server contracts and states:

- OTP/session restore/logout;
- home, catalog, search, filters, product, favorites and compare;
- cart, stock caps, checkout, payment return and orders;
- bonuses, addresses, devices, warranty, return, support, trade-in and settings;
- push/deep links, Face ID/biometrics, PIN fallback, secure storage and offline replay;
- queued/syncing/conflict/failed states with permanent idempotency keys.

Gate:

```bash
npm run ios:build
npm run ios:test
npm run ios:ui
npm run android:build
npm run android:test
npm run android:ui:all
```

Physical-device push, biometrics, camera and network tests remain mandatory before release.

## Phase 4: Staff, Courier and POS parity

Staff:

- shifts, tasks, orders, picking, packing, Customer 360, support, warranty, scanner and Evidence.

Courier:

- assignment, route, navigation handoff, status transitions, failed delivery, photo evidence,
  COD handover, retry and offline conflict recovery.

POS:

- shift open/close, catalog delta, scanner, customer/IMEI, discounts, approval/2FA,
  cash/card/QR/split tender, receipt, refund, exchange and offline replay.

Gate: four iOS and four Android role journeys, server RBAC, idempotency and physical
scanner/camera/maps/printer/terminal checks.

## Phase 5: ERP expansion

Wave A: Finance 2.0, variants/bundles, quantity/consignment warehouse, HR schedules,
payroll and logistics zones/slots/routes.

Wave B: service center, paid repair, loaner fund, store opening/closing, incidents,
security, CMS workflow, analytics and legal documents/consents.

Wave C: franchise audits, advertising ROI, referrals, loyalty, Q&A, WhatsApp storefront,
Telegram Mini App and AI recommendations.

Every module requires UI, API, Prisma migration, RBAC, Ledger, error/permission states,
Playwright/native evidence and a handoff acceptance status. AI may recommend; only domain
services may mutate money, stock or status.

## Phase 6: ecosystem E2E and strict audit

Required journeys:

- checkout → payment → stock → pickup/delivery;
- COD → handover → finance reconciliation;
- POS cash/card/QR/split and offline restart/replay;
- return/refund, exchange/new IMEI and warranty/repair/loaner;
- procurement → partial receiving → stock → sale;
- approval → 2FA → execution → Ledger;
- duplicate/reordered webhook, timeout, repeated tap, outage and process restart;
- IDOR, revoked staff, expired capability and cross-customer access.

Gate:

```bash
npm run ecosystem:e2e
npm run ecosystem:verify:ui
npm run ecosystem:audit:strict
```

The strict audit cannot turn green until every missing design reference is restored,
replaced or retired with an owner approval reference and timestamp.

## Phase 7: staging and production platform

- Render staging/production API, Web, worker, PostgreSQL, Redis and private search;
- Cloudflare DNS/TLS/WAF/Access with origin bypass blocked;
- private R2 media/evidence/backups and signed evidence URLs;
- BullMQ retries/DLQ, Sentry, uptime, queue/storage/search metrics;
- encrypted backups, PITR, restore drill, migrations job, probes and rollback;
- immutable image tags, non-root containers, dependency/container/secret scans.

Gate: staging soak, outage tests, backup/restore and rollback on release artifacts.

## Phase 8: providers, devices and stores

- certify payment/refund, SMS/OTP, fiscal operator, APNs, FCM, SMTP, Telegram and WhatsApp;
- configure production HTTPS API and remove dev OTP/demo/sandbox values;
- certify real devices and POS hardware;
- run TestFlight and Play Internal Testing;
- load real catalog, prices, stock, points, staff and roles;
- execute pickup, courier prepaid/COD, POS, refund, exchange, warranty, procurement and shift close;
- reconcile provider statements, cash, COD, inventory, AP/AR and Ledger.

Launch gate: closed pilot → 5–10% traffic → seven-day observation → 50% → full traffic.

## Active blockers and ownership

Engineering can continue local software work. The following require owner/external action:

- 64 missing `.dc.html` references: restore/replace/retire decision;
- Cloudflare/Render/R2/Sentry production accounts and secrets;
- payment, SMS, fiscal and channel contracts/credentials;
- Apple/Google accounts, signing, provisioning and store review;
- physical iPhone/Android/POS hardware;
- production catalog, prices, stock and staff roles;
- legal approval for offer, privacy, returns, warranty and trade-in documents.

Until these are supplied and verified, the correct status is “local software accepted;
production and full ecosystem not certified”.
