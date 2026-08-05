# Wave 2 baseline — money, inventory, and operational truth

## Scope

Payment-provider fail-closed behavior, payment-method availability, refund limits, order state transitions, inventory idempotency, reservation guards and ledger-backed operations.

## Passing gates

Using the isolated TypeScript Jest configuration (without the shared migration global setup):

```text
test/payment-provider-none.spec.ts
test/payment-methods-availability.spec.ts
test/refund-limit.spec.ts
test/order-state-machine.spec.ts
```

Result: **4 suites / 19 tests passed**.

The provider contract confirms that `PAYMENT_PROVIDER=none` exposes cash-on-delivery while online payment fails closed with `online_payments_unavailable`; unknown providers are rejected.

## Environment blocker

The full disposable-database Wave 2 command was attempted with inventory, reservation, payment and refund E2E suites. Prisma migration setup failed to acquire PostgreSQL advisory lock (`P1002`, localhost:5432) because another local test/worktree process held the migration lock. No application assertion failed. Rerun the full E2E set after all local Jest/Prisma workers are stopped.

## Wave 2 invariants to preserve

- Every inventory and payment mutation is idempotent and ledger/audit-backed.
- Guest capabilities remain entity-scoped and cannot be used as bearer customer tokens.
- Online payment providers fail closed; COD remains explicit and auditable.
- Refunds require approval/limits and cannot bypass provider state.
- AI remains read-only or approval-draft only for money, stock and status changes.

