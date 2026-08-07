import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const manifest = (...rows) => ({
  schemaVersion: 1,
  apiEffects: {
    'POST /api/orders': { effect: 'critical-mutation', ledger: ['order.created'] },
  },
  rows,
});
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

test('connected Android UI evidence uses the fixed trusted SDK root', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['android:ui'], 'node scripts/run-trusted-android-ui.mjs');
  const runner = fs.readFileSync(
    path.join(projectRoot, 'scripts', 'run-trusted-android-ui.mjs'),
    'utf8',
  );
  assert.match(runner, /export const TRUSTED_ANDROID_SDK_ROOT = '\/Users\/alistore\/Library\/Android\/sdk';/u);
  assert.match(runner, /deny file-read\*/u);
  assert.match(runner, /deny file-write\*/u);
  assert.match(runner, /'--no-configuration-cache'/u);
  for (const module of ['core', 'app', 'staff', 'courier', 'pos']) {
    assert.match(runner, new RegExp(`:${module}:connectedDebugAndroidTest`, 'u'));
  }
  for (const sourcePath of [
    'scripts/record-ecosystem-evidence.mjs',
    'scripts/ecosystem-contract-audit.mjs',
  ]) {
    const source = fs.readFileSync(path.join(projectRoot, sourcePath), 'utf8');
    assert.match(
      source,
      /const trustedAndroidSdkRoot = '\/Users\/alistore\/Library\/Android\/sdk';/u,
      sourcePath,
    );
    assert.doesNotMatch(source, /process\.env\.ANDROID_HOME/u, sourcePath);
  }
  const audit = fs.readFileSync(
    path.join(projectRoot, 'scripts', 'ecosystem-contract-audit.mjs'),
    'utf8',
  );
  assert.match(audit, /const androidUiRunner = read\('scripts\/run-trusted-android-ui\.mjs'\);/u);
  assert.match(
    audit,
    /acceptedGate\('android-app-ui', \/\^node scripts\\\/run-trusted-android-ui\\\.mjs\$\/u\)/u,
  );
});

test('rejects duplicate IDs', () => {
  assert.ok(errorCodes(manifest(row(), row({ surface: 'web:/orders/[id]' }))).includes('duplicate-id'));
});

