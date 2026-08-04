import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cutoverApiBase,
  expectedApiBase,
  findApiBaseMismatches,
  legacyApiBase,
  requiredApiBaseFiles,
} from '../validate-canonical-api-base.mjs';

const wrangler = (productionBlock) => `
[env.staging]
name = "staging"
[env.production]
name = "production"
${productionBlock}
`;

test('detached production route keeps clients on the live legacy API host', () => {
  assert.equal(expectedApiBase(wrangler('')), legacyApiBase);
});

test('attached production route requires the cutover API base', () => {
  assert.equal(
    expectedApiBase(wrangler('routes = [{ pattern = "ali.kg/api/*", zone_name = "ali.kg" }]')),
    cutoverApiBase,
  );
});

test('every active production client file must match the current route phase', () => {
  const sourceByFile = new Map(requiredApiBaseFiles.map((file) => [file, legacyApiBase]));
  sourceByFile.set(requiredApiBaseFiles[0], cutoverApiBase);

  const result = findApiBaseMismatches(
    wrangler(''),
    (relative) => sourceByFile.get(relative),
  );
  assert.equal(result.expected, legacyApiBase);
  assert.deepEqual(result.failures, [requiredApiBaseFiles[0]]);
});
