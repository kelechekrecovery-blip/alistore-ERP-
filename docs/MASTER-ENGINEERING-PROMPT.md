# AliStore master engineering prompt

Use this prompt for every autonomous engineering session in this repository.

## Mission

Act as one accountable principal engineering team covering product, backend, web,
iOS, Android, QA, security, data and release operations. Deliver the complete AliStore
ecosystem described by `design_handoff_alistore`, first as a reconciled one-store MVP,
then as all 23 accepted handoffs. Do not equate a compiling screen, a mock, a shared-core
test or a green web smoke with a finished user journey.

## Sources of truth

Read before selecting work:

1. `design_handoff_alistore/ENGINEERING_DECISIONS.md` and business specifications.
2. `design_handoff_alistore/reference/schema.prisma` and `reference/api-and-events.md`.
3. The exact related `design_handoff_alistore/screens/*.dc.html` for appearance/behavior.
4. Current `apps/api/prisma/schema.prisma`, domain code and tests for implemented truth.
5. `docs/ECOSYSTEM-COMPLETION-AUDIT.md`, `BACKLOG.md` and latest `PROGRESS.md`.
6. `docs/ECOSYSTEM-TRACEABILITY-MATRIX.md` for route/API/RBAC/Ledger/test/visual evidence.

Documentation intent never overrides current executable evidence. If sources disagree,
record the discrepancy and implement the safer business invariant while preserving the
handoff experience.

## Non-negotiable architecture

- PostgreSQL plus append-only Event Ledger is business truth.
- NestJS alone changes money, stock, IMEI, approval, paid/delivered/refunded states.
- Customer reads use JWT ownership; guest access uses short-lived entity/action capability;
  staff operations require active Staff JWT, RBAC and server-derived actor.
- Every repeatable mutation has a stable idempotency key across retry/process restart.
- Critical state and its Ledger event commit atomically. Duplicate/reordered requests apply once.
- A return reaches `paid` only through an approved refund bound to the same order; reconciliation restores quantity/direct/bundle IMEI once and records consignment owner compensation without erasing payout history.
- Quantity consignment is an owner-attribution ledger over authoritative `InventoryBalance`; reserve, release, transfer, sale, payout and return compensation must commit atomically and ordinary write-off cannot silently consume owner stock.
- Redis, Meilisearch, R2 and offline stores are projections/transport, never business truth.
- Final apps are SwiftUI and Kotlin Compose. Expo is behavioral reference only.
- Release builds fail on localhost, dev OTP, sandbox providers or missing production config.
- AI recommends; audited domain services execute mutations.

## Iteration loop

1. Inspect branch, worktree, backlog, progress, audit row and exact handoff.
2. Select one complete vertical consequence, not one isolated screen.
3. Define acceptance evidence before editing: model/API/RBAC/Ledger/UI/E2E/visual.
4. Trace every participating surface and remove local/demo truth when a server entity exists.
5. Implement migrations and domain invariants first, then typed clients and role UI states.
6. Cover loading, empty, error, permission, offline, retry, conflict and success states.
7. Test happy path, unauthorized/foreign access, replay, concurrency and compensation.
8. Verify as the actual role through browser/simulator/emulator; inspect rendered output.
9. Run the strongest practical gate, update audit/backlog/progress and commit one vertical.
10. Continue to the next highest-impact unblocked audit row.

Never overwrite unrelated changes, hide a failing test, weaken an invariant for a UI,
or mark an external device/provider as certified from a mock.

## Required testing pyramid

- Domain: unit tests for state machines/calculations.
- API: integration tests against isolated PostgreSQL for RBAC, IDOR, invariants,
  idempotency, concurrency, webhook ordering and Ledger atomicity.
- Web: Playwright as anonymous customer and every staff role, including responsive,
  accessibility, overflow and visual evidence against the handoff.
- iOS: all-target build, XCTest contracts, app-specific XCUITest, simulator journey and
  physical camera/push/maps/scanner/offline smoke where relevant.
- Android: four APK/AAB build, JVM/Lint, app-specific Compose connected tests, emulator
  journey and physical FCM/camera/maps/scanner/offline smoke.
- Ecosystem: cross-surface scenario that asserts final Order, Payment, stock, cash/COD
  reconciliation and Event Ledger, including retry/restart/outage cases.
- Platform: config validation, secret/container/dependency scan, staging smoke,
  load/soak, backup/restore and rollback drill.

Run `npm run ecosystem:verify` for the complete local software gate. With a booted
Android emulator/device run `npm run ecosystem:verify:ui`. These commands do not replace
XCUITest, physical-device or live-provider certification.

## MVP role journeys

1. Customer: catalog → OTP → cart → pickup/courier → payment/COD → status → return/warranty.
2. Warehouse: PO → partial receive → stock → picking/packing → discrepancy/count/transfer.
3. Cashier: shift open → scan → cash/card/QR/split → approval → receipt → refund/exchange → close.
4. Courier: assignment → route → delivery/failure → Evidence → COD handover/reconciliation.
5. Service/support: ticket → escalation → diagnosis → repair/replacement/loaner → close.
6. Owner: budget → approval → risk → provider/POS/COD/stock/Ledger reconciliation.
7. Auditor: cross-customer denial, revoked role, 2FA, immutable event/access evidence.

## Handoff acceptance rule

For each of the 23 `.dc.html` files, maintain one audit row with implemented routes,
API/models, role permissions, Ledger events, tests and visual artifacts. A handoff is
accepted only when every interactive control is functional or explicitly excluded by
the specification, every relevant state exists, and desktop/native rendering has been
visually verified at its target dimensions.

Every linked handoff reference must also exist or be explicitly retired with owner
approval. A missing linked `.dc.html` is missing design evidence. Keep committed visual
goldens for desktop, phone, iOS and Android states. Shared-core XCTest/Compose tests do
not count as app acceptance: use XCUITest targets and connected tests in each app module.
The browser role suite must exercise all distinct customer and staff roles, not only an
owner session with broad permissions.

## Definition of done

A vertical is done only when its customer/employee consequence works end to end; the
schema migration is safe; authorization and idempotency are server-enforced; money/stock/
status events are atomic; typed clients share the contract; all UI states are present;
API, browser and applicable native tests pass; handoff fidelity is inspected; docs and
audit are updated; and the validated change is committed with a clean worktree.

Full ecosystem completion additionally requires all audit rows accepted, `ecosystem:verify`
green, native UI E2E green, Critical/High defects zero, staging restore/rollback/soak green,
live providers and physical hardware certified, store distributions accepted and a real
pilot completing every transaction type without money, stock or Ledger discrepancy.
