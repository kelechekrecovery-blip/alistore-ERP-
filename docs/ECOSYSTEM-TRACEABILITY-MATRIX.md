# AliStore ecosystem traceability matrix

Evidence snapshot: 2026-07-14. This is the execution index for the 23 committed
handoffs. A row is `Accepted` only when routes/apps, authoritative API and models,
RBAC/ownership, Event Ledger, role E2E and approved visual evidence are all present.

The committed design corpus is incomplete: the 23 tracked handoffs link to 74 distinct
`.dc.html` files, but 64 linked files are absent from `design_handoff_alistore/screens`.
Missing design files are missing acceptance evidence, even when related software exists.
The graph contains 104 link occurrences, 70 of them broken, and implies 87 distinct designs
when committed handoffs and referenced targets are combined. No missing original was found
elsewhere on this machine or in Git history during the independent audit.
Run `npm run ecosystem:audit` to recalculate these facts from the committed corpus and
`npm run ecosystem:audit:strict` as the fail-closed completion gate. The strict gate is
expected to remain red until missing handoffs and packaged native/ecosystem E2E commands exist.

| Handoff | Routes / apps | API, model and control evidence | Automated evidence | Status and remaining acceptance |
|---|---|---|---|---|
| API Data Contracts | all clients | typed Nest DTO/controllers, Prisma, Swagger, RBAC/Ledger suites | API integration suites | Partial: versioned contract and generated-client compatibility matrix missing |
| ERP 2.0 | `/erp` | reports, approvals, finance, products, warehouse, procurement, HR, logistics, service modules | module Playwright flows | Partial: every tab/state and visual baseline not accepted |
| HR | `/erp`, Staff iOS/Android | schedules, attendance, absence, handover, payroll; RBAC, commands, Ledger | API, browser, XCTest/Compose contracts | Partial: first-store UAT and physical push/device certification |
| Order State Machine | API, account, Staff/Courier/POS | server transition table and transactional events | invariant/concurrency suites | MVP accepted; provider/failure ecosystem replay remains |
| POS 2.0 | `/pos`, POS iOS/Android | shifts, sale, split tender, approvals, receipt, return/exchange, offline replay | API/browser/native contracts | Partial: app-level native E2E and certified hardware |
| Process Map 2.0 | cross-surface | domain services cover core purchase/operations spine | vertical suites | Partial: one reconciled cross-module process proof missing |
| QA Test Scenarios | all | deterministic test DB and verification scripts | Jest, Playwright, XCTest, Compose | Partial: all-role ecosystem E2E, outage/load/DR and visual goldens missing |
| Analytics | `/erp` | reports, margin, KPI, revenue and insights | API/browser subsets | Partial: cohorts, retention, funnel, aging, delivery/supplier exports |
| Security | API and protected web/apps | JWT ownership, RBAC, TOTP, capabilities, rate limits, signed webhooks | RBAC/IDOR/security suites | Partial: pentest, retention and access-review certification |
| Procurement | `/erp` | PO lifecycle, partial serialized receive, concurrency and Ledger | API + browser | MVP accepted; missort/completeness, supplier calendar, quantity receive remain |
| Client App 2.0 | Client iOS/Android | customer auth/catalog/cart/checkout/account service contracts | XCTest/Compose contracts | Partial: app-level XCUITest/Compose journeys, pixel matrix and physical push |
| Client services | account/support/trade-in/warranty, native clients | owner-scoped support, returns, warranty, devices, protection, trade-in | API/browser/native subsets | Partial: unified native journey, loaner/repair completion and visual/offline proof |
| Logistics management | `/erp`, checkout, Telegram, POS, Client/Courier apps | persisted active store points and inventory locations, exact delivery address, immutable order snapshot, point-local stock, zones, slots, capacity, dispatch, assignment, Evidence and COD | API/browser/native contracts including ERP activation → public checkout | First-store fulfillment accepted; optimization/reschedule/live tracking and physical device UAT follow |
| Marketing CMS | `/erp`, storefront, checkout | revisioned content; ordered hero/promo/info/collection blocks; device targeting; approved-only reviews; managed promotions; consent-filtered campaign recipients; server tracking codes; first/last UTM; payment-bound conversion and paid revenue/gross/ROAS | content/block/review/promotion/campaign API + RBAC/Ledger + campaign-to-desktop/mobile/checkout/payment/ERP Playwright | Accepted for committed Marketing CMS and paid gross attribution; production media/channel certification, refund-adjusted net ROAS and privacy-safe funnel metrics remain |
| Project overview | documentation | audit, backlog, progress and this matrix | fact checks in release loop | Reference: 64 linked design files must be restored or explicitly retired |
| Store operations | `/erp` primitives | cash shift and Evidence only | component suites | Missing: opening/closing checklists, incidents, safety and escalation |
| Service center | `/erp`, `/pos`, `/account/devices` | warranty/paid intake, service and technician roles, diagnosis/approval, POS settlement, store-owned parts reserve/release/consume, assigned execution, SLA escalation, closure, 30-day repair warranty and DeviceUnit-backed loaner custody with Evidence/overdue escalation | concurrency/RBAC/IDOR API tests + full ERP repair and ERP→customer loaner browser journeys | Partial only for exact linked case-detail pixel acceptance and physical first-store UAT; linked detail handoffs are absent |
| Warehouse accounting | `/warehouse`, `/erp` | serialized/quantity stock, counts, transfers, adjustments, consignment and return reconciliation | API/browser suites | Partial: completeness, missort and markdown workflows |
| Staff App 2.0 | `/staff`, Staff iOS/Android | orders, tasks, customer, support/warranty, scanner/Evidence and attendance | browser/native contracts | Partial: visual acceptance, iOS XCUITest and physical push/scanner/camera |
| Product management | `/admin/products`, `/erp`, storefront | CRUD, variants, bundles, stock modes, catalog/search | API/browser suites | Partial: preorder, publishing, pricing history and completeness policy |
| Finance 2.0 | `/erp` | expenses, approvals/payment, budgets/plan-fact and durable provider/POS/COD/refund settlement with disputed-variance resolution and Ledger close | exact/negative/disputed/replay/rollback API plus owner browser close | First-store software settlement accepted; live statement import/provider certification, cashflow, currency and export remain |
| Ecosystem | all surfaces | common Nest/Postgres/Event Ledger | `ecosystem:verify` component gate | Partial: no reconciled all-role E2E, production or store certification |
| Legal | account/ERP document primitives | documents, consent timestamps and data controls | API subsets | Partial: immutable policy versions, retention jobs, contracts and KG legal approval |

## Mandatory role journeys

The release suite must cover anonymous customer, authenticated customer, seller/cashier,
warehouse, courier, support/service, manager/owner and security auditor as distinct
black-box identities. Shared-core tests do not count as packaged-app acceptance. iOS
requires application XCUITest targets; Android requires connected tests in each app
module. Visual acceptance requires committed, SHA-256-verified desktop/mobile/native
golden artifacts recorded in `docs/acceptance/ecosystem-evidence.json`. Linked handoffs
may be retired only with an owner approval reference and timestamp in that manifest.
