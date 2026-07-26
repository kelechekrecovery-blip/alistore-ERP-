import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertWritableTarget,
  explainNoWork,
  idempotencyKeyFor,
  planStockTopUps,
  summarizeStorefront,
} from '../seed-review-data.mjs';

const quantityProduct = (over) => ({
  id: 'p1',
  name: 'iPhone 17',
  trackingMode: 'quantity',
  availableUnits: 0,
  ...over,
});

test('plans a top-up only for products below the target', () => {
  const plan = planStockTopUps(
    [
      quantityProduct({ id: 'low', availableUnits: 0 }),
      quantityProduct({ id: 'enough', availableUnits: 5 }),
      quantityProduct({ id: 'exact', availableUnits: 3 }),
    ],
    { target: 3 },
  );
  assert.deepEqual(plan.map((item) => item.productId), ['low']);
  assert.equal(plan[0].quantity, 3);
});

test('tops up only the shortfall, not the whole target', () => {
  const plan = planStockTopUps([quantityProduct({ availableUnits: 1 })], { target: 4 });
  assert.equal(plan[0].quantity, 3);
});

test('serialized products are skipped with a reason, not silently dropped', () => {
  // receive-quantity rejects serialized products — they need real IMEI units,
  // which a seeding script must never invent.
  const plan = planStockTopUps(
    [quantityProduct({ id: 's1', trackingMode: 'serialized', availableUnits: 0 })],
    { target: 3 },
  );
  assert.deepEqual(plan, []);
  const skipped = planStockTopUps(
    [quantityProduct({ id: 's1', trackingMode: 'serialized', availableUnits: 0 })],
    { target: 3, collectSkipped: true },
  );
  assert.equal(skipped.skipped.length, 1);
  assert.match(skipped.skipped[0].reason, /serialized/iu);
});

test('idempotency keys are deterministic per product and target', () => {
  assert.equal(idempotencyKeyFor('abc', 3), idempotencyKeyFor('abc', 3));
  assert.notEqual(idempotencyKeyFor('abc', 3), idempotencyKeyFor('abc', 4));
  assert.notEqual(idempotencyKeyFor('abc', 3), idempotencyKeyFor('abd', 3));
  assert.match(idempotencyKeyFor('abc', 3), /^review-seed:/u);
});

test('a re-run plans nothing once the target is met', () => {
  const after = [quantityProduct({ id: 'low', availableUnits: 3 })];
  assert.deepEqual(planStockTopUps(after, { target: 3 }), []);
});

test('writing to a non-local API needs explicit confirmation', () => {
  assert.throws(
    () => assertWritableTarget({ apiBase: 'https://api.ali.kg/api', confirmed: false }),
    /production/iu,
  );
  assert.doesNotThrow(() => assertWritableTarget({ apiBase: 'https://api.ali.kg/api', confirmed: true }));
  assert.doesNotThrow(() => assertWritableTarget({ apiBase: 'http://127.0.0.1:4000/api', confirmed: false }));
  assert.doesNotThrow(() => assertWritableTarget({ apiBase: 'http://localhost:4000/api', confirmed: false }));
});

test('“nothing to do” distinguishes a small catalog from unseedable products', () => {
  // A re-run against a fully stocked but tiny catalog used to blame "skipped
  // products" that did not exist, sending the reader hunting for nothing.
  const tinyButStocked = explainNoWork({
    summary: { total: 1, buyable: 1, reviewable: false },
    skipped: [],
  });
  assert.equal(tinyButStocked.ok, false);
  assert.match(tinyButStocked.message, /catalog only has 1 product/iu);
  assert.doesNotMatch(tinyButStocked.message, /see above/iu);

  const unseedable = explainNoWork({
    summary: { total: 4, buyable: 0, reviewable: false },
    skipped: [{ productId: 's', reason: 'serialized' }],
  });
  assert.match(unseedable.message, /cannot be topped up/iu);

  const done = explainNoWork({ summary: { total: 5, buyable: 5, reviewable: true }, skipped: [] });
  assert.equal(done.ok, true);
});

test('the storefront summary reports what a reviewer would actually see', () => {
  const summary = summarizeStorefront([
    quantityProduct({ id: 'a', availableUnits: 4 }),
    quantityProduct({ id: 'b', availableUnits: 0 }),
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.buyable, 1);
  assert.equal(summary.reviewable, false);

  const good = summarizeStorefront([
    quantityProduct({ id: 'a', availableUnits: 4 }),
    quantityProduct({ id: 'b', availableUnits: 2 }),
    quantityProduct({ id: 'c', availableUnits: 1 }),
  ]);
  assert.equal(good.buyable, 3);
  assert.equal(good.reviewable, true);
});
