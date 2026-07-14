# ERP App and Site master plan

## Objective

Deliver one AliStore operating system in which storefront, ERP web, Staff, Courier
and POS native applications are views over the same NestJS domain services,
PostgreSQL records and append-only Event Ledger. A feature is not integrated merely
because both screens exist: the same entity must move through one server-authoritative
state machine and pass a cross-surface E2E scenario.

## Current baseline

- Storefront and ERP share the NestJS API, PostgreSQL catalog, customers, orders,
  payments, stock, procurement, warranty, support, approvals and reporting data.
- Android Client, Staff, Courier and POS use typed forms of those contracts. Four
  APKs build; JVM/Lint and selected API 36 Compose gates are green.
- Web and both native platforms implement the first POS/Staff/Courier software
  verticals. App-level native E2E, some 95-screen ERP modules, live providers and
  physical hardware remain incomplete.
- Therefore ERP App/site integration is functional for implemented verticals, but
  the complete ecosystem and production certification are not finished.

## Integration contract

| Business event | Storefront/Client | ERP/Staff/POS/Courier | Authoritative record |
|---|---|---|---|
| Product published | catalog/search/product | product/CMS/stock controls | Product + inventory projection |
| Order created | cart/checkout/order history | order queue/warehouse/dispatch | Order + OrderItem |
| Payment settled | payment return/status | POS/finance/reconciliation | Payment + provider event |
| Stock reserved/sold | availability | warehouse/POS/procurement | DeviceUnit + Reservation + Movement |
| Approval requested | customer waits for result | approval inbox/POS retry | Approval + Event Ledger |
| Pickup/delivery | order status | Staff/Courier/COD | Order + CourierRun |
| Return/refund | account request/status | ERP Return Desk, approval, refund and warehouse receipt | Return + Payment + Movement + ConsignmentAdjustment |
| Warranty/support | customer self-service | Staff/service workflow | WarrantyCase/SupportTicket + Evidence |

Every row must enforce JWT ownership or staff RBAC, stable idempotency for repeated
mutations, atomic critical writes and an Event Ledger record. Clients may display but
must never assign paid, approved, delivered, refunded or stock status locally.

## Phase 0: freeze and map the truth

1. Generate a route-to-API-to-model matrix for all 37 web routes, four Android apps,
   four iOS targets and every tracked handoff screen.
2. Mark each flow `implemented`, `partial`, `placeholder`, `external` or `blocked`.
3. Remove duplicate local/demo business state where PostgreSQL APIs already exist.
4. Add contract tests for every shared DTO and state transition.

Gate: no unknown integration owner; every screen has a source API, model, RBAC rule,
ledger rule and acceptance test, or is explicitly tracked as incomplete.

## Phase 1: complete the first-store operational spine

1. Storefront/Client: catalog, stock, checkout, payment, order status and returns.
2. ERP/Staff: order queue, picking, packing, pickup, warranty and support.
3. Courier: assignment, route, delivery/failure, Evidence, COD and handover.
4. POS: scanner/IMEI, shift, sale/split tender, approval, receipt, offline recovery,
   return, refund and exchange.
5. Finance: reconcile provider, POS, COD, refunds and shift totals against Ledger.

Gate: prepaid pickup, courier, COD and POS orders complete end-to-end; return/refund,
exchange and shift close reconcile money, stock and Ledger with no duplicate effects.

## Phase 2: close ERP Wave A

Implement exact handoffs plus shared APIs for budgets/plan-fact, variants/bundles,
HR schedules/tasks/KPI/payroll, delivery zones/slots,
routes and dispatch. Product publication must immediately affect customer discovery;
bundle/component stock and delivery capacity must be validated server-side.

Gate: migrations, RBAC, Ledger, API tests, ERP Playwright, storefront consequence test
and visual evidence exist for every Wave A module.

## Phase 3: close ERP Waves B and C

Add service center and loaner fund, store opening/closing and incidents, CMS publishing,
analytics, legal document/version retention, franchise audits, advertising, referrals,
Q&A, loyalty, Telegram/WhatsApp storefronts and production AI evaluation. AI can only
recommend; verified domain services perform money, stock and status mutations.

Gate: all tracked handoff screens have acceptance status and no placeholder action is
presented as operational.

## Phase 4: native parity

1. Complete iOS Client, Staff, Courier and POS with the same server contracts.
2. Complete remaining Android Client/Staff/Courier/POS device and feature gaps.
3. Preserve stable offline idempotency keys across process restart.
4. Add push/deep-link routing, secure storage, permission states and conflict recovery.

Gate: four iOS targets and four Android apps pass unit/UI/E2E plus physical-device
camera, scanner, maps, push, offline restart and crash-free smoke.

## Phase 5: ecosystem E2E

Automate storefront-to-ERP scenarios for purchase, pickup, courier, COD, POS,
procurement/partial receiving, refund, exchange, warranty, support escalation,
approval/2FA, duplicate/reordered webhook, timeout/repeated tap, offline replay and
Redis/Search/R2 outage. Assert final Order, Payment, stock and Ledger invariants.

Gate: `mvp:verify`, API, Playwright and native E2E are green; Critical/High defects are
zero; reconciliation has no unexplained difference.

## Phase 6: production and release

Deploy separated staging/production on Render and Cloudflare; complete BullMQ, Redis,
Meilisearch, private R2 Evidence, Sentry, backups, restore and rollback. Certify live
payment, SMS, fiscal, APNs/FCM and channels. Release Client publicly and Staff/Courier/POS
through controlled distribution after signing, privacy and physical-device gates.

Gate: strict launch checks pass with real credentials, restore and rollback drills pass,
and one pilot store completes every required real transaction and reconciliation.

## Execution order

1. Maintain the generated integration matrix and add cross-surface E2E fixtures.
2. Complete native Staff attendance and retain the verified immutable payroll posting, cash handover, logistics capacity/dispatch, line-level return and quantity-consignment invariants.
3. Add app-specific XCUITest/Compose E2E and close native device certification gaps.
4. Deliver remaining ERP Waves B/C by handoff acceptance.
5. Run ecosystem E2E and security/load/restore gates.
6. Activate staging, live providers, store releases and the first-store pilot.

## Definition of done

A vertical is done only when UI states, typed API, authorization, idempotency, atomic
domain mutation, Event Ledger, tests, handoff visual match, documentation and a verified
commit all exist. External credentials or hardware are reported as blockers and never
simulated as certification.
