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
