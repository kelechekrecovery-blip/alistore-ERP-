# Phase 1: ERP and Storefront Contract Execution

Status: `in_progress`
Owner: main coordination lane
Repository: `/Users/alistore/Desktop/alistore-erp`

## Objective

Prove one server-authoritative contract from ERP change to customer storefront
visibility and checkout. A product, price, CMS publication, promotion, store
point, availability and delivery slot must have one API/Prisma representation
and one browser-verifiable customer outcome.

This phase is accepted only for routes with an available design reference. The
64 missing linked handoffs remain a separate owner blocker and must not be
replaced with invented screenshots or inferred visual acceptance.

## Scope

### ERP source of truth

- Product identity, SKU/IMEI tracking mode, tax class and media.
- Categories, variants, bundles and channel availability.
- Price revisions, approval state and effective dates.
- Stock availability by store/warehouse and reservation visibility.
- Store points, pickup windows and courier delivery slots.
- CMS drafts, ordered blocks, collections, promotions and publication state.
- Review moderation and customer-visible publication.

### Customer outcome

- Home and CMS blocks render only published content.
- Catalog/search use active products, current server price and sellable stock.
- Product detail shows variants, media, price, availability and fulfillment.
- Cart is revalidated against server price and stock before payment.
- Checkout quote is recomputed server-side after address, slot, promo and tender
  changes.
- An ERP update becomes visible after the documented publication/refresh path,
  without client-side price or status authority.

## Vertical slices

### Slice 1: catalog identity and media

1. Inspect existing Product, Variant, Bundle, Media, Category and stock APIs.
2. Verify create/edit/publish permissions for owner/admin/catalog roles.
3. Verify media references are stable and product images do not use placeholders.
4. Exercise ERP edit -> published catalog -> product detail.
5. Cover empty catalog, missing media, unpublished product and forbidden edit.

Acceptance:

- API returns only customer-visible published records.
- Product detail and catalog agree on SKU, variant and media identity.
- No client request can publish or expose an unpublished product.

### Slice 2: price and tax authority

1. Change a product or variant price through the ERP workflow.
2. Verify approval rules and effective timestamps where required.
3. Reopen catalog/product pages and assert the new server price.
4. Add the item to cart, then change the ERP price.
5. Submit checkout with a stale client price and assert server re-quote.
6. Verify tax class and money rounding in the quote.

Acceptance:

- The API ignores client-provided unit price, tax, discount and total.
- Checkout uses the current approved server price.
- Stale carts receive a deterministic revalidation response, not a silent
  charge at the old price.

### Slice 3: CMS publication contract

1. Create or edit a draft banner/block/collection.
2. Verify ordered blocks, scheduling and channel targeting.
3. Submit review, approve and publish using authorized roles.
4. Assert storefront visibility before and after publication.
5. Verify rollback/unpublish removes customer visibility without deleting audit.

Acceptance:

- Draft and review content never leaks to the public storefront.
- Ordering and publication state are API-backed and deterministic.
- Every publish/unpublish action has actor, timestamp and audit/event evidence.

### Slice 4: stock, store point and fulfillment quote

1. Configure active store points and warehouse availability.
2. Configure pickup windows and delivery zones/slots.
3. Assert catalog availability by fulfillment mode.
4. Add an item to cart and request pickup and courier quotes.
5. Change stock or slot capacity, then re-request checkout.
6. Verify unavailable stock/slot is rejected with a useful UI state.

Acceptance:

- Availability is server-authoritative and cannot be increased by the client.
- Slot capacity is checked atomically at order creation/reservation.
- Pickup/courier choices are reflected consistently in ERP, order and customer
  checkout.

### Slice 5: promotions, reviews and purchase completion

1. Create/activate a promotion in ERP with scope, dates and limits.
2. Moderate a review and verify the customer visibility state.
3. Request a server quote with a valid and invalid promotion.
4. Complete sandbox checkout and inspect order, payment intent and audit trail.
5. Repeat quote/submit with the same idempotency key.

Acceptance:

- Promotion eligibility and discount are calculated on the server.
- Invalid, expired or over-limit promotions fail without changing money or stock.
- Repeated checkout submission does not create a second order/payment.
- Order totals, tax, promotion and fulfillment snapshot remain immutable after
  creation.

## Contract checklist

For each slice, record the exact implementation in the traceability matrix:

| Concern | Required evidence |
| --- | --- |
| API | Controller, DTO, response and error contract |
| Data | Prisma model/migration and server-side invariants |
| Auth | JWT ownership, RBAC and forbidden-state test |
| Money/stock | Server calculation, transaction boundary and idempotency |
| Audit | Event Ledger or audit record for every critical mutation |
| Web | Route, loading/empty/error/permission/offline states |
| Visual | Exact available `.dc.html` screenshot evidence |
| E2E | ERP mutation through customer-visible outcome |

## Test plan

### API

- Product/CMS publication and permission tests.
- Price tampering and stale-cart revalidation tests.
- Tax rounding and promotion boundary tests.
- Stock/slot concurrency and idempotency tests.
- Review moderation visibility tests.
- Audit/Event Ledger invariant tests.

### Browser

```bash
npx playwright test e2e/admin-products.spec.ts e2e/storefront-cms-ui.spec.ts
npm run visual:e2e
```

Required browser viewports: `1440x900`, `1280x800`, `863x900`, `402x874` and
`360x800`. Assert no horizontal overflow and verify at least one error/empty/
permission state per route family.

### Regression

```bash
ALISTORE_TEST_DATABASE_CONFIRMED=1 npm run mvp:verify
npm run ecosystem:audit
```

Any source change after evidence recording requires the trusted evidence recorder
to be run again before the phase commit is accepted.

## Implementation order

1. Freeze the existing API contract and identify uncovered assertions.
2. Add the smallest missing server-side assertion for ERP price -> catalog ->
   checkout, if existing tests do not already prove it.
3. Add the matching Playwright journey and negative stale-price case.
4. Run API and targeted browser gates.
5. Run trusted visual/evidence recording against the committed source tree.
6. Update traceability, backlog and progress with exact counts and commit hash.
7. Commit the vertical slice.
8. Repeat for stock/fulfillment, CMS publication and promotions/reviews.

## Phase gate

Phase 1 is accepted only when all of the following are true:

- `mvp:verify` passes on the phase commit.
- ERP/CMS storefront Playwright journeys pass.
- Server price, tax, promotion, stock and slot authority have negative tests.
- Customer pages show published ERP state with no overflow at required viewports.
- Available handoffs have content-addressed visual evidence.
- Every accepted route is mapped to API, Prisma, RBAC, Ledger and E2E evidence.
- `git diff --check` passes and the worktree is clean.
- The strict ecosystem result explicitly reports only external/design-corpus
  blockers, never an unrecorded Phase 1 implementation gap.

## External blockers

- 64 linked `.dc.html` references are absent and require owner restore/retire/
  replace decisions documented in `docs/acceptance/DESIGN-CORPUS-BLOCKER.md`.
- Live payment, SMS, storage, monitoring and fiscal credentials are outside
  local Phase 1 software acceptance.
