# AliStore Full-System Audit and Release Design

**Date:** 2026-08-05  
**Status:** Design approved by project owner; implementation not started from this spec  
**Scope:** End-to-end audit and hardening of the AliStore retail platform

## Goal

Prove and improve every customer, staff, financial, AI/IoT, native-app, and
release workflow that can be verified from the repository or connected runtime,
while keeping external-provider and physical-certification work explicitly
blocked rather than simulating it.

## Success contract

For every in-scope capability, the audit must produce all four items:

1. An implementation or defect finding tied to exact files and interfaces.
2. An automated test, or a documented reason why only a live/manual check can
   prove it.
3. Executed evidence from the appropriate scope: unit/integration, E2E,
   browser/native, live deployment, or provider certification.
4. A rollback/owner record. External credentials, contracts, device access and
   legal/fiscal certification are `BLOCKED_OWNER`; code defects are
   `BLOCKED_ENGINEERING` until fixed and re-tested.

Completion does not mean that a provider is “configured” merely because an env
variable exists. Payment, SMS, OFD, push, media, telemetry and messaging remain
fail-closed until live behavior and reconciliation are evidenced.

## Architecture and operating rules

- PostgreSQL and the Event Ledger remain the source of truth for identity,
  authorization, payments, inventory, accounting, delivery and approvals.
- AI is read-only or draft-producing by default. Money, stock, RBAC, settings,
  credentials and release mutations require an explicit human approval path.
- Guest capabilities are scoped, signed, short-lived and entity-bound; they are
  never accepted as bearer access tokens.
- All externally retried commands use idempotency keys and durable outbox state.
- Camera/edge events require device authentication, bounded retention and no
  raw biometric inference by default.
- Production secrets remain outside Git and are entered through the owner’s
  provider dashboards or one-time secret handoff.
- Every implementation wave is isolated in a commit and passes a review gate
  before the next wave changes shared behavior.

## Wave 1 — Storefront, identity and release-critical UX (P0)

### Scope

- Home, catalog, search, product detail, cart and checkout.
- Guest order flow, phone registration/login, OTP delivery and recovery.
- Apple/Telegram social enrollment boundaries.
- Auth refresh/logout/storage isolation and customer data access.
- App Store metadata, signing, reviewer credentials/read-only flows.
- Next.js cache/build-id behavior and live browser navigation.

### Required evidence

- Chromium browser journey from catalog through cart and checkout entry.
- Validation and failure journeys for empty/invalid phone and expired OTP.
- API tests for capability scope, owner binding, token-type boundary and
  idempotency.
- iOS store preflight and reviewer-readiness for all four apps.
- Deployment smoke proving `/healthz`, API live/ready, non-empty catalog and
  `no-store` policy for interactive HTML.

### Acceptance

No user-facing route silently stalls, stale HTML references removed chunks, or
exposes another customer’s order/account. A provider-dependent step returns a
clear fail-closed state when credentials are absent.

## Wave 2 — Money, inventory and operational truth (P0/P1)

### Scope

- Payment intent creation, raw-webhook verification, replay/idempotency and
  refund reconciliation.
- Cash/POS order modes, fiscal/OFD integration boundaries and receipt state.
- Inventory reservation/allocation/release, serialized IMEI flows and stock
  reconciliation.
- Procurement/supplier offers, purchase orders, courier handover and no-show.
- Accounting journal balance, receivables, settlements, approvals and
  four-eyes separation.

### Required evidence

- Isolated migration rehearsal on disposable PostgreSQL.
- API integration suites for create/retry/replay/refund/cancellation paths.
- Cross-module E2E proving order → reservation → fulfillment → payment/receipt
  → ledger events.
- Explicit negative tests for unsigned webhooks, duplicate commands and
  unauthorized staff roles.

### Acceptance

No successful user-visible state exists without a matching durable event or
  reconciliation record. Duplicate provider or client delivery is applied once;
  failed external integrations leave an actionable durable state.

## Wave 3 — AI, messaging and camera/IoT control plane (P1)

### Scope

- AI run ledger, model/provider routing, budget limits and evidence references.
- Support triage drafts, approvals and replay/audit views.
- Telegram/WhatsApp webhook verification and scoped support workflows.
- EZVIZ/edge sender contract, signed event gateway, retention and privacy.
- SMTP/SMS/push/Telegram/WhatsApp outbox transports and critical alerting.

