# Wave 2 baseline — money, inventory, and operational truth

## Scope

Payment-provider fail-closed behavior, payment-method availability, refund limits, order state transitions, inventory idempotency, reservation guards and ledger-backed operations.

## Passing gates

Focused disposable-database Jest gate:

```text
test/payment-provider-none.spec.ts
test/payment-methods-availability.spec.ts
test/refund-limit.spec.ts
test/order-state-machine.spec.ts
```

Result: **9 suites / 51 tests passed**.

Extended fulfillment/valuation gate: **8 suites / 49 tests passed**, covering quantity inventory, valuation reconciliation/roll-forward, orders and store-point fulfillment, guest order access, and refund aggregation/provider-stale recovery.

Read-only AI reorder report coverage: **2 suites / 7 tests passed** with mocked product/device-unit facts; the service performs no write operation and sorts urgent recommendations first.

Owner Copilot read-only tool contract: **3 suites / 13 tests passed** for insights composition, tool budgets and deterministic insight output. The tools expose KPI/risk/pricing/reorder signals without mutation tools.

The provider contract confirms that `PAYMENT_PROVIDER=none` exposes cash-on-delivery while online payment fails closed with `online_payments_unavailable`; unknown providers are rejected.

The first attempt was blocked by a transient PostgreSQL advisory lock (`P1002`) from another local worker. After the worker exited, the same command completed successfully; no application assertion failed.

## Wave 2 invariants to preserve

- Every inventory and payment mutation is idempotent and ledger/audit-backed.
- Guest capabilities remain entity-scoped and cannot be used as bearer customer tokens.
- Online payment providers fail closed; COD remains explicit and auditable.
- Refunds require approval/limits and cannot bypass provider state.
- AI remains read-only or approval-draft only for money, stock and status changes.
