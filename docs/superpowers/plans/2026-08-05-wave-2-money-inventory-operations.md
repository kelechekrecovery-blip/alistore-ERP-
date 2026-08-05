# Wave 2 plan — money, inventory, and operational truth

## Objective

Make payment, inventory, fulfillment, returns, warranty and procurement workflows observable, idempotent and ledger-backed before enabling higher-risk AI automation.

## Order of work

1. Re-run the clean Wave 1 combined browser gate and close environment/process hygiene.
2. Inventory: verify reservation, release, bundle allocation and oversell invariants with API and E2E tests.
3. Money: verify payment intent idempotency, COD/pickup policy, refunds and settlement reconciliation against Event Ledger.
4. Operations: verify delivery slots, courier handoff, warranty/service timeline and audit events.
5. AI safety: expose only read-only recommendations and approval drafts; no autonomous money, stock or status mutations.
6. Production: attach provider certification evidence, deploy hooks, cache purge authority and rollback drills.

## Exit criteria

All money/inventory mutations have an idempotency key, audit/event record, RBAC boundary, deterministic retry behavior and passing disposable-database E2E coverage. External providers fail closed with an operator-visible recovery path.