test('rejects duplicate known surfaces even when row IDs are unique', () => {
  const codes = errorCodes(manifest(row(), row({ id: 'second-home-owner' })));
  assert.ok(codes.includes('duplicate-surface'));
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

test('requires each classified mutation route to declare its own Ledger event', () => {
  const mutation = row({
    surface: 'web:/orders/[id]',
    api: ['POST /api/orders'],
    models: ['Order'],
    ledger: [],
  });
  assert.ok(errorCodes(manifest(row(), mutation)).includes('missing-route-ledger'));
});

test('does not classify every POST as a mutation', () => {
  const candidateInventory = {
    ...inventory,
    webSurfaces: ['web:/'],
    iosSurfaces: [],
    androidSurfaces: [],
    apiRoutes: [...inventory.apiRoutes, 'POST /api/ai/assess'],
    models: [...inventory.models, 'Setting'],
  };
  const candidate = manifest(row({
    api: ['POST /api/ai/assess'],
    models: ['Product', 'Setting'],
    ledger: [],
  }));
  candidate.apiEffects = {
    'POST /api/ai/assess': { effect: 'read-only', ledger: [] },
  };
  assert.equal(validateManifest(candidate, candidateInventory).valid, true);
});

test('requires reviewed effect classification for every declared non-GET route', () => {
  const candidate = manifest(row({ api: ['POST /api/orders'], ledger: ['order.created'] }));
  candidate.apiEffects = {};
  assert.ok(errorCodes(candidate).includes('unclassified-api-effect'));
});

test('does not let one unrelated row-level event satisfy a different mutation route', () => {
  const candidateInventory = {
    ...inventory,
    apiRoutes: [...inventory.apiRoutes, 'PATCH /api/orders/:id'],
    events: [...inventory.events, 'order.updated'],
  };
  const candidate = manifest(row({
    surface: 'web:/orders/[id]',
    api: ['POST /api/orders', 'PATCH /api/orders/:id'],
    models: ['Order'],
    ledger: ['order.created'],
  }));
  candidate.apiEffects['PATCH /api/orders/:id'] = {
    effect: 'critical-mutation',
    ledger: ['order.updated'],
  };
  const codes = errorCodes(candidate, candidateInventory);
  assert.ok(codes.includes('missing-route-ledger'));
});

test('allows an explicitly reviewed non-critical mutation without Ledger', () => {
  const candidateInventory = {
    ...inventory,
    webSurfaces: ['web:/'],
    iosSurfaces: [],
    androidSurfaces: [],
    apiRoutes: [...inventory.apiRoutes, 'POST /api/customers'],
  };
  const candidate = manifest(row({
    api: ['POST /api/customers'],
    models: ['Product'],
    ledger: [],
  }));
  candidate.apiEffects = {
    'POST /api/customers': { effect: 'mutation', ledger: [] },
  };
  assert.equal(validateManifest(candidate, candidateInventory).valid, true);
});

test('requires a critical mutation without Ledger to be an exact blocked gap', () => {
  const gap = 'Missing canonical security Ledger event for social authentication.';
  const candidateInventory = {
    ...inventory,
    webSurfaces: ['web:/'],
    iosSurfaces: [],
    androidSurfaces: [],
    apiRoutes: [...inventory.apiRoutes, 'POST /api/auth/v2/social/telegram'],
  };
  const candidate = manifest(row({
    api: ['POST /api/auth/v2/social/telegram'],
    ledger: [],
    status: 'blocked',
    blockers: [gap],
  }));
  candidate.apiEffects = {
    'POST /api/auth/v2/social/telegram': {
      effect: 'critical-mutation',
      ledger: [],
      gap,
    },
  };
  assert.equal(validateManifest(candidate, candidateInventory).valid, true);
  candidate.rows[0].blockers = ['Different blocker'];
  assert.ok(errorCodes(candidate, candidateInventory).includes('unrepresented-critical-gap'));
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

test('load-bearing assessment and Telegram rows describe their implemented surfaces', () => {
  const source = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'docs/acceptance/ecosystem-surface-matrix.json'),
    'utf8',
  ));
  const assessment = source.rows.find(({ id }) => id === 'business-assessment');
  assert.deepEqual(assessment.api, ['GET /api/catalog/products', 'POST /api/ai/assess']);
  assert.deepEqual(assessment.models, ['Product', 'Setting']);
  assert.deepEqual(assessment.ledger, []);
  assert.equal(assessment.owner, 'Trade-in Operations');
  assert.equal(assessment.status, 'partial');
  assert.ok(assessment.blockers.some((value) => value.includes('visual evidence')));
  assert.ok(!assessment.blockers.some((value) => value.includes('provider')));

  const telegram = source.rows.find(({ id }) => id === 'telegram-handoff');
  assert.deepEqual(telegram.api, [
    'GET /api/auth/me',
    'GET /api/catalog/products',
    'GET /api/logistics/checkout-options',
    'POST /api/auth/v2/social/telegram',
    'POST /api/customers',
    'POST /api/orders',
    'POST /api/orders/mine',
    'POST /api/payments/intents',
    'POST /api/payments/intents/mine',
  ]);
  assert.deepEqual(telegram.models, [
    'Customer', 'CustomerIdentity', 'OnlinePaymentIntentCommand', 'Order', 'Payment', 'Product',
    'RefreshToken', 'SocialEnrollment', 'StorePoint',
  ]);
  assert.deepEqual(telegram.ledger, ['order.created', 'order.reserved']);
  assert.equal(telegram.contour, 'storefront');
  assert.equal(telegram.owner, 'Commerce');
  assert.equal(telegram.status, 'blocked');
  assert.ok(telegram.blockers.some((value) => value.includes('social authentication')));
  assert.ok(telegram.blockers.some((value) => value.includes('Telegram production shell')));
  assert.ok(!telegram.api.some((value) => value.includes('telegram-agent')));
  assert.ok(!telegram.models.includes('TelegramAgentPairing'));
  assert.ok(!telegram.ledger.includes('telegram_agent.linked'));
});

test('high-risk route effects exactly match their controller/service lifecycle', () => {
  const source = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'docs/acceptance/ecosystem-surface-matrix.json'),
    'utf8',
  ));
  assert.deepEqual(source.apiEffects['PATCH /api/approvals/:id/decide'], {
    effect: 'critical-mutation',
    ledger: ['approval.approved', 'approval.rejected'],
  });
  assert.deepEqual(source.apiEffects['POST /api/exchanges'], {
    effect: 'critical-mutation',
    ledger: ['approval.requested'],
  });
  assert.deepEqual(source.apiEffects['POST /api/refunds/:id/retry'], {
    effect: 'critical-mutation',
    ledger: [
      'payment.refunded', 'refund.provider_pending', 'refund.provider_succeeded',
      'refund.failed', 'refund.succeeded',
    ],
  });
  assert.deepEqual(source.apiEffects['POST /api/tradeins'], {
    effect: 'critical-mutation',
    ledger: ['tradein.assessed', 'tradein.contracted'],
  });
  assert.deepEqual(source.apiEffects['POST /api/customers'], {
    effect: 'mutation',
    ledger: [],
  });
  assert.deepEqual(source.apiEffects['POST /api/auth/v2/social/telegram'], {
    effect: 'critical-mutation',
    ledger: [],
    gap: 'No canonical Event Ledger event records Telegram social authentication or enrollment reservation.',
  });
});

