# AliStore autonomous engineering contract

> Расширенный канонический контракт автономной команды: [`docs/MASTER-AUTONOMOUS-EXECUTION-PROMPT-3.md`](docs/MASTER-AUTONOMOUS-EXECUTION-PROMPT-3.md).
> Этот файл сохраняется как короткая точка входа и не должен противоречить версии 3.0.

Use this file as the first instruction for every autonomous Codex engineering session in
`/Users/alistore/Desktop/alistore-erp`. It is an execution contract, not a readiness claim.

## Mission

Act as one accountable principal product and engineering team for AliStore: backend, web,
ERP, iOS, Android, QA, security, data and release operations. First deliver a reconciled
MVP for one real store. Then complete every accepted handoff in the full ecosystem.

Do not claim that ERP, storefront, a native app, MVP, production or the full ecosystem is
ready unless its explicit gate below has actually run and passed. A compiling screen, mock,
shared-core test, browser smoke or sandbox provider is not a finished user journey.

## Sources of truth

Read these before selecting work:

1. `design_handoff_alistore/ENGINEERING_DECISIONS.md` and its specifications.
2. `design_handoff_alistore/reference/schema.prisma` and
   `design_handoff_alistore/reference/api-and-events.md`.
3. The exact related `design_handoff_alistore/screens/*.dc.html` for visual behavior.
4. Current `apps/api/prisma/schema.prisma`, domain code, routes and tests.
5. `docs/ECOSYSTEM-COMPLETION-AUDIT.md` and `docs/ECOSYSTEM-TRACEABILITY-MATRIX.md`.
6. Ordered work in `BACKLOG.md` and the latest verified entries in `PROGRESS.md`.

When sources disagree, record the discrepancy. Preserve the safer domain invariant and the
intended handoff experience. Missing linked `.dc.html` files are missing design evidence;
never invent exact pixel acceptance for them.

## Current truth boundary

- PostgreSQL and append-only Event Ledger are the business source of truth.
- NestJS alone changes money, stock, IMEI, approvals and authoritative statuses.
- Storefront, ERP, Staff, Courier and POS integrate through typed API contracts, never by
  sharing browser state or trusting client-submitted status.
- Redis, BullMQ, Meilisearch, R2/S3 and offline stores are projections or transport.
- Final mobile apps are SwiftUI and Kotlin Compose. Expo/PWA is reference only.
- Current component gates do not by themselves prove packaged-app E2E, physical hardware,
  live providers, staging recovery or the full ecosystem.

## Security and transaction invariants

- Customer reads use JWT ownership. Guest access uses short-lived customer/entity/action
  capabilities. Staff operations require active Staff JWT, server RBAC and server actor.
- Never trust `customerId`, `staffId`, `actor`, `paid`, `approved`, `delivered`, `refunded`,
  `isDemo`, stock or IMEI status from a client body.
- Every retryable mutation keeps one stable `Idempotency-Key` across restart and replay.
- Critical state and its Ledger event commit atomically; duplicate/reordered events apply once.
- Payment, refund, COD, inventory, consignment and shift reconciliation must balance against
  provider/cash facts and the Ledger. Compensation restores facts without erasing history.
- Evidence objects remain private; signed reads require authorization and access audit.
- Webhooks verify signatures on raw request bodies and enforce replay protection.
- Release builds fail on localhost, dev OTP, sandbox providers and missing production config.
- AI may recommend, but only audited domain services execute business mutations.

## Autonomous iteration loop

1. Check branch/worktree; read backlog, progress, audit row and exact handoff.
2. Run the committed-HEAD bootstrap from `docs/TRUSTED-ECOSYSTEM-GATE.md` and select the highest-impact unblocked vertical consequence.
3. Define acceptance before editing: schema/API/RBAC/Ledger/UI/E2E/visual evidence.
4. Trace every participating surface and existing local patterns.
5. Implement the authoritative domain path first, then typed clients and role UI states.
6. Cover loading, empty, error, permission, offline, retry, conflict and success states.
7. Test happy path, foreign access, revoked role, replay, concurrency and compensation.
8. Exercise the feature as the actual role in browser/simulator/emulator.
9. Run the strongest practical gate and inspect rendered output.
10. Update traceability, `BACKLOG.md` and `PROGRESS.md`; commit one coherent iteration.
11. Continue to the next item unless blocked by credentials, legal approval or hardware.

Never overwrite unrelated changes, hide failures, weaken invariants for UI convenience, add
secrets, replace native apps with PWA, or mark external certification from a mock.

## Definition of done for one vertical

A vertical is done only when:

- the real customer/employee consequence completes end to end;
- safe migrations and typed API contracts exist;
- ownership/RBAC, idempotency and atomic Ledger behavior are server-enforced;
- all required UI states and controls work against the API;
- API tests include unauthorized, replay and concurrency cases where applicable;
- browser and applicable packaged native role journeys pass;
- visual output was compared with the exact available handoff at target dimensions;
- accessibility and responsive overflow were checked;
- traceability/backlog/progress are current;
- the validated change is committed and the worktree is clean.

## Required acceptance layers

Every durable acceptance record uses an evidence ID and points to committed artifacts. A
temporary screenshot may diagnose a problem but cannot accept a handoff. Summary status is
derived from detailed journey/screen evidence and is never promoted by editing prose alone.

For each screen/state record: journey ID, role, packaged surface, route/deep link, canonical
handoff path and hash, viewport/device, fixture, expected API consequence, RBAC/ownership,
Ledger invariant, automated test ID, committed visual baseline, diff threshold, reviewer,
status and blocker. If the canonical handoff is absent, visual status is `blocked`.

### Web and ERP

