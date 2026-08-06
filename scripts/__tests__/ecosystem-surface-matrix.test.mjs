import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_CONTOURS,
  ALLOWED_STATUSES,
  collectInventory,
  validateManifest,
} from '../ecosystem-surface-matrix.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const inventory = {
  webSurfaces: ['web:/', 'web:/orders/[id]'],
  iosSurfaces: ['ios:AliStoreClient'],
  androidSurfaces: ['android:app'],
  apiRoutes: ['GET /api/catalog/products', 'POST /api/orders'],
  models: ['Order', 'Product'],
  events: ['order.created'],
  packageCommands: ['web:route-audit'],
  files: ['apps/api/src/authz/authz.model.ts'],
};

const row = (overrides = {}) => ({
  id: 'storefront-home',
  contour: 'storefront',
  owner: 'Commerce',
  surface: 'web:/',
  api: ['GET /api/catalog/products'],
  models: ['Product'],
  rbac: ['apps/api/src/authz/authz.model.ts'],
  ledger: [],
  acceptance: ['web:route-audit'],
  status: 'partial',
  blockers: [],
  ...overrides,
});

const manifest = (...rows) => ({ schemaVersion: 1, rows });
const errorCodes = (candidate, candidateInventory = inventory) =>
  validateManifest(candidate, candidateInventory).errors.map(({ code }) => code);

test('exports the exact contour and status allowlists', () => {
  assert.deepEqual([...ALLOWED_CONTOURS], [
    'storefront', 'client', 'erp', 'staff', 'warehouse', 'pos', 'courier',
    'service', 'business', 'platform',
  ]);
  assert.deepEqual([...ALLOWED_STATUSES], [
    'accepted', 'partial', 'placeholder', 'external', 'blocked',
  ]);
});

test('rejects duplicate IDs', () => {
  assert.ok(errorCodes(manifest(row(), row({ surface: 'web:/orders/[id]' }))).includes('duplicate-id'));
});

test('rejects invalid contour and status values', () => {
  const codes = errorCodes(manifest(row({ contour: 'mobile', status: 'ready' })));
  assert.ok(codes.includes('invalid-contour'));
  assert.ok(codes.includes('invalid-status'));
});

test('rejects an empty owner', () => {
  assert.ok(errorCodes(manifest(row({ owner: '  ' }))).includes('empty-owner'));
});

test('requires a blocker for external and blocked rows', () => {
  for (const status of ['external', 'blocked']) {
    assert.ok(errorCodes(manifest(row({ status, blockers: [] }))).includes('missing-blocker'));
  }
});

test('requires acceptance commands for accepted rows', () => {
  assert.ok(errorCodes(manifest(row({ status: 'accepted', acceptance: [] }))).includes('missing-acceptance'));
});

test('rejects unknown API routes, models, events, and package commands', () => {
  const codes = errorCodes(manifest(row({
    api: ['GET /api/not-real'],
    models: ['ImaginaryModel'],
    ledger: ['imaginary.event'],
    acceptance: ['not:a:script'],
  })));
  assert.ok(codes.includes('unknown-api-route'));
  assert.ok(codes.includes('unknown-model'));
  assert.ok(codes.includes('unknown-ledger-event'));
  assert.ok(codes.includes('unknown-package-command'));
});

test('rejects copied RBAC role lists instead of source references', () => {
  assert.ok(errorCodes(manifest(row({ rbac: ['OWNER', 'ADMIN'] }))).includes('unknown-rbac-reference'));
});

test('reports orphaned web and native surfaces with exact-set coverage', () => {
  const codes = errorCodes(manifest(row()));
  assert.ok(codes.includes('orphaned-web-surface'));
  assert.ok(codes.includes('orphaned-ios-surface'));
  assert.ok(codes.includes('orphaned-android-surface'));
});

test('rejects unknown manifest surfaces', () => {
  assert.ok(errorCodes(manifest(row({ surface: 'web:/not-real' }))).includes('unknown-surface'));
});

test('requires a declared Ledger event for a row referencing a critical mutation', () => {
  const mutation = row({
    surface: 'web:/orders/[id]',
    api: ['POST /api/orders'],
    models: ['Order'],
    ledger: [],
  });
  assert.ok(errorCodes(manifest(row(), mutation)).includes('critical-mutation-without-ledger'));
});

test('accepts a complete, source-referenced manifest', () => {
  const rows = [
    row(),
    row({
      id: 'order-detail',
      contour: 'client',
      surface: 'web:/orders/[id]',
      api: ['POST /api/orders'],
      models: ['Order'],
      ledger: ['order.created'],
    }),
    row({ id: 'ios-client', contour: 'client', surface: 'ios:AliStoreClient' }),
    row({ id: 'android-client', contour: 'client', surface: 'android:app' }),
  ];
  const report = validateManifest(manifest(...rows), inventory);
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.coverage.web, { required: 2, covered: 2, missing: [], unknown: [] });
  assert.equal(report.coverage.total.required, 4);
  assert.equal(report.coverage.total.covered, 4);
});

test('inventories controller contracts and every packaged application surface', () => {
  const actual = collectInventory(projectRoot);
  assert.equal(actual.webSurfaces.length, 43);
  assert.deepEqual(actual.iosSurfaces, [
    'ios:AliStoreClient', 'ios:AliStoreCourier', 'ios:AliStorePOS', 'ios:AliStoreStaff',
  ]);
  assert.deepEqual(actual.androidSurfaces, [
    'android:app', 'android:courier', 'android:pos', 'android:staff',
  ]);
  assert.ok(actual.apiRoutes.includes('POST /api/orders'));
  assert.ok(actual.models.includes('AuditEvent'));
  assert.ok(actual.events.includes('order.created'));
  assert.ok(actual.packageCommands.includes('ecosystem:matrix:strict'));
});
