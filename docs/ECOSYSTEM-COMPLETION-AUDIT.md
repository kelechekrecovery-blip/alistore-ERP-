# AliStore ecosystem completion audit

Evidence snapshot: 2026-07-14, branch `codex/open-source-integrations`, baseline
`68568ad`. This is a completion audit, not a marketing status page. `Implemented`
requires executable behavior and a relevant gate. `Partial` means a useful vertical
exists but the handoff or role workflow is not complete. `External` requires owner
credentials, legal approval or physical hardware.

## Verified baseline

- 47 NestJS modules, 37 generated Next routes and 38 Prisma migrations.
- `mvp:verify`: API/Web production builds, mobile reference typecheck, 112/112 Jest
  suites with 440/440 tests and 25/25 Playwright flows.
- Four SwiftUI app targets build; shared AliStoreCore XCTest has 29 contracts.
- Four Kotlin/Compose APKs build; JVM tests and Lint run through `android:test`.
- `npm run ecosystem:verify:ui` passed end to end on 2026-07-14, including 24/24
  connected Compose tests on the API 36 emulator. Physical-device certification
  remains outside this software gate.

## Handoff acceptance matrix

| Handoff source | Status | Current evidence | Missing acceptance evidence / work |
|---|---|---|---|
| API Data Contracts | Partial | typed Nest DTO/controllers, Swagger, API integration suites | versioned `/v1` contract, generated client compatibility and every handoff endpoint mapped |
| ERP 2.0 | Partial | `/erp`, reports, risk, finance, approvals, procurement links | exact acceptance for every ERP tab; HR, logistics, CMS, service, legal and operations surfaces |
| HR | Partial | StaffUser, shifts, tasks, KPI/payroll services | schedules, leave/absence, payroll workflow UI, dedicated handoff Playwright |
| Order State Machine | Implemented for MVP | server transition table, invariant/concurrency suites | full provider/courier failure matrix and ecosystem-level replay scenario |
| POS 2.0 | Partial | web POS plus native SwiftUI/Compose sale, shift, approval, receipt, return/exchange | XCUITest/Compose app-level E2E, physical scanner/printer/terminal certification |
| Process Map 2.0 | Partial | domain services cover core purchase/operations spine | automated trace proving every documented cross-module process and compensation |
| QA Test Scenarios | Partial | 440 API tests and 25 Playwright flows | native role E2E, accessibility/visual suite, outage/load/restore/security acceptance |
| Analytics | Partial | reports, margin/KPI, revenue and AI insights | cohorts, retention, funnels, stock aging, delivery/supplier dashboards and exports |
| Security | Partial | JWT ownership, staff RBAC, TOTP, capability scopes, rate limits, signed webhooks | external pentest, quarterly access workflow, PII encryption/retention certification |
| Procurement | MVP implemented | PO create/send/cancel, partial receive, concurrency, ERP E2E | completeness, missort claim workflow, supplier calendar and quantity receiving |
| Client App 2.0 | Partial | SwiftUI/Compose shells and major customer API flows | screen-by-screen pixel matrix, XCUITest, app-level Compose E2E, biometric login, physical push/device gate |
| Client services | Partial | support, returns, warranty, protection, trade-in APIs/web/native portions | unified native service journey, repair/loaner status, visual and offline acceptance |
| Logistics management | Partial | courier assignment, route states, Evidence and COD handover | zones, slots/capacity, dispatch board, route optimization and live tracking |
| Marketing CMS | Partial | campaigns, consent and channel transports | banner/collection/navigation draft-review-schedule-publish workflow and storefront consequence E2E |
| Project overview | Reference | architecture/readiness/progress documents | keep generated facts synchronized with actual gates |
| Store operations | Missing | cash shift and Evidence primitives only | opening/closing checklists, incidents, safety/security exceptions and escalation UI/API |
| Service center | Partial | warranty/support state machines and Evidence | diagnostics, paid repair, parts/work orders, technician SLA and loaner fund |
| Warehouse accounting | Partial | serialized IMEI receive/transfer/count, procurement, bundles | quantity stock, consignment ownership/payout, completeness, missort and markdown workflows |
| Staff App 2.0 | Partial | order/tasks/customer/support/warranty/scanner/Evidence flows on both platforms | complete visual acceptance, app-level native E2E, physical push/scanner/camera gate |
| Product management | Partial | product CRUD, variants, virtual bundles, catalog/search | preorders, channel publishing, pricing history, completeness policy and quantity tracking mode |
| Finance 2.0 | Partial | expenses, approval/payment, budgets and plan/fact | provider/POS/COD reconciliation, cashflow, collection, settlements, currency and exports |
| Ecosystem | Partial | common Nest API/Postgres/Ledger and several cross-surface flows | all rows in this matrix accepted together; production/stores not certified |
| Legal | Partial | documents, consent timestamps and customer data controls | immutable policy/template versions, retention jobs, contracts and Kyrgyz legal approval |

## Role acceptance gates

| Role | Required black-box journey | Current status |
|---|---|---|
| Anonymous customer | browse/search/product/cart/demo checkout without foreign data access | Web covered; native not applicable |
| Authenticated customer | OTP, checkout/payment return, order tracking, return, warranty, support and logout | API/web substantial; native app-level E2E missing |
| Seller/cashier | login, shift, scan, split sale, approval, receipt, refund/exchange, offline restart | software vertical exists; native E2E and hardware external |
| Warehouse | PO receive, serialized/quantity stock, count, transfer, picking, discrepancy | serialized core covered; quantity/consignment and full role E2E missing |
| Courier | assignment, map/call, failure/retry, Evidence, COD handover, offline restart | API/native software covered; live device/push gate external |
| Support/service | ticket escalation, warranty diagnosis/repair/loaner/close | support/warranty partial; service-center workflow missing |
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

## Ordered remaining work

1. Complete warehouse quantity/consignment and serialized return/restock invariants.
2. Complete HR schedules and logistics zones/slots/dispatch for first-store operations.
3. Add service center, store operations, CMS, analytics and legal Waves B.
4. Add franchise, advertising, referrals/Q&A, WhatsApp and production AI Waves C.
5. Add iOS XCUITest and app-level Android connected journeys for all four apps.
6. Add one cross-surface ecosystem E2E with database/Ledger reconciliation assertions.
7. Add handoff visual baselines and accessibility/overflow checks for every screen/state.
8. Finish BullMQ, search indexing, private Evidence signed reads, staging soak and DR drills.
9. Certify live payment/SMS/fiscal/push/channels and physical devices; release and pilot.

No full-production or full-ecosystem claim is valid until every matrix row is either
`Implemented` with evidence or an explicitly owner-controlled `External` gate that has
been completed.
