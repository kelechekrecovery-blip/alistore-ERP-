# PROGRESS

## 2026-07-08

- Task: add gift cards / store credit to checkout and payments.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260708090000_add_gift_cards/migration.sql`, `apps/api/src/giftcards/*`, payment service/DTO/module/intents, authz/app module, checkout gift-card UI/API clients, gift-card/payment/cleanup tests, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PARALLEL-LANES.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: new `GiftCard` store-credit balance supports staff issue, public balance check, atomic checkout/POS redemption as `PaymentMethod.gift_card`, generated idempotency txn per card+order, partial online-payment due, and checkout applies a gift card before creating a sandbox intent for the remaining amount.
- Checks run: `npm run prisma:generate -w @alistore/api`; `npm run db:deploy -w @alistore/api`; test DB `prisma db push --skip-generate`; `npm run test -w @alistore/api -- giftcards payment-intents --runInBand`; `npm run test -w @alistore/api -- fulfillment giftcards --runInBand`; `npm run test -w @alistore/api -- product-reviews --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; live API+Next+Chrome/CDP checkout smoke on ports 4105/3105.
- Outcome: targeted Jest passed; API build passed; web build passed; full API Jest passed 84 suites / 298 tests; browser smoke completed gift card 25 000 + card 75 000 checkout and DB showed order paid, card redeemed, and `giftcard.redeemed` ledger event. Also fixed stale `InventoryMovement` cleanup in fulfillment/product-review tests.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; next unblocked P2 items are E2E+CI, Admin Product Management UI, or Telegram Mini App shell.

## 2026-07-08

- Task: add consent-filtered transactional notification templates.
- Files changed: `apps/api/src/outbox/customer-notifications.ts`, orders/warranty/debts/reservations services and modules, `apps/api/test/transactional-notifications.e2e-spec.ts`, debt/reservation notification tests, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: orders now enqueue `order_confirmed` and `order_ready`, warranty cases enqueue `warranty_created` and `warranty_closed`, reservation expiry and debt reminders reuse a shared consent-aware customer notification helper, and opted-out customers are skipped without blocking the underlying business transaction.
- Checks run: `npm run test -w @alistore/api -- transactional-notifications debts reservation-expiry --runInBand`; `npm run api:build`; `npm run api:test`; `npm run build -w @alistore/web`; `git diff --check`.
- Outcome: targeted Jest passed 3 suites / 14 tests; API build passed; full API Jest passed 83 suites / 294 tests; web build passed; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; then continue with P2/E2E+CI or provider/hardware-gated work.

## 2026-07-08

- Task: polish trade-in contract print locale, IMEI, and price formatting.
- Files changed: `apps/api/src/documents/trade-in-contract.ts`, `apps/api/src/documents/documents.service.ts`, `apps/api/test/documents.spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: trade-in contract content now has a pure line builder, prints optional IMEI/SN, uses `dd.mm.yyyy` issue date, and formats the buyback price with thousands separators in сом.
- Checks run: `npm run test -w @alistore/api -- documents --runInBand`; `npm run api:build`; `npm run api:test`; `git diff --check`.
- Outcome: documents tests passed 1 suite / 12 tests; API build passed; full API Jest passed 82 suites / 290 tests; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands.

## 2026-07-08

- Task: add rate limiting to public checkout, OTP, support, and webhook endpoints.
- Files changed: `apps/api/src/rate-limit/*`, auth/customers/orders/payments/support modules/controllers, `apps/api/test/public-rate-limit.e2e-spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: shared `RateLimitModule` now backs per-route caps on checkout-chain writes (`POST /customers`, `POST /orders`, `POST /payments/intents`), public support ticket creation, sandbox/provider payment webhooks, and existing OTP throttling.
- Checks run: `npm run test -w @alistore/api -- public-rate-limit auth-throttle --runInBand`; `npm run api:build`; `npm run api:test`; `git diff --check`.
- Outcome: targeted rate-limit/auth-throttle tests passed 2 suites / 5 tests; API build passed; full API Jest passed 82 suites / 289 tests; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands.

## 2026-07-08

- Task: activate trade-in IMEI capture for `imei_reuse` risk detection.
- Files changed: `apps/api/src/tradeins/*`, `apps/api/test/tradein-rbac.e2e-spec.ts`, `apps/api/test/reports.e2e-spec.ts`, `apps/api/test/warranty-rbac.e2e-spec.ts`, `apps/web/lib/api/tradeins.ts`, `/staff`, `/trade-in`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: trade-in DTOs now accept optional IMEI, service stores it on `TradeInDevice.imei`, ledger refs include it, Staff app and customer Trade-in screen can capture it, and Risk Center acceptance proves a sold-device IMEI reused in buyback becomes high-risk `imei_reuse`.
- Checks run: `npm run test -w @alistore/api -- tradein-rbac reports --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; Chrome/CDP smoke on `/trade-in` through isolated API `4102` + web `3102`; `npm run api:test`.
- Outcome: targeted Jest passed 2 suites / 4 tests; API build passed; web build passed; browser smoke created a trade-in contract and showed the submitted IMEI on the success screen; full API Jest passed 81 suites / 285 tests after fixing stale FK cleanup order in reports/warranty RBAC tests.
- Next step: P0-2 `/reports/*` + `/ai/*` guard remains blocked until the web-token handoff for `lib/reports.ts` and `lib/ai.ts` lands.

## 2026-07-08

- Task: write infra runbook for Caddy/backups deployment.
- Files changed: `infra/RUNBOOK.md`, `infra/README.md`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: added a production operator checklist for host baseline, env values, build/deploy, self-hosted MinIO/Metabase, Caddy validation/reload, backup schedule, restore drill, release smoke and rollback.
- Checks run: `bash -n infra/backup.sh`; `rg "Restore Drill|caddy validate|pg_restore|docker compose" infra/RUNBOOK.md`; `git diff --check -- infra/RUNBOOK.md infra/README.md BACKLOG.md docs/CODEX-HANDOFF.md docs/PHASES.md PROGRESS.md`.
- Outcome: runbook docs are present and parse/check cleanly; Docker/Caddy were not executed on this dev machine.
- Next step: remaining MVP work is external/provider/hardware gated, with the trade-in IMEI intake noted separately for schema-coordinated follow-up.

## 2026-07-07

- Task: complete the customer-facing app to match the AliStore ecosystem/client prototype.
- Files changed: `apps/web/app/*`, `apps/web/components/*`, `apps/web/lib/*`, `docs/PHASES.md`, `BACKLOG.md`.
- Result: added customer routes for search, bonuses, addresses, notifications/preferences, settings, returns, support, and trade-in; wired them into account/home/order navigation; made cart promo/bonus state feed checkout totals.
- Checks run: `npm run build -w @alistore/web`; `npm run api:build && npm run api:test`.
- Outcome: web build passed; API build passed; Jest passed 53 suites / 167 tests.
- Next step: evidence upload flows and external/hardware integrations from `BACKLOG.md`.

## 2026-07-07

- Task: make the app operationally ready by adding Evidence Vault uploads to real flows.
- Files changed: `apps/api/src/evidence/*`, `apps/api/test/evidence.e2e-spec.ts`, `apps/web/components/EvidencePicker.tsx`, evidence wiring in trade-in, returns, warranty, support, and warehouse.
- Result: images are compressed by `MediaService`, stored under `/uploads`, linked to the relevant domain entity through `evidence.attached` Event Ledger entries, and visible flows report uploaded evidence counts.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: API build passed; web build passed; Jest passed 55 suites / 173 tests.
- Next step: external payment adapters and offline/hardware POS from `BACKLOG.md`.

## 2026-07-07

- Task: add production-shaped online payment adapters for checkout.
- Files changed: `apps/api/src/payments/payment-intents.*`, `apps/api/test/payment-intents.e2e-spec.ts`, `apps/web/lib/api/payments.ts`, `apps/web/app/checkout/page.tsx`.
- Result: card/MBank/O!Деньги/installment checkout creates a payment intent, reserves stock, moves the order to `awaiting_payment`, and confirms through an idempotent sandbox/provider webhook.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: API build passed; web build passed; Jest passed 56 suites / 175 tests.
- Next step: offline POS queue/sync and hardware adapters from `BACKLOG.md`.

## 2026-07-07

- Task: make POS resilient enough for store operations by adding offline queue/sync and browser hardware fallbacks.
- Files changed: `apps/api/src/pos/*`, `apps/api/src/payments/payments.service.ts`, `apps/api/test/pos-sale.e2e-spec.ts`, `apps/web/app/pos/page.tsx`, `apps/web/lib/pos-offline.ts`, `apps/web/lib/pos-hardware.ts`, `apps/web/components/pos/PosCheckout.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS sales now carry a client-generated idempotency key, offline sales persist locally with conflict/approval states, `/pos` can sync queued sales safely, scan SKU/barcodes through keyboard-wedge/manual input, check terminal readiness, and print local or synced receipts.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: API build passed; web build passed; Jest passed 57 suites / 180 tests.
- Next step: staff JWT role rollout for PII/2FA dangerous-action gates, then external campaign/provider integrations.

## 2026-07-07

- Task: harden staff JWT authorization for PII reads and approval decisions.
- Files changed: `apps/api/src/auth/*`, `apps/api/src/customers/customers.controller.ts`, `apps/api/src/approvals/*`, `apps/api/test/customer-pii-guard.e2e-spec.ts`, `apps/api/test/approvals-jwt-guard.e2e-spec.ts`, `apps/web/app/approvals/page.tsx`, `apps/web/lib/api/approvals.ts`, `apps/web/lib/api/staff-auth.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: customer phone is masked for anonymous/junior reads and revealed only to self/admin/owner; Approval Inbox requires staff JWT and approve/reject uses JWT role instead of body-supplied `approverRole`.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; targeted Jest for PII/approval JWT; `npm run api:test`; headless Chrome screenshot of `/approvals`.
- Outcome: API build passed; web build passed; targeted authz tests passed; Jest passed 59 suites / 184 tests.
- Next step: step-up 2FA and staff-session rollout for POS/warehouse/staff operational endpoints.

## 2026-07-07

- Task: add staff step-up 2FA for dangerous approval decisions.
- Files changed: `apps/api/prisma/*`, `apps/api/src/staff-auth/*`, `apps/api/src/approvals/*`, staff/approval tests, `apps/web/app/approvals/page.tsx`, `apps/web/lib/api/*`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: staff accounts can enroll/enable/disable TOTP; staff login returns `totpEnabled`; Approval Inbox approve requires a valid TOTP code from an active staff row while reject remains available; `/approvals` includes 2FA enrollment and approval-code UI.
- Checks run: `npm run prisma:generate -w @alistore/api`; Prisma migration deploy on dev DB; test DB schema sync with `prisma db push`; `npm run api:build`; targeted Jest for `staff-auth`, `approvals-jwt-guard`, `staff-auth-guard`, `authz-e2e`; `npm run build -w @alistore/web`; `npm run api:test`; headless Chrome mobile QA for `/approvals` login/session → 2FA setup.
- Outcome: API build passed; web build passed; targeted tests passed; Jest passed 59 suites / 187 tests; browser QA showed 2FA setup secret/otpauth, no horizontal overflow, no critical network failures (favicon 404 only).
- Next step: staff-session rollout for POS/warehouse/staff operational endpoints.

## 2026-07-07

- Task: roll out staff sessions to POS, warehouse, and staff operational endpoints.
- Files changed: `apps/api/src/auth/staff-principal.ts`, POS/inventory/shifts/orders controllers and modules, `apps/api/src/staff-auth/staff-auth.service.ts`, `apps/api/test/staff-session-ops.e2e-spec.ts`, shared web staff-session/login components, POS/warehouse/staff/approvals pages, and staff-aware web API clients.
- Result: POS sale, shifts, inventory movement/transfer/count, and order queue/reserve/fulfill/transition now require an active staff JWT; server-side actor/staffId comes from the token instead of body/query spoofing; `/pos`, `/warehouse`, and `/staff` share a persisted staff session, and offline POS sync sends the current staff token.
- Checks run: `npm run api:build`; targeted Jest for `staff-session-ops` and `staff-auth`; `npm run build -w @alistore/web`; `npm run api:test`; browser QA for `/pos` staff login followed by `/warehouse` and `/staff` session reuse.
- Outcome: API build passed; web build passed; targeted tests passed; Jest passed 60 suites / 191 tests; browser QA passed with no failed requests or horizontal overflow.
- Next step: extend the Role Permission Matrix across the remaining operational endpoints, then continue external provider/hardware integrations.

## 2026-07-07

- Task: enforce the Role Permission Matrix on staff-session operational endpoints.
- Files changed: `apps/api/src/authz/authz.model.ts`, POS/inventory/shifts/orders controllers and modules, `apps/api/test/staff-session-ops.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS sale, cash-shift open/read/close, inventory movement/transfer/count, and order queue/reserve/fulfill/transition now require both an active staff JWT and the correct role; wrong-role staff tokens return 403 before service execution.
- Checks run: targeted Jest for `staff-session-ops`, `authz-e2e`, and `staff-auth-guard`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 3 suites / 14 tests; API build passed; full Jest passed 60 suites / 195 tests.
- Next step: extend the remaining Role Permission Matrix rollout to courier, warranty, support, suppliers, debts, trade-in intake, and admin documents/labels/receipts.

## 2026-07-07

- Task: extend active-staff RBAC to courier and print/export operational endpoints.
- Files changed: `apps/api/src/auth/active-staff.guard.ts`, `apps/api/src/authz/authz.model.ts`, courier/documents/labels/receipts controllers and modules, `apps/api/src/staff-auth/staff-auth.module.ts`, `apps/api/test/courier-print-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: courier assignment, COD handover, failed-delivery recording, document rendering, label rendering, and receipt rendering now require an active staff JWT plus the correct role; actors for courier ledger events come from the JWT.
- Checks run: targeted Jest for `courier-print-rbac`, `staff-session-ops`, and `authz-e2e`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 3 suites / 14 tests; API build passed; full Jest passed 61 suites / 198 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for warranty, support/CRM, suppliers, debts, trade-in intake, returns/exchanges, products, and payment refunds.

## 2026-07-07

- Task: enforce staff RBAC on product price/archive and refund request endpoints.
- Files changed: `apps/api/src/authz/authz.model.ts`, `apps/api/src/products/*`, `apps/api/src/payments/*`, `apps/api/test/dangerous-endpoint-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: price changes, product archive requests, and refund requests now require active staff JWT plus the right role; body `requester` spoofing is ignored and Approval/Audit actor comes from the token. Public payment intent/webhook endpoints remain open for checkout/provider flow.
- Checks run: targeted Jest for `dangerous-endpoint-rbac`, `dangerous-actions`, `refund-approval`, and `authz-e2e`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 4 suites / 15 tests; API build passed; full Jest passed 62 suites / 201 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for warranty, support/CRM, suppliers, debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: split warranty customer self-service from staff-console RBAC gates.
- Files changed: `apps/api/src/warranty/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/warranty-rbac.e2e-spec.ts`, `apps/api/test/dangerous-endpoint-rbac.e2e-spec.ts`, `apps/web/app/warranty/page.tsx`, `apps/web/lib/warranty.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `POST /warranty` remains public customer self-service; warranty list/get/transition now require active staff JWT with warehouse/admin/owner role; transition actor comes from JWT; `/warranty` reuses the shared staff session login.
- Checks run: targeted Jest for `warranty-rbac`, `warranty`, and `authz-e2e`; `npm run build -w @alistore/web`; `npm run api:build`; `npm run api:test`; browser QA on `/warranty` staff login.
- Outcome: targeted tests passed 3 suites / 7 tests; web build passed; API build passed; full Jest passed 63 suites / 202 tests; browser QA passed with no failed requests or horizontal overflow.
- Next step: split public/customer self-service from staff/admin RBAC gates for support/CRM, suppliers, debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: split support/CRM customer self-service from staff/admin RBAC gates.
- Files changed: `apps/api/src/support/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/support-rbac.e2e-spec.ts`, `apps/web/components/erp/CrmView.tsx`, `apps/web/lib/crm.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `POST /support/tickets` and customer-scoped ticket lookup remain public self-service; CRM inbox list/transition/escalate require active admin/owner staff JWT; body actor spoofing is ignored; `/erp` CRM reuses the shared staff session.
- Checks run: targeted Jest for `support-rbac`, `support`, and `authz-e2e`; `npm run build -w @alistore/web`; `npm run api:build`; `npm run api:test`; browser QA on `/erp` CRM staff login.
- Outcome: targeted tests passed 3 suites / 10 tests; web build passed; API build passed; full Jest passed 64 suites / 203 tests; browser QA passed with no failed requests or horizontal overflow.
- Next step: split public/customer self-service from staff/admin RBAC gates for suppliers, debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: enforce supplier/RMA/scorecard staff RBAC gates.
- Files changed: `apps/api/src/suppliers/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/supplier-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: supplier create/list, RMA open/list/transition, and supplier scorecard now require active staff JWT plus role permission; warehouse can run RMA operations, admin/owner can manage supplier master data and scorecard, and RMA ledger actors come from the staff token.
- Checks run: targeted Jest for `supplier-rbac`, `supplier-rma`, and `authz-e2e`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 3 suites / 10 tests; API build passed; full Jest passed 65 suites / 204 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: enforce debt/installment staff RBAC gates.
- Files changed: `apps/api/src/debts/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/debt-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: debt create/list/payment endpoints now require active staff JWT plus role permission; debt ledger actors and over-limit approval requesters come from the staff token instead of body actor spoofing.
- Checks run: targeted Jest for `debt-rbac`, `debts`, and `authz-e2e`; `npm run api:build`; `npm run api:test`; committed-baseline Jest excluding unrelated `categorize.spec.ts` WIP.
- Outcome: targeted tests passed 3 suites / 10 tests; API build passed; current working tree Jest passed 67 suites / 209 tests; committed-baseline Jest passed 66 suites / 205 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for trade-in intake and returns/exchanges.

## 2026-07-07

- Task: split trade-in customer self-service from staff intake RBAC gates.
- Files changed: `apps/api/src/tradeins/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/tradein-rbac.e2e-spec.ts`, `apps/web/app/staff/page.tsx`, `apps/web/lib/api/tradeins.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: public `POST /tradeins` remains customer self-service but ignores body actor; staff buyback uses `POST /tradeins/intake` with active staff JWT and role permission; trade-in read is staff-guarded; Staff app sends the shared staff token.
- Checks run: targeted Jest for `tradein-rbac`, `tradeins`, and `authz-e2e`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; browser QA on `/staff` buyback intake.
- Outcome: targeted tests passed 3 suites / 6 tests; API build passed; web build passed; full Jest passed 69 suites / 215 tests; browser QA passed with `POST /api/tradeins/intake` 201, no failed requests, no console errors, and no horizontal overflow.
- Next step: split public/customer self-service from staff/admin RBAC gates for returns/exchanges.

## 2026-07-07

- Task: split returns/exchanges customer self-service from staff/cashier RBAC gates.
- Files changed: `apps/api/src/returns/*`, `apps/api/src/exchanges/*`, `apps/api/src/units/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/returns-exchanges-rbac.e2e-spec.ts`, test cleanup fixtures, `apps/web/app/account/returns/page.tsx`, `apps/web/app/exchange/page.tsx`, `apps/web/lib/api/returns.ts`, `apps/web/lib/api/exchanges.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `POST /returns` now requires a customer JWT and verifies order ownership, staff return list/get/transition require active staff RBAC, unit lookup and exchange creation require active staff RBAC, and `/exchange` uses the shared staff session with server-side actor from the token.
- Checks run: targeted Jest for `returns-exchanges-rbac`, `exchange`, `units-lookup`, `refund-approval`, and `authz-e2e`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; browser QA on `/exchange` staff login → unit lookup → exchange.
- Outcome: targeted tests passed 5 suites / 12 tests; API build passed; web build passed; full Jest passed 71 suites / 222 tests; browser QA passed with `GET /api/units/:imei` 200, `POST /api/exchanges` 201, no failed requests, no console errors, and no horizontal overflow.
- Next step: certify physical POS hardware once devices/provider accounts are available, then add campaign delivery integrations.

## 2026-07-07

- Task: enforce POS margin-control approval gate.
- Files changed: `apps/api/src/pos/*`, `apps/api/src/rbac/permissions.ts`, `apps/api/test/pos-sale.e2e-spec.ts`, `apps/api/test/rbac.spec.ts`, `apps/web/components/pos/PosCheckout.tsx`, `apps/web/lib/api/pos.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS sale now computes server-side margin from `Product.cost`; a sale whose discounted unit margin falls below `minMarginSom` is parked in Approval Inbox even if the discount percent is within the normal limit, and the approval stores a sale fingerprint so it cannot be reused for a changed product/cost/price/qty mix.
- Checks run: targeted Jest for `pos-sale`, `rbac`, and `staff-session-ops`; `npm run api:build`; `npm run build -w @alistore/web` before revenue-trend integration landed; committed-scope full Jest; browser QA on `/pos` margin-control approval.
- Outcome: targeted tests passed 3 suites / 19 tests; API build passed; web build passed for the margin-control snapshot; full committed-scope Jest passed 72 suites / 231 tests; browser QA passed with `POST /api/pos/sale` 202, margin approval copy visible, no failed requests, no console errors, and no horizontal overflow.
- Next step: physical POS hardware certification and campaign delivery integrations remain dependent on external devices/provider accounts.

## 2026-07-07

- Task: finish ERP revenue trend comparison.
- Files changed: `apps/api/src/reports/*`, `apps/api/test/revenue-trend.spec.ts`, `apps/web/app/erp/page.tsx`, `apps/web/lib/reports.ts`, `BACKLOG.md`, `PROGRESS.md`.
- Result: ERP dashboard now fetches `GET /reports/revenue-trend?days=N` alongside the revenue buckets and shows a compact period-over-period badge for 7/30 day views.
- Checks run: targeted Jest for `revenue-trend`, `revenue-buckets`, and `reports`; `npm run api:build`; `npm run build -w @alistore/web`; full `npm run api:test`; browser QA on `/erp` 7-day revenue trend and 30-day period switch.
- Outcome: targeted tests passed 3 suites / 12 tests; API build passed; web build passed; full Jest passed 73 suites / 237 tests; browser QA passed with `GET /api/reports/revenue?days=7` 200, `GET /api/reports/revenue-trend?days=7` 200, `GET /api/reports/revenue?days=30` 200, `GET /api/reports/revenue-trend?days=30` 200, visible trend badge, no failed requests, no console errors, and no horizontal overflow.
- Next step: physical POS hardware certification and campaign delivery integrations remain dependent on external devices/provider accounts.

## 2026-07-07

- Task: connect owner AI assistant to merchandising signals.
- Files changed: `apps/api/src/ai/insight*`, `apps/api/src/ai/insights.service.ts`, `apps/api/test/insight.spec.ts`, `apps/api/test/insights-service.spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `GET /ai/insights` now enriches the ledger/KPI context with urgent reorder items and overstock pricing recommendations, so the ERP assistant can surface restock warnings and discount hints without an AI provider key.
- Checks run: targeted Jest for `insight`, `insights-service`, `pricing`, and `reorder`; `npm run api:build`; full `npm run api:test`; `npm run build -w @alistore/web` after clearing stale `.next`.
- Outcome: targeted tests passed 4 suites / 19 tests; API build passed; full Jest passed 74 suites / 241 tests; web build passed.
- Next step: physical POS hardware certification and campaign delivery integrations remain dependent on external devices/provider accounts.

## 2026-07-07

- Task: optimize product detail related products.
- Files changed: `apps/web/lib/api/catalog.ts`, `apps/web/app/product/[id]/ProductClient.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: product detail now derives same-category related products through one storefront catalog helper, ranks in-stock and price-near items first, and avoids the old duplicate full-catalog fetch.
- Checks run: `npm run build -w @alistore/web`; browser QA on `/product/cmr8rbs7t0001h7bzi59xoj2s`.
- Outcome: web build passed; browser QA passed with one `GET /api/catalog/products?limit=100&offset=0` 200, visible related-products section, no failed requests, no console errors, and no horizontal overflow.
- Next step: finish storefront reviews or move to another unblocked backlog item.

## 2026-07-08

- Task: add printable order invoice / waybill PDF.
- Files changed: `apps/api/src/documents/*`, `apps/api/test/documents.spec.ts`, `apps/api/test/courier-print-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: staff print/export can now render `GET /documents/order/:id/invoice` as an A4 накладная PDF with customer, channel/status, SKU, product name, qty, IMEI/SN, total and received/reconciled payment lines. The invoice line builder is pure-tested so the required fields are locked, not just PDF bytes.
- Checks run: targeted Jest for `documents` and `courier-print-rbac`; `npm run api:build`; `git diff --check`.
- Outcome: targeted tests passed 2 suites / 14 tests; API build passed; RBAC guard smoke confirms courier is denied and seller reaches domain validation.
- Next step: infra runbook for Caddy/backups is the remaining unblocked MVP polish; social/campaign/hardware/AI provider work still waits for external credentials/devices.

## 2026-07-07

- Task: add OTP access recovery with refresh-session revocation.
- Files changed: `apps/api/src/auth/*`, `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/auth-throttle.e2e-spec.ts`, `apps/web/lib/api/auth.ts`, `apps/web/lib/auth.tsx`, `apps/web/app/login/page.tsx`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: `/auth/recovery/request` issues a recovery OTP without revealing account existence; `/auth/recovery/verify` validates an existing customer, revokes old refresh tokens, and issues a fresh token pair. `/login` now has a recovery mode and no longer presents inert social buttons as active actions.
- Checks run: targeted Jest for `auth`; `npm run api:build`; `npm run build -w @alistore/web`; browser QA on mobile `/login` recovery flow; DB verification query.
- Outcome: auth tests passed 6 suites / 21 tests; API build passed; web build passed; browser QA reached `/account` with recovery request/verify 201 and `/auth/me` 200; DB showed 2 refresh rows for the QA customer with 1 revoked old token and 1 active new token.
- Next step: remaining bounded unblocked work is broader PDF/print polish or infra runbook; real social providers remain blocked on Apple/Telegram credentials.

## 2026-07-07

- Task: print split payment tenders on receipts.
- Files changed: `apps/api/src/receipts/receipts.dto.ts`, `apps/api/src/receipts/receipts.service.ts`, `apps/api/test/receipts.spec.ts`, `apps/api/test/receipts-order.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: receipts now keep backward-compatible `payment` but can render `payments[]`; `renderOrder()` prints every received/reconciled positive tender with method and amount, so POS split payments appear correctly on printed receipts.
- Checks run: targeted Jest for `receipts`; `npm run api:build`; `git diff --check`.
- Outcome: receipts tests passed 2 suites / 7 tests; API build passed; split order receipt includes `cash | 30 000` and `card | 70 000`.
- Next step: remaining bounded unblocked work is auth recovery/social login, broader PDF/print polish for documents, or infra runbook; provider/hardware work still waits for accounts/devices.

## 2026-07-07

- Task: add consent-filtered Campaign Segment Builder and ROI.
- Files changed: `apps/api/src/campaigns/*`, `apps/api/src/app.module.ts`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/campaigns.e2e-spec.ts`, `apps/web/components/erp/CampaignsView.tsx`, `apps/web/app/erp/page.tsx`, `apps/web/lib/api/campaigns.ts`, `apps/web/lib/api.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: marketer/admin/owner staff can preview consent-filtered audience segments by level/city/tags/spend/ltv, create campaigns that enqueue outbox messages only for consenting customers, and attribute paid orders once for Campaign ROI from received payments. ERP now has a working “Кампании” cockpit tab for preview, launch, and ROI conversion.
- Checks run: targeted Jest for `campaigns`; `npm run api:build`; `npm run build -w @alistore/web`; browser QA on `/erp` campaigns flow; DB verification query.
- Outcome: campaigns e2e passed 1 suite / 1 test; API build passed; web build passed; browser QA passed with `POST /api/campaigns/preview` 200, `POST /api/campaigns` 201, `POST /api/campaigns/:id/conversions` 200, visible ROI 700%, no failed requests/console errors; DB verification showed outbox recipients include the consenting customer and exclude the opted-out customer, with one conversion event for the order.
- Commit: included in the campaign feature commit for this iteration.
- Next step: remaining bounded unblocked work is auth recovery/social login, PDF/print polish, or infra runbook; provider/hardware work still waits for accounts/devices.

## 2026-07-07

- Task: add purchased-product reviews.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260707191500_add_product_reviews/migration.sql`, `apps/api/src/products/*`, `apps/api/test/product-reviews.e2e-spec.ts`, `apps/web/app/product/[id]/ProductClient.tsx`, `apps/web/lib/api/catalog.ts`, `BACKLOG.md`, `PROGRESS.md`, `docs/PHASES.md`.
- Result: product detail now reads live review summary/list from `GET /products/:id/reviews`; authenticated customers can post `POST /products/:id/reviews` only after buying that SKU in a paid/completed order; duplicate reviews for the same product/customer/order are blocked.
- Checks run: targeted Jest for `product-reviews` and `dangerous-endpoint-rbac`; `npm run api:build`; `npm run build -w @alistore/web`; browser QA on product review form submit.
- Outcome: targeted tests passed 2 suites / 4 tests; API build passed; web build passed; browser QA passed with review summary GET 200, review POST 201, refreshed summary GET 200, visible published review, no failed requests, no console errors, and no horizontal overflow; full current-tree Jest passed 76 suites / 248 tests including parallel revenue-range WIP.
- Next step: move to another unblocked backlog item after the parallel revenue-range work is either committed or cleared.

## 2026-07-07

- Task: add POS split payments.
- Files changed: `apps/api/src/payments/payments.service.ts`, `apps/api/src/pos/*`, `apps/api/test/pos-sale.e2e-spec.ts`, `apps/api/test/invariants.e2e-spec.ts`, `apps/web/app/pos/page.tsx`, `apps/web/components/pos/PosCheckout.tsx`, `apps/web/lib/api/pos.ts`, `apps/web/lib/pos-offline.ts`, `apps/web/lib/pos-hardware.ts`, `design_handoff_alistore/reference/api-and-events.md`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS now accepts `payments[]` for split tenders, validates the tender sum against the discounted total, records separate payments/ledger events, and only sells IMEI/releases reservations when cumulative received payments cover the order total. Checkout UI supports Split rows; offline payloads and receipts preserve the tender breakdown.
- Checks run: targeted Jest for `pos-sale`; targeted Jest for `invariants`, `payment-intents`, and `refund-approval`; `npm run api:build`; `npm run build -w @alistore/web`; full `npm run api:test`; browser QA on `/pos` split 30000 cash + 70000 card.
- Outcome: POS targeted tests passed 10/10; payment invariant tests passed 3 suites / 9 tests; API build passed; web build passed; full API Jest passed 77 suites / 256 tests; browser QA passed with `POST /api/pos/sale` 201, payload `payments:[cash 30000, card 70000]`, order `paid`, IMEI sold, and screenshot `/tmp/alistore-pos-split-payment.png`. The existing 3000 dev server had stale Next chunks, so browser QA used a clean temporary dev server on 3101.
- Next step: certify physical POS hardware once scanners/receipt printers/bank terminal provider accounts are available, then add campaign delivery integrations.

## 2026-07-07

- Task: add warehouse batch receiving UI/API.
- Files changed: `apps/api/src/inventory/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/staff-session-ops.e2e-spec.ts`, `apps/web/components/WarehouseOps.tsx`, `apps/web/lib/api/warehouse.ts`, `design_handoff_alistore/reference/api-and-events.md`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: warehouse/admin/owner staff can call `POST /inventory/receive` to receive an IMEI batch into stock; the mutation creates DeviceUnit rows, one `InventoryMovement(received)`, and `stock.received`/`unit.received` ledger events with actor from the JWT. `/warehouse` now has a batch receiving panel with product, location, grade, and multiline IMEI/SN input.
- Checks run: targeted Jest for `staff-session-ops`; `npm run api:build`; `npm run build -w @alistore/web`; full `npm run api:test`; browser QA on `/warehouse` batch receive.
- Outcome: targeted staff-session test passed 9/9; API build passed; web build passed; full API Jest passed 78 suites / 262 tests; browser QA passed with `POST /api/inventory/receive` 201, payload 2 IMEIs, `received:2`, visible success toast, and screenshot `/tmp/alistore-warehouse-receive.png`.
- Next step: add scanner-assisted inventory count UI, then external POS hardware/campaign integrations when devices/provider accounts are available.

## 2026-07-07

- Task: add scanner-assisted inventory count UI.
- Files changed: `apps/web/components/WarehouseOps.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: the warehouse inventory panel now accepts scanner-friendly multiline IMEI/SN input, deduplicates scanned values, shows the scan count, and can set the counted quantity from scans before posting the existing `POST /inventory/count` movement.
- Checks run: `npm run build -w @alistore/web`; browser QA on `/warehouse` scanner-assisted count.
- Outcome: web build passed; browser QA passed with duplicate scan input deduped to 2 unique IMEIs, `POST /api/inventory/count` 201, payload `counted:2`, response `expected:2 counted:2 diff:0`, visible success toast, and screenshot `/tmp/alistore-warehouse-scanner-count.png`.
- Next step: remaining backlog is external/provider-gated: physical POS hardware certification and campaign delivery integrations.

## 2026-07-07

- Task: make Excel product import idempotent.
- Files changed: `apps/api/src/import/import.service.ts`, `apps/api/src/import/import.types.ts`, `apps/api/test/import.spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `PROGRESS.md`.
- Result: repeated imports of the same product workbook now skip unchanged rows and report `unchanged` instead of re-updating; changed SKUs still update and new SKUs still create, preserving natural-key idempotency by SKU.
- Checks run: targeted Jest for `import`; `npm run api:build`; `git diff --check`.
- Outcome: import tests passed 1 suite / 4 tests; API build passed; repeat workbook produced created 0 / updated 0 / unchanged 1 and kept one Product row.
- Next step: remaining BACKLOG items require external POS hardware/provider accounts; unblocked software polish is PDF/print/auth/social from handoff.

## 2026-07-07

- Task: add shift close photo report.
- Files changed: `apps/web/app/staff/page.tsx`, `apps/web/components/StaffSessionLogin.tsx`, `apps/api/test/evidence.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `PROGRESS.md`.
- Result: Staff app can attach Evidence Vault photos when opening and closing a cash shift; uploads are linked to the shift with `shift_open_photo` / `shift_close_photo` labels. Shared staff login now includes browser autocomplete hints.
- Checks run: targeted Jest for `evidence`; `npm run build -w @alistore/web`; browser QA on `/staff` open/close shift with image uploads; ledger verification query; `git diff --check`.
- Outcome: evidence tests passed 1 suite / 3 tests; web build passed; browser QA passed with `POST /api/shifts/open` 201, two `POST /api/evidence/images` 201 responses, `POST /api/shifts/:id/close` 201, no failed requests/4xx, and ledger `evidence.attached` labels `shift_open_photo` + `shift_close_photo`. Screenshot: `/tmp/alistore-shift-photo-report.png`.
- Next step: remaining unblocked software work is import idempotency/PDF polish; hardware certification and campaign delivery still need external devices/provider accounts.

## 2026-07-07

- Task: add debt reminder notifications.
- Files changed: `apps/api/src/debts/*`, `apps/api/src/audit/event-types.ts`, `apps/api/src/outbox/outbox.relay.ts`, `apps/api/src/reservations/reservations.scheduler.ts`, `apps/api/test/debts.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `PROGRESS.md`.
- Result: open debts due within three days or already overdue can now enqueue idempotent SMS reminders through the transactional outbox, with matching `debt.reminder_queued` ledger events; a pg-boss scheduler can run the sweep daily when `DEBT_REMINDERS_ENABLED=true`. Queue owners now lazy-load `pg-boss`, so disabled schedulers no longer break Jest module imports.
- Checks run: targeted Jest for `debts`, `debt-rbac`, and `reservation-expiry`; `npm run api:build`; `git diff --check`.
- Outcome: targeted Jest passed 3 suites / 11 tests; API build passed; due-soon and overdue reminders produce pending outbox rows and are idempotent on repeat sweep.
- Next step: add shift close photo report.

## 2026-07-07

- Task: build Refund Money Flow / Dispute Center staff UI.
- Files changed: `apps/web/app/approvals/page.tsx`, `apps/web/lib/api/payments.ts`, `apps/web/app/layout.tsx`, `apps/web/app/icon.svg`, `BACKLOG.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: Approval Inbox now has a staff refund request form that posts `paymentId`, amount, and reason to the existing approval-gated `POST /payments/:id/refund` endpoint; successful requests reset the form, switch to the requested queue, and show the refund approval row. The app also serves an SVG favicon so browser QA does not report the old `/favicon.ico` 404.
- Checks run: `npm run build -w @alistore/web`; targeted Jest for `refund-approval`; browser QA on `/approvals` refund request.
- Outcome: web build passed; refund approval Jest passed 1 suite / 4 tests; browser QA passed with `POST /api/payments/:id/refund` 202, visible `Возврат денег` row and 25 000 amount, no failed requests, no 4xx responses, and screenshot `/tmp/alistore-refund-request-ui.png`.
- Next step: add debt reminder notifications, then shift close photo report.

## 2026-07-07

- Task: ensure exchanges create visible warranty coverage for the new device.
- Files changed: `apps/api/test/exchange.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: exchange warranty behavior is now locked by regression coverage: after an exchange, the new sold IMEI appears in `customers.devices()` with warranty coverage derived from the new paid exchange order date.
- Checks run: targeted Jest for `exchange`; `npm run api:build`.
- Outcome: exchange-targeted tests passed 2 suites / 3 tests; API build passed.
- Next step: build Refund Money Flow / Dispute Center staff UI, then debt reminders and shift close photo report.
