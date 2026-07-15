# AliStore ecosystem completion audit

Evidence snapshot: 2026-07-15, branch `codex/open-source-integrations`, including
the verified first-store fulfillment and Finance settlement iterations. This is a completion audit, not a marketing status page. `Implemented`
requires executable behavior and a relevant gate. `Partial` means a useful vertical
exists but the handoff or role workflow is not complete. `External` requires owner
credentials, legal approval or physical hardware.

## Verified baseline

- 50 NestJS modules including the application root, 37 generated Next routes and 60 Prisma migrations.
- API/Web production builds, 123/123 Jest suites with 487/487 tests and 37/37 Playwright flows.
- Four SwiftUI app targets build; shared AliStoreCore XCTest has 31 contracts, including owned HR schedule/attendance and durable command retention.
- Four Kotlin/Compose APKs build; JVM tests and Lint run through `android:test`.
- `npm run android:ui` passed on 2026-07-14 with 25/25 connected Compose tests,
  including owned attendance open/reload. The full `ecosystem:verify:ui` baseline previously passed with 24/24 and is superseded by the current component gates plus the current `ecosystem:verify` run.
  Physical-device certification remains outside this software gate.

## Handoff acceptance matrix

| Handoff source | Status | Current evidence | Missing acceptance evidence / work |
|---|---|---|---|
| API Data Contracts | Partial | typed Nest DTO/controllers, Swagger, API integration suites | versioned `/v1` contract, generated client compatibility and every handoff endpoint mapped |
| ERP 2.0 | Partial | `/erp`, reports, risk, finance, approvals, procurement, HR and logistics links | exact acceptance for every ERP tab; CMS, service, legal and operations surfaces |
| HR | Partial | StaffUser, replay-safe editable/cancellable schedules, staff-owned attendance on ERP/SwiftUI/Compose, durable native replay, absence approval, derived timesheet, atomic cash-shift handover, immutable period payroll posting/payout, tasks and API/browser/native acceptance | first-store UAT and physical Staff push/device certification |
| Order State Machine | Implemented for MVP | server transition table, invariant/concurrency suites | full provider/courier failure matrix and ecosystem-level replay scenario |
| POS 2.0 | Partial | web POS plus native SwiftUI/Compose sale, shift, approval, receipt, return/exchange | XCUITest/Compose app-level E2E, physical scanner/printer/terminal certification |
| Process Map 2.0 | Partial | domain services cover core purchase/operations spine | automated trace proving every documented cross-module process and compensation |
| QA Test Scenarios | Partial | 477 API tests, 34 Playwright flows, 31 XCTest contracts and 25 connected Compose tests | app-level native role E2E, accessibility/visual suite, outage/load/restore/security acceptance |
| Analytics | Partial | reports, margin/KPI, revenue and AI insights | cohorts, retention, funnels, stock aging, delivery/supplier dashboards and exports |
| Security | Partial | JWT ownership, staff RBAC, TOTP, capability scopes, rate limits, signed webhooks | external pentest, quarterly access workflow, PII encryption/retention certification |
| Procurement | MVP implemented | PO create/send/cancel, partial receive, concurrency, ERP E2E | completeness, missort claim workflow, supplier calendar and quantity receiving |
| Client App 2.0 | Partial | SwiftUI/Compose shells and major customer API flows | screen-by-screen pixel matrix, XCUITest, app-level Compose E2E, biometric login, physical push/device gate |
| Client services | Partial | support, returns, warranty, protection, trade-in APIs/web/native portions | unified native service journey, repair/loaner status, visual and offline acceptance |
| Logistics management | Partial | authoritative store/pickup points, point-local inventory reservation, exact guest address, ERP zones/slots/capacity, row-locked checkout reservation, cancellation release, dispatch board, courier assignment, route states, Evidence and COD handover | route optimization, rescheduling and live tracking |
| Marketing CMS | Partial | ordered product collections, immediate/scheduled publication, cancellation, RBAC/Ledger and storefront consequence E2E; campaigns, consent and channel transports | banner/block ordering, review approval and promo/review moderation |
| Project overview | Reference | architecture/readiness/progress documents | keep generated facts synchronized with actual gates |
| Store operations | Missing | cash shift and Evidence primitives only | opening/closing checklists, incidents, safety/security exceptions and escalation UI/API |
| Service center | Partial | warranty/paid intake, dedicated service/technician roles, diagnostics/customer approval, point-scoped POS settlement, store-owned parts, assigned repair lifecycle, automatic SLA breach Ledger, closure, 30-day repair warranty and DeviceUnit-backed loaner issue/return/Evidence/overdue custody | exact detail pixel acceptance remains blocked by absent linked handoffs; physical first-store service UAT remains |
| Warehouse accounting | Partial | serialized IMEI plus quantity receive/count/transfer/approved adjustment, atomic quantity reservation/sale/release, line-level refund-bound quantity/direct/bundle IMEI restock, serialized and quantity consignment ownership/accrual/payout/partial-return compensation, procurement and bundles | completeness, missort and markdown workflows |
| Staff App 2.0 | Partial | order/tasks/customer/support/warranty/scanner/Evidence plus owned schedule/attendance/offline replay on both platforms | complete visual acceptance, iOS app-level XCUITest and physical push/scanner/camera gate |
| Product management | Partial | product CRUD, variants, virtual bundles, explicit serialized/quantity tracking, catalog/search | preorders, channel publishing, pricing history and completeness policy |
| Finance 2.0 | Partial | expenses, approval/payment, budgets/plan-fact and durable one-source provider/POS/COD/refund settlement with dispute resolution, replay, atomic close and Ledger | live statement import/provider certification, cashflow, collection, currency and exports |
| Ecosystem | Partial | common Nest API/Postgres/Ledger and several cross-surface flows | all rows in this matrix accepted together; production/stores not certified |
| Legal | Partial | documents, consent timestamps and customer data controls | immutable policy/template versions, retention jobs, contracts and Kyrgyz legal approval |

