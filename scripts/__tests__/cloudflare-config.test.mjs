import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertProvisioned,
  databaseIdFor,
  hasProductionRoute,
  readWranglerConfig,
} from '../cloudflare-config.mjs';

test('each remote environment is isolated by a distinct D1 binding', () => {
  const source = readWranglerConfig();
  const ids = ['staging', 'review', 'production'].map((environment) => (
    databaseIdFor(source, environment)
  ));
  assert.equal(new Set(ids).size, 3);
});

test('placeholder ids block remote mutations', () => {
  const provisioned = readWranglerConfig();
  const productionId = databaseIdFor(provisioned, 'production');
  const source = provisioned.replace(
    productionId,
    '00000000-0000-0000-0000-000000000003',
  );
  assert.throws(() => assertProvisioned(source, 'production'), /not provisioned/);
});

test('production route is detached until the explicit cutover', () => {
  assert.equal(hasProductionRoute(readWranglerConfig()), false);
});
