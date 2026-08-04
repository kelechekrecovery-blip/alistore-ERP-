import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractWorkerRoutes,
  summarizeRouteCoverage,
} from '../cloudflare-route-coverage.mjs';

test('extracts only explicit API handlers from the Worker route table', () => {
  const source = `
    ['GET /api/health', health],
    ['POST /api/orders', orders],
    ['GET /internal', internal],
  `;
  assert.deepEqual(extractWorkerRoutes(source), [
    'GET /api/health',
    'POST /api/orders',
  ]);
});

test('partial route coverage can never satisfy the cutover gate', () => {
  const coverage = summarizeRouteCoverage([
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/catalog/products' },
  ], ['GET /api/health']);

  assert.equal(coverage.complete, false);
  assert.equal(coverage.covered, 1);
  assert.deepEqual(coverage.missing, ['GET /api/catalog/products']);
});

test('cutover requires exact coverage of the authoritative contract matrix', () => {
  const endpoints = [
    { method: 'GET', path: '/api/health' },
    { method: 'POST', path: '/api/orders' },
  ];
  const coverage = summarizeRouteCoverage(endpoints, [
    'GET /api/health',
    'POST /api/orders',
  ]);

  assert.deepEqual(coverage, {
    required: 2,
    migrated: 2,
    covered: 2,
    missing: [],
    unknown: [],
    complete: true,
  });
});