## Role acceptance gates

| Role | Required black-box journey | Current status |
|---|---|---|
| Anonymous customer | browse/search/product/cart/demo checkout without foreign data access | Web purchase path covered, including authoritative point/address and scoped status/paid-receipt recovery; commercial-content truth and broader ecosystem acceptance remain open |
| Authenticated customer | OTP, checkout/payment return, order tracking, return, warranty, support and logout | API/web substantial; native app-level E2E missing |
| Seller/cashier | login, shift, scan, split sale, approval, receipt, refund/exchange, offline restart | software vertical exists; native E2E and hardware external |
| Warehouse | PO receive, serialized/quantity stock, consignment, count, transfer, picking, discrepancy | quantity receive/transfer/adjust-to-sale, serialized/quantity consignment receive-to-payout and refund-bound restock/owner-compensation browser/API flows covered; full role E2E remains |
| Courier | assignment, map/call, failure/retry, Evidence, COD handover, offline restart | API/native software covered; live device/push gate external |
| Support/service | ticket escalation, warranty diagnosis/repair/loaner/close | ticket escalation, warranty/paid intake, diagnosis, customer estimate approval, POS settlement, repair execution and loaner custody are covered at web/API software level; unified native and physical UAT remain |
| Manager/owner | budgets, approvals, reconciliation, risk, analytics and audit export | partial ERP coverage; reconciliation/expanded modules missing |
| Security auditor | revoked role, IDOR, dangerous action, 2FA, immutable Ledger and access audit | automated core coverage; external pentest/retention audit missing |

## Test-system gaps

1. `mvp:verify` proves web/API behavior but does not build or test final native apps.
2. iOS has no XCUITest application targets; current `ios:test` exercises shared contracts.
3. Android Compose instrumentation exists under `core`, but `android:test` runs JVM/Lint only.
4. There is no single E2E that drives customer → payment → warehouse → courier/POS →
   refund and then reconciles Payment, stock and Event Ledger.
5. Visual regression is assertion/screenshot based but lacks stored approved baselines for
   all 23 handoffs at desktop, phone, iOS and Android dimensions.
6. Redis, Meilisearch and R2 outage tests do not yet prove every critical purchase path.
7. Load/soak, backup/restore, rollback, external pentest and physical hardware/device gates
   remain outside local software certification.
8. The 23 tracked handoffs link to 74 design files, but 64 linked `.dc.html` files are
   absent. See `ECOSYSTEM-TRACEABILITY-MATRIX.md`; absent references cannot be accepted visually.

These gaps are now machine-reported by `npm run ecosystem:audit`. The strict form is a
completion gate, not a routine component gate. It derives the design corpus from Git and
validates `docs/acceptance/ecosystem-evidence.json`; an accepted gate needs a real command
plus committed artifacts whose SHA-256 values match the command and tested source-tree
hash recorded by a successful result. It currently fails on the missing
design corpus, visual goldens, iOS XCUITest, packaged Android UI and reconciled ecosystem E2E.

## Ordered remaining work

1. Run first-store payroll/logistics/shift UAT and physical Staff device certification; native attendance software is complete, while route optimization/live tracking remain later scope.
2. Complete the remaining service-center lifecycle, then add store operations, CMS, analytics and legal Waves B.
3. Add franchise, advertising, referrals/Q&A, WhatsApp and production AI Waves C.
4. Add iOS XCUITest and app-level Android connected journeys for all four apps.
5. Add one cross-surface ecosystem E2E with database/Ledger reconciliation assertions.
6. Add handoff visual baselines and accessibility/overflow checks for every screen/state.
7. Finish BullMQ, search indexing, private Evidence signed reads, staging soak and DR drills.
8. Certify live payment/SMS/fiscal/push/channels and physical devices; release and pilot.

No full-production or full-ecosystem claim is valid until every matrix row is either
`Implemented` with evidence or an explicitly owner-controlled `External` gate that has
been completed.
