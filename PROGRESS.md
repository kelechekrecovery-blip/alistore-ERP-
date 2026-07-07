# PROGRESS

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
