import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCatalogReady,
  assertCustomerPrincipal,
  assertReadinessValue,
  assertReviewCredentials,
  assertReviewNotesMatch,
  assertStaffPrincipal,
  normalizeReviewNotes,
  parseMarketingVersion,
  reviewDetailEndpoint,
  reviewVersionEndpoint,
  safeHttpError,
  selectReviewVersion,
  verifyLiveReadiness,
} from '../verify-ios-review-readiness.mjs';

test('customer principal must match the explicitly configured review account', () => {
  assert.doesNotThrow(() => assertCustomerPrincipal(
    { typ: 'customer', customerId: 'customer-review' },
    'customer-review',
  ));
  assert.throws(
    () => assertCustomerPrincipal(
      { typ: 'customer', customerId: 'another-customer' },
      'customer-review',
    ),
    /does not match/iu,
  );
});

const credentialsByApp = {
  client: { username: 'client-review', password: 'client-secret' },
  staff: { username: 'staff-review', password: 'staff-secret' },
  courier: { username: 'courier-review', password: 'courier-secret' },
  pos: { username: 'pos-review', password: 'pos-secret' },
};

test('reads the marketing version and selects the matching active ASC version', () => {
  assert.equal(parseMarketingVersion('settings:\n  MARKETING_VERSION: 1.0.0\n'), '1.0.0');
  assert.throws(() => parseMarketingVersion('CURRENT_PROJECT_VERSION: 5'), /MARKETING_VERSION/u);

  const selected = selectReviewVersion(
    [
      { id: 'old', attributes: { versionString: '1.0.0', appStoreState: 'READY_FOR_SALE' } },
      { id: 'review', attributes: { versionString: '1.0.0', appStoreState: 'REJECTED' } },
      { id: 'other', attributes: { versionString: '2.0.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } },
    ],
    '1.0.0',
  );
  assert.equal(selected.id, 'review');
  assert.throws(() => selectReviewVersion([], '1.0.0'), /no matching/iu);
  assert.throws(
    () => selectReviewVersion(
      [
        { id: 'sale', attributes: { versionString: '1.0.0', appStoreState: 'READY_FOR_SALE' } },
        { id: 'removed', attributes: { versionString: '1.0.0', appStoreState: 'DEVELOPER_REMOVED_FROM_SALE' } },
      ],
      '1.0.0',
    ),
    /not in an active review state/iu,
  );
});

test('ASC requests are GET-compatible and request only required review fields', () => {
  const versions = reviewVersionEndpoint('123', '1.0.0');
  assert.match(versions, /^\/v1\/apps\/123\/appStoreVersions\?/u);
  assert.match(decodeURIComponent(versions), /filter\[platform\]=IOS/u);
  assert.match(decodeURIComponent(versions), /filter\[versionString\]=1\.0\.0/u);

  const detail = decodeURIComponent(reviewDetailEndpoint('version-id'));
  assert.match(detail, /^\/v1\/appStoreVersions\/version-id\/appStoreReviewDetail\?/u);
  assert.match(detail, /demoAccountName,demoAccountPassword,demoAccountRequired,notes/u);
  assert.doesNotMatch(detail, /contactEmail|contactPhone/u);
});

test('review notes tolerate line endings only and otherwise fail on drift', () => {
  assert.equal(normalizeReviewNotes('one\r\ntwo\r\n'), 'one\ntwo');
  assert.doesNotThrow(() => assertReviewNotesMatch('staff', 'one\r\ntwo', 'one\ntwo'));
  assert.throws(
    () => assertReviewNotesMatch('staff', 'old notes', 'new notes'),
    /differ from metadata/iu,
  );
});

test('ASC demo fields fail closed without exposing their values', () => {
  const credentials = assertReviewCredentials('staff', {
    demoAccountRequired: true,
    demoAccountName: 'review-user',
    demoAccountPassword: 'review-secret',
  });
  assert.deepEqual(credentials, { username: 'review-user', password: 'review-secret' });
  assert.throws(
    () => assertReviewCredentials('staff', { demoAccountRequired: false }),
    /not marked required/iu,
  );
  assert.throws(
    () => assertReviewCredentials('staff', { demoAccountRequired: true }),
    /name is missing/iu,
  );
});

test('staff role, active state and point are all server-verified', () => {
  const principal = {
    typ: 'staff',
    active: true,
    role: 'courier',
    point: 'REVIEW-POINT',
  };
  assert.doesNotThrow(() =>
    assertStaffPrincipal('courier', principal, 'courier', 'REVIEW-POINT'),
  );
  assert.throws(
    () => assertStaffPrincipal('courier', { ...principal, role: 'owner' }, 'courier', 'REVIEW-POINT'),
    /role does not match/iu,
  );
  assert.throws(
    () => assertStaffPrincipal('courier', { ...principal, point: 'OTHER' }, 'courier', 'REVIEW-POINT'),
    /point does not match/iu,
  );
  assert.throws(
    () => assertStaffPrincipal('courier', { ...principal, active: false }, 'courier', 'REVIEW-POINT'),
    /not an active/iu,
  );
});

test('empty tasks, deliveries, shifts and catalogs fail closed', () => {
  assert.throws(() => assertReadinessValue('staff', 'collection', []), /empty/iu);
  assert.throws(() => assertReadinessValue('courier', 'collection', null), /empty/iu);
  assert.throws(
    () => assertReadinessValue('staff', 'collection', [{ status: 'completed' }]),
    /no actionable/iu,
  );
  assert.throws(
    () => assertReadinessValue('courier', 'collection', [{ status: 'delivered' }]),
    /no active/iu,
  );
  assert.throws(() => assertReadinessValue('pos', 'object', null), /missing/iu);
  assert.throws(() => assertCatalogReady({ items: [] }), /no products/iu);
  assert.throws(
    () => assertCatalogReady({ items: [{ availableUnits: 0 }] }),
    /fewer than 3/iu,
  );
  assert.doesNotThrow(() =>
    assertCatalogReady({
      items: [
        { availableUnits: 1 },
        { availableUnits: 2 },
        { availableUnits: 3 },
      ],
    }),
  );
});

test('HTTP failures report only route and status, never response data', () => {
  const error = safeHttpError(
    'AliStore API',
    'GET',
    'staff-tasks/mine',
    403,
  );
  assert.equal(
    error.message,
    'AliStore API: GET staff-tasks/mine failed with HTTP 403',
  );
  assert.doesNotMatch(error.message, /credential|token|phone|customer/iu);
});

test('live verification performs only login POSTs and readiness GETs', async () => {
  const calls = [];
  const tokens = {
    client: 'token-client',
    staff: 'token-staff',
    courier: 'token-courier',
    pos: 'token-pos',
  };
  const byUsername = {
    'staff-review': tokens.staff,
    'courier-review': tokens.courier,
    'pos-review': tokens.pos,
  };
  const responseFor = (method, endpoint, options = {}) => {
    if (method === 'GET' && endpoint.startsWith('catalog/products')) {
      return {
        items: [
          { id: 'product-1', availableUnits: 2 },
          { id: 'product-2', availableUnits: 2 },
          { id: 'product-3', availableUnits: 2 },
        ],
      };
    }
    if (method === 'POST' && endpoint === 'auth/otp/request') {
      return { challengeId: 'review-challenge' };
    }
    if (method === 'POST' && endpoint === 'auth/otp/verify') {
      assert.equal(options.body.challengeId, 'review-challenge');
      return { accessToken: tokens.client, refreshToken: 'not-reported' };
    }
    if (method === 'GET' && endpoint === 'auth/me') {
      return { typ: 'customer', customerId: 'customer-review' };
    }
    if (method === 'POST' && endpoint === 'staff-auth/login') {
      return { accessToken: byUsername[options.body.username], refreshToken: 'not-reported' };
    }
    if (method === 'GET' && endpoint === 'staff-auth/me') {
      const role = {
        [tokens.staff]: 'seller',
        [tokens.courier]: 'courier',
        [tokens.pos]: 'cashier',
      }[options.token];
      return { typ: 'staff', active: true, role, point: 'REVIEW-POINT' };
    }
    if (endpoint === 'staff-tasks/mine') return [{ id: 'task', status: 'open' }];
    if (endpoint === 'courier/me/deliveries') {
      return [{ id: 'delivery', status: 'courier_assigned' }];
    }
    if (endpoint === 'shifts/current') return { id: 'shift' };
    throw new Error(`Unexpected call: ${method} ${endpoint}`);
  };
  const apiRequest = async (method, endpoint, options) => {
    calls.push({ method, endpoint });
    return responseFor(method, endpoint, options);
  };

  await verifyLiveReadiness({
    apiRequest,
    credentialsByApp,
    expectedPoint: 'REVIEW-POINT',
    expectedCustomerId: 'customer-review',
  });

  assert.equal(calls.filter((call) => call.method === 'POST').length, 5);
  assert.ok(
    calls
      .filter((call) => call.method !== 'POST')
      .every((call) => call.method === 'GET'),
  );
  assert.deepEqual(
    calls.filter((call) => call.method === 'POST').map((call) => call.endpoint),
    [
      'auth/otp/request',
      'auth/otp/verify',
      'staff-auth/login',
      'staff-auth/login',
      'staff-auth/login',
    ],
  );
});

test('live verification propagates empty and forbidden readiness failures', async () => {
  const apiRequest = async (method, endpoint, options = {}) => {
    if (endpoint.startsWith('catalog/products')) {
      return {
        items: [
          { availableUnits: 1 },
          { availableUnits: 1 },
          { availableUnits: 1 },
        ],
      };
    }
    if (endpoint === 'auth/otp/request') return { challengeId: 'review-challenge' };
    if (endpoint === 'auth/otp/verify') return { accessToken: 'customer-token' };
    if (endpoint === 'auth/me') return { typ: 'customer', customerId: 'customer-review' };
    if (endpoint === 'staff-auth/login') return { accessToken: `token-${options.body.username}` };
    if (endpoint === 'staff-auth/me') {
      return { typ: 'staff', active: true, role: 'seller', point: 'REVIEW-POINT' };
    }
    if (endpoint === 'staff-tasks/mine') throw safeHttpError('AliStore API', method, endpoint, 403);
    throw new Error(`Unexpected call: ${method} ${endpoint}`);
  };

  await assert.rejects(
    verifyLiveReadiness({
      apiRequest,
      credentialsByApp,
      expectedPoint: 'REVIEW-POINT',
      expectedCustomerId: 'customer-review',
    }),
    /HTTP 403/u,
  );
});

test('live verification fails before verify when OTP request returns no challenge', async () => {
  const calls = [];
  const apiRequest = async (method, endpoint) => {
    calls.push({ method, endpoint });
    if (endpoint.startsWith('catalog/products')) {
      return {
        items: [
          { availableUnits: 1 },
          { availableUnits: 1 },
          { availableUnits: 1 },
        ],
      };
    }
    if (endpoint === 'auth/otp/request') return {};
    throw new Error(`Unexpected call: ${method} ${endpoint}`);
  };

  await assert.rejects(
    verifyLiveReadiness({
      apiRequest,
      credentialsByApp,
      expectedPoint: 'REVIEW-POINT',
      expectedCustomerId: 'customer-review',
    }),
    /OTP request returned no challenge ID/u,
  );
  assert.deepEqual(calls.map((call) => call.endpoint), [
    'catalog/products?limit=100&offset=0',
    'auth/otp/request',
  ]);
});