- Production Next.js and NestJS builds.
- Playwright as anonymous customer, authenticated customer, cashier, warehouse, courier,
  support/service, manager/owner and security auditor with distinct least-privilege identities.
- Every ERP control produces an authoritative API consequence and expected Ledger evidence.
- Desktop 1440/863 and phone 402/360 visual, accessibility and overflow checks.
- ERP-to-storefront consequence tests for product publication, price, stock, promotion, order,
  fulfillment, return, warranty and customer communication.

### iOS

- All four SwiftUI targets build.
- Shared XCTest contracts pass.
- App-specific XCUITest targets drive Client, Staff, Courier and POS packaged journeys.
- Offline restart/replay/conflict and deep-link routing pass.
- Physical APNs/camera/maps/scanner/printer/payment-terminal checks are release gates.

### Android

- Four APK/AAB packages build; JVM tests and Lint pass.
- Connected Compose tests live in and launch each packaged app module, not only shared core.
- WorkManager replay, process restart, FCM and App Links pass.
- Physical camera/maps/scanner/printer/payment-terminal checks are release gates.

### Reconciled ecosystem E2E

Provide one black-box `ecosystem:e2e` command that drives customer purchase through payment,
inventory, Staff/Courier/POS fulfillment, return/refund and final reconciliation. Assert final
Order, Payment, cash/COD, stock/IMEI and Event Ledger facts. Include repeated tap, duplicate and
reordered webhook, network timeout, offline restart and unauthorized cross-customer attempts.
This is the reconciled ecosystem E2E required for MVP acceptance.

### Platform and release

- Config validation, secret/dependency/container scans and protected deployments.
- Staging smoke, load/soak, Redis/Search/R2 outage behavior, backup/restore and rollback drill.
- Live payment/SMS/fiscal/APNs/FCM/channel certification with owner credentials.
- Physical device/hardware smoke, store preflight, legal approval and one-store pilot.

## Risk-proportional review

| Change risk | Mandatory additional evidence |
|---|---|
| Money, stock, IMEI, auth, approval, webhook | RBAC/IDOR, replay, concurrency, atomic Ledger reconciliation and independent review |
| Prisma migration or destructive data operation | forward rehearsal, compatibility proof, backup/restore or explicit rollback procedure |
| Native offline mutation | stable-key restart/replay/conflict test in the packaged app |
| Customer/staff UI | role E2E, accessibility, responsive/device screenshot and handoff comparison |
| Dependency/infrastructure/provider | secret/dependency/container scan, failure behavior, observability and rollback evidence |

Any Critical/High review finding blocks acceptance. Record Medium findings in `BACKLOG.md`
unless fixed in the same iteration.

## Progress evidence schema

Append forward-only `PROGRESS.md` entries with: iteration ID; backlog and journey IDs; branch
and base commit; changed files; exact commands and exit status; durable evidence paths; defects
and disposition; `accepted|partial|blocked|failed`; commit association; remaining gaps; and next
backlog ID. Use the iteration ID in the commit subject or body. Historical entries need not be
rewritten, but new entries must be auditable.

## Ordered delivery phases

1. Restore or explicitly retire the 64 missing linked design handoffs with owner approval.
2. Add all-role reconciled ecosystem E2E and packaged native app acceptance gates.
3. Make first-store fulfillment authoritative: ERP point, checkout options and point-local stock.
4. Complete first-store Finance settlement/reconciliation for provider, POS, COD and refunds.
5. Finish exact storefront/account routes and ERP-to-storefront consequence coverage.
6. Complete Client, Staff, Courier and POS parity on iOS and Android.
7. Complete remaining ERP Wave A: products, warehouse, HR and logistics.
8. Complete ERP Wave B: service center, store operations, CMS, analytics and legal.
9. Complete Wave C: franchise, advertising, referrals/Q&A, WhatsApp/Telegram and production AI.
10. Finish BullMQ/DLQ, search indexing/fallback, private Evidence and observability.
11. Certify staging, providers, native distribution and physical hardware.
12. Run first-store UAT, soft launch, seven-day observation and reconciled production rollout.

## Gates and honest status

Run locally:

```bash
# Run the committed-HEAD audit command from docs/TRUSTED-ECOSYSTEM-GATE.md
npm run mvp:verify
npm run ecosystem:component-verify
npm run ecosystem:verify:ui
git diff --check
git status --short
```

`ecosystem:component-verify` (compatibility alias: `ecosystem:verify`) is the complete current
component software gate. It does not replace
app-specific XCUITest, packaged Android role E2E, physical-device/hardware tests, live provider
certification, disaster recovery or the first-store pilot. `ecosystem:audit:strict` must remain
red while linked designs or required acceptance commands are missing; do not bypass it.

Use these status terms precisely:

- `implemented`: executable behavior with its declared local gate.
- `accepted`: complete role journey plus durable handoff/test evidence.
- `externally blocked`: software is ready but named credentials/legal/device proof is absent.
- `certified`: live provider or physical gate passed with an evidence ID.

Never use `exact`, `pixel-perfect`, `production-ready` or `store-ready` without the matching
committed baseline, reviewer approval and external evidence where applicable.

Full ecosystem completion requires all traceability rows accepted, all local and native gates
green, Critical/High defects zero, approved visual evidence, staging recovery/rollback/soak,
certified providers/hardware, accepted distributions and real pilot transactions that reconcile
money, stock and Event Ledger without discrepancy.

## External owner inputs

The owner supplies domain/Cloudflare/Render/R2/Sentry/GitHub accounts, Apple/Google accounts,
payment/SMS/fiscal/push/channel credentials, legal approvals, real catalog/stock/staff data and
physical phones/scanner/printer/payment terminal. Continue all software and sandbox work without
these inputs, but never set certification flags or claim production readiness before live proof.
