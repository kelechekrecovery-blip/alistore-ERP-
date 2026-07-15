# Architectural Analysis Report
**Date**: 2026-07-15
**Files Analyzed**: 475 TypeScript/TSX source files plus Prisma schema and finance handoffs
**Dead Code Files**: 0 high-confidence findings
**Duplication Groups**: 3 accounting-truth groups

---

## Executive Summary
- **Dead Code**: None proven by the accounting-focused audit
- **Duplicated Functionality**: 3 groups where financial truth is recomputed independently
- **Architectural Anti-Patterns**: 8 accounting-control gaps
- **Type Issues**: 0 explicit `any`, `as any`, `@ts-ignore` or `@ts-expect-error` usages in tracked API/web sources
- **Code Smells**: 6 large domain services above 500 lines

**Primary risk**: `AuditEvent` is an append-only operational audit trail, not a balanced accounting journal. The system can prove that an action happened, but cannot yet prove where value came from, where it went, or that every financial event balances.

---

## Dead Code

### Completely Dead Files (DELETE)
None found with high confidence in the accounting contour.

### Dead Exports (REMOVE)
None proven. Framework-discovered NestJS controllers/modules and Next.js route files were treated as live entry points.

### Possibly Dead (VERIFY)
None recorded. A repository-wide export graph remains a separate cleanup concern and is not evidence of accounting correctness.

### Internal Dead Code
None found by the current compiler/static searches.

---

## Duplicated Functionality

### HIGH: Financial totals recomputed from mutable operational tables

**Instances**:
- `apps/api/src/reports/reports.service.ts` derives revenue, refunds, expenses and profit directly from `Payment`, `Expense`, `DeviceUnit` and `Product`.
- `apps/api/src/finance/finance.service.ts` separately derives plan/fact and reconciliation totals.
- POS, HR payroll, courier COD and campaign economics each retain their own financial aggregates.

**Risk**: independent filters and status rules can disagree. For example dashboard payment-method totals do not use the same received/reconciled status filter as gross sales.

**Recommendation**: introduce one balanced accounting journal and derive trial balance, cash, receivables, payables, revenue, COGS and expenses from posted lines.

### HIGH: Cost-of-goods logic

**Instances**:
- `OrderItem.unitCost` stores a transaction-time snapshot.
- `reports.service.ts` computes serialized COGS from the current `Product.cost` through sold `DeviceUnit` rows.
- Procurement stores `PurchaseOrderItem.unitCost`, but received `DeviceUnit` rows do not retain acquisition cost or receipt lineage.

**Risk**: editing a product cost changes historical margin; quantity stock has no auditable valuation layer.

**Recommendation**: post COGS from immutable order/lot cost snapshots and add receipt valuation lineage.

### MEDIUM: Ledger terminology

`AuditEvent`, `Payment`, loyalty entries, campaign spend entries and settlement lines are all called ledgers in documentation, but they enforce different invariants. Only a journal with balanced debit/credit lines should be the accounting ledger.

---

## Architectural Anti-Patterns

### 1. No chart of accounts or double-entry journal (CRITICAL)
The Prisma schema has no account, journal entry or journal line models. `AuditEvent` stores arbitrary JSON without debit/credit balance, currency, account or posting-period invariants.

### 2. Expense payment has no funding source (CRITICAL)
`FinanceService.pay()` changes `Expense.status` to `paid` but records no cash/bank account, cash shift, payment method, financial document or balanced value movement.

### 3. Procurement creates inventory without supplier payable (CRITICAL)
Receiving a purchase order creates stock and units, but no supplier invoice, accounts payable, payment schedule, tax/currency basis or liability posting.

### 4. Historical COGS is mutable (HIGH)
KPI COGS uses current product cost for serialized stock instead of the immutable `OrderItem.unitCost`/receipt cost. Quantity and bundle cost coverage is incomplete.

### 5. No period close or posting lock (HIGH)
There is no accounting period model, close/reopen approval, or prevention of back-dated mutations after reporting close.

### 6. No bank/cash account register (HIGH)
Cash shifts exist, but there are no cash accounts, bank accounts, cash receipt/disbursement orders, deposits/collections or inter-branch money transfers required by the Finance 2.0 handoff.

### 7. Currency and tax/fiscal basis are absent (HIGH)
Purchase costs and payments are integer KGS amounts. The required USD procurement rate, revaluation, tax liability and fiscal receipt reconciliation are not represented as accounting data.

### 8. Append-only enforcement is application-only (MEDIUM)
`AuditService` only creates events, but the database does not prevent direct update/delete of `AuditEvent`. Production roles and/or database triggers must enforce immutability.

---

## Type Issues

### `any` Usage
None found in tracked API/web source with the explicit `: any` or `as any` patterns.

### Type Assertions
No unsafe double-cast cluster was found in the accounting contour. Prisma JSON payload casts remain structurally weak for audit semantics and should not replace typed journal lines.

### @ts-ignore Comments
None found in tracked API/web source.

---

## Code Smells

### Long domain services (>500 lines)

| File | Lines | Concern |
|------|------:|---------|
| `apps/api/src/orders/orders.service.ts` | 940 | Order, stock, loyalty and attribution coupling |
| `apps/api/src/inventory/inventory.service.ts` | 686 | Multiple stock modes and adjustments |
| `apps/api/src/returns/returns.service.ts` | 648 | Refund, inventory and consignment compensation |
| `apps/api/src/campaigns/campaigns.service.ts` | 622 | Lifecycle and economics |
| `apps/api/src/service-center/service-center.service.ts` | 615 | Repair lifecycle and payments |
| `apps/api/src/finance/finance.service.ts` | 602 | Expenses, budgets and settlement in one service |

These services are not automatically wrong, but financial posting duplicated inside them would become fragile. A small shared accounting posting boundary is required.

### Magic status filters
Revenue and reconciliation depend on repeated literal status arrays. Accounting recognition policy should be centralized and tested as posting rules.

---

## Statistics

**Source scope**:
- Files: 475 tracked API/web TypeScript/TSX files
- Lines: 48,665
- Explicit unsafe type suppressions: 0

**Accounting issues**:
- Critical: 3
- High: 4
- Medium: 2
- Duplicated truth groups: 3

---

## Impact Assessment

### Immediate implementation order
1. Balanced chart-of-accounts and journal foundation, with idempotent source binding and trial balance.
2. Expense payment posting with an explicit funding account.
3. Sales/payment/refund and historical COGS postings.
4. Purchase receipt, supplier invoice/payable and supplier payment.
5. Cash orders, collection, bank accounts and inter-branch transfers.
6. Payroll payable/payment, COD, debts, gift cards, loyalty liabilities and consignment payables.
7. Currency, tax/fiscal, period close and immutable database enforcement.

### Acceptance invariant
For every posted journal entry: total debit equals total credit, amounts are positive integer minor units, the source is uniquely idempotent, lines cannot be edited, reversals are compensating entries, and the operational mutation plus journal plus Event Ledger commit atomically.