### Required evidence

- Unit/API tests showing AI cannot directly mutate money, stock, RBAC or release
  state.
- Signature, timestamp, unknown-device, tamper and retention tests for camera
  events.
- Outbox retry, timeout, fencing and alert-delivery tests.
- Live provider checks only when owner credentials and certification are
  present; otherwise a named `BLOCKED_OWNER` artifact.

### Acceptance

Every AI mutation is either rejected or represented as a human-approved,
attributable command. Camera and messaging failures are bounded, observable and
do not leak raw customer or biometric data.

## Wave 4 — Native applications (P1)

### Scope

- iOS Client, Staff, Courier and POS.
- Android Client, Staff, Courier and POS.
- Auth/session/secure storage, push registration, deep links, offline replay,
  scanner, POS printer/terminal boundaries and backup policy.

### Required evidence

- Android build, unit tests and lint for all four targets.
- iOS build, unit/UI tests, lint and store preflight for all four targets.
- Physical-device checks for FCM/APNs, scanner, printer and terminal where
  required; simulator evidence is not substituted for hardware certification.
- Data-safety/backup inspection proving session data is excluded from backups.

### Acceptance

Unauthenticated and revoked sessions cannot access protected screens; offline
replay is idempotent; deep links open the scoped destination; sensitive session
data is not transferred through cloud/device backup.

## Wave 5 — Production, security and release operations (P0/P1)

### Scope

- Dependency and secret scanning, SBOM/lock-file hygiene and trusted toolchain.
- Docker/Compose healthchecks, Redis/Metabase/Meilisearch/MinIO readiness.
- Render migration rehearsal, deploy hooks, health checks, rollback and
  Cloudflare cache policy/purge.
- S3/R2 media privacy, Sentry/alerting, backups and restore drills.
- Final App Store submission and production launch gates.

### Required evidence

- `osv-scanner`, Gitleaks, API/Web/Native build and test gates.
- Production deployment smoke from a public network.
- Render workflow run with migration rehearsal, deploy and health-check jobs
  all successful.
- Strict readiness output with no unresolved external checks, or explicit
  owner-blocker report with exact env names and manual acceptance steps.

### Acceptance

The release is reproducible, observable and rollbackable. A green health check
cannot mask an empty catalog, stale HTML, unavailable database or disabled
critical alert channel.

## Execution and review protocol

1. Dispatch independent read-only reviewers for each wave before changing code.
2. Convert verified findings into small implementation tasks with tests first.
3. Use one owner per file/domain to avoid concurrent edits to shared modules.
4. Run a code/security review after each implementation task.
5. Commit each coherent fix; never stage unrelated owner work.
6. Re-run the wave gate and update an evidence report before advancing.
7. Stop and label a blocker when the next acceptance criterion requires an
   external credential, physical device, contract or provider dashboard.

## Rollback and kill criteria

- Roll back a web/native release if browser navigation references missing chunks,
  auth state crosses accounts, or a payment/inventory invariant fails.
- Disable an AI/messaging/camera transport if signatures, scope checks,
  retention, timeout or audit attribution regress.
- Do not reverse a data-bearing migration; ship a forward migration and use the
  documented backup/restore procedure.
- Do not enable production provider flags until the corresponding live
  acceptance evidence is attached.

## External owner inputs

The implementation can proceed without these values, but the final release
cannot be marked complete until they are supplied and verified:

- Render deploy hooks: `RENDER_DEPLOY_HOOK_API_PROD`,
  `RENDER_DEPLOY_HOOK_WEB_PROD`, `RENDER_DEPLOY_HOOK_WORKER_PROD`.
- Cloudflare/Render cache purge authority for `ali.kg`.
- Payment merchant credentials and signed webhook contract.
- Certified SMS/OFD credentials, sender ID and live phone/tax-cabinet checks.
- Telegram/WhatsApp bot credentials and webhook configuration.
- FCM/APNs credentials plus physical-device delivery evidence.
- Production S3/R2 and Sentry credentials.
- POS printer, terminal and scanner access for certification.