test('executive traceability validation rejects prose and unknown manifest IDs', () => {
  const executiveTraceabilitySource = [
    '| Handoff | Routes / apps | Evidence | Gate | Status |',
    '|---|---|---|---|---|',
    '| Bad ([all reviewed IDs](acceptance/ecosystem-surface-matrix.json)) | x | x | x | x |',
    '| Unknown ([missing-id](acceptance/ecosystem-surface-matrix.json)) | x | x | x | x |',
    '| Missing | x | x | x | x |',
  ].join('\n');
  const codes = errorCodes(manifest(row()), { ...inventory, executiveTraceabilitySource });
  assert.ok(codes.includes('unknown-executive-manifest-id'));
  assert.ok(codes.includes('missing-executive-manifest-id'));
});

test('every executive traceability row has validated manifest IDs or explicit N/A', () => {
  const source = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'docs/acceptance/ecosystem-surface-matrix.json'),
    'utf8',
  ));
  const report = validateManifest(source, collectInventory(projectRoot));
  assert.equal(report.executiveTraceability.rows, 23);
  assert.equal(report.executiveTraceability.errors.length, 0);
});

test('executive status claims never outrun linked manifest statuses', () => {
  const source = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'docs/acceptance/ecosystem-surface-matrix.json'),
    'utf8',
  ));
  const statuses = new Map(source.rows.map(({ id, status }) => [id, status]));
  const executive = fs.readFileSync(
    path.join(projectRoot, 'docs/ECOSYSTEM-TRACEABILITY-MATRIX.md'),
    'utf8',
  );
  const conflicts = [];
  assert.equal(
    executive.includes('zero `accepted` rows'),
    source.rows.every(({ status }) => status !== 'accepted'),
  );

  for (const line of executive.split(/\r?\n/u).filter((candidate) => /^\| (?!Handoff|---)/u.test(candidate))) {
    const cells = line.split('|').map((value) => value.trim());
    const handoff = cells[1] ?? '';
    const executiveStatus = cells[5] ?? '';
    const ids = [...handoff.matchAll(/\[([^\]]+)\]\(acceptance\/ecosystem-surface-matrix\.json\)/gu)]
      .flatMap((match) => match[1].split(',').map((value) => value.trim()).filter(Boolean));
    const linkedStatuses = ids.map((id) => statuses.get(id));
    if (/\baccepted\b/iu.test(executiveStatus) && linkedStatuses.some((status) => status !== 'accepted')) {
      conflicts.push(`${handoff}: accepted claim exceeds linked manifest status`);
    }
    if (linkedStatuses.includes('blocked') && !/\bblocked\b/iu.test(executiveStatus)) {
      conflicts.push(`${handoff}: blocked linked row is not disclosed`);
    }
  }

  assert.deepEqual(conflicts, []);
});
