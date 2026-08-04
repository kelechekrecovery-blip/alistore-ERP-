# Supply-to-order implementation evidence — 2026-07-29

## Release decision

**SOFTWARE IMPLEMENTATION COMPLETE; PUBLIC RELEASE BLOCKED BY EXTERNAL
CERTIFICATION.** Phases A–J are implemented, but production deployment and store
release were not performed. All six release-sensitive supply flags remain
fail-closed:

- `TO_ORDER_CHECKOUT_ENABLED=false`;
- `SUPPLY_CANCELLATION_ENABLED=false`;
- `SUPPLY_AUTO_REFUND_ENABLED=false`;
- `SUPPLY_OWNER_RESOLUTION_ENABLED=false`;
- `SUPPLY_PARTIAL_HANDOVER_ENABLED=false`;
- `SUPPLY_QUARANTINE_CONVERSION_ENABLED=false`.

## Implemented and verified

- Forward-only PostgreSQL migrations add immutable order-line supply snapshots,
  `SupplierOffer`, receivables/payment allocations, supply allocations and
  customer-order links on purchase orders.
- Historical order lines are backfilled as `own_stock`; mutable product state is
  not used to reconstruct historical fulfilment.
- A `to_order` product requires a supplier, lead time and active 24-hour offer.
  Checkout blocks expired quotes, insufficient supplier quantity and expected
  margin below 10%.
- Mixed checkout calculates the 20% deposit only from discounted to-order lines
  and returns `paymentSchedule`, `initialDue` and `balanceDue`.
- Deposit settlement is idempotent, posts to customer-prepayment liability, and
  creates one draft PO per supplier. Duplicate callbacks do not create duplicate
  payments or POs.
- PO send, transit, serialized receipt, quality check, readiness and handover are
  represented at line level. A received to-order IMEI remains reserved for its
  customer and never becomes free inventory.
- Quantity-tracked to-order receipt increments only the linked customer supply
  allocation and PO item; it creates neither `InventoryBalance` nor `DeviceUnit`.
- Courier assignment rejects supply orders until every active line is ready and
  the supply deposit is settled.
- Customer cancellation preview returns the confirmed deposit and switches from
  automatic-full-refund policy to owner-resolution policy after `PO.sentAt`.
- `OrderCancellation` stores an immutable policy/amount snapshot, customer
  reason, idempotency hash and refund link. Concurrent replay creates exactly
  one cancellation and one refund aggregate.
- Before `PO.sentAt`, a pure supply order is cancelled atomically: draft PO and
  receivables are cancelled, supplier availability is restored, supply lines
  become `customer_cancelled`, and the full settled deposit is queued for refund.
- Customer-prepayment refunds are separated from merchandise returns by
  `RefundPurpose`. Their accounting debits customer-prepayment liability `2400`
  and credits the original tender account without reversing revenue `4000` or
  tax `2200`.
- Dedicated PostgreSQL deferred invariants validate prepayment-refund
  allocations, execution provenance, capacity, cancellation ownership and
  completion state while preserving the existing return-sale validator.
- Customer cancellation and automatic refund are independently fail-closed
  behind `SUPPLY_CANCELLATION_ENABLED=false` and
  `SUPPLY_AUTO_REFUND_ENABLED=false`.
- Web order detail exposes the refund preview and, only when the server confirms
  the feature is enabled, accepts a reason and submits an idempotent cancellation
  request. Otherwise it routes the customer to support.
- Public customer DTOs expose line progress and receivables while excluding
  supplier identity, purchase cost and internal actors.
- Web checkout/catalog/order detail consume the additive contract.
- iOS and Android wire models accept catalog orderability/ETA, order-line supply
  snapshots/progress and receivable schedules.
- No-show reminders are idempotent on days 1, 3, 7 and 13; day 14 creates one
  owner/admin task. Existing reservation expiry remains durable and idempotent.
- Owner/admin resolution after `PO.sentAt` requires TOTP, a reason and evidence
  for any deduction. Supplier/AliStore fault enforces a full refund.
- Partial pickup is line-scoped. Courier completion uses the same transactional
  handover path and cannot mark a mixed order delivered before all active lines
  are handed over.
- Serialized and quantity-tracked to-order receipts remain customer-scoped.
  `SupplyQuantityAllocation` records immutable quantity, unit cost and location;
  it never increases `InventoryBalance`. Handover consumes it exactly once and
  posts the line-linked valuation issue and COGS.
- Rejected supply units remain quarantined until an owner/admin TOTP command
  records return-to-supplier or audited conversion to own stock.
- ERP exposes the seven operational queues and customer notification templates
  use deterministic outbox/inbox deduplication with supplier/cost/evidence
  redaction.
- StorePoint is authoritative in checkout, POS, Staff, HR, Warehouse,
  Procurement and Inventory. Operational production fallbacks such as
  `BISHKEK-1` are removed; legacy identity is handled only through aliases.
- Client, Staff, POS and Courier native applications consume the additive
  receivable, line-timeline, owner-resolution, quarantine, partial-handover and
  courier-readiness contracts.
- The release gate refuses remote, production-named or query-overridden
  PostgreSQL targets and verifies that all six flags remain disabled.

## Validation evidence

- PostgreSQL: Prisma validate/generate passed; forward-only migrations through
  `20260729251000_supply_quantity_allocation_returns` were applied to local
  development and isolated test databases only. The isolated template contains
  all `145` migrations.
- Critical handover/courier/supply scenarios: `88/88` focused API tests passed,
  including concurrent quantity receipt, mixed COD accounting and replay.
- Full API regression: two independent isolated runs passed
  `247/247` suites and `1478/1478` tests each. The isolated runner was also
  hardened so concurrent starts cannot delete another run's database.
- Web: `24` test files, `128` tests passed; Next.js production build passed.
- iOS: all ten native targets built successfully for the simulator. Existing
  native unit suite passed `150/150`.
- Android: the full `test lintDebug` gate passed, and
  Client/Staff/POS/Courier debug assemblies passed with Java 17.
- Secrets: gitleaks scanned approximately 31.05 MB and found no leaks.
- Dependencies: OSV rescan found no known vulnerabilities after lockfile
  overrides, including the fixed `js-yaml 5.2.2`.
- Release-gate plan artifact:
  `supply-release-gate-2026-07-29T10-00-52-214Z.json`; the expected decision is
  `BLOCKED` because certification markers are deliberately unset.

Independent final code review returned `APPROVED` with no findings after the
return-compatibility, test-cleanup, isolated-runner and dependency-lock fixes.

## Remaining release blockers (not code-completeness claims)

The following require real external systems, credentials, hardware or an owner
release decision and must not be marked passed from local tests:

- production payment gateway and refund-webhook certification;
- SMTP and SMS provider certification;
- FCM and APNs delivery certification;
- S3/R2 object-storage certification;
- fiscal/OFD certification;
- production monitoring/alerting certification;
- POS cash/card/QR hardware certification;
- two isolated migrated Playwright DB passes and cross-browser E2E in the
  release environment;
- explicit owner authorization for production cutover and manual App
  Store/Google Play release.

Until these evidence items exist, all supply flags stay disabled and public
online deposit remains fail-closed.
