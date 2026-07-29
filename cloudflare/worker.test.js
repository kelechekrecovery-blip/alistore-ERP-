import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { CommandCoordinator } from './worker.js';

const bindings = (overrides = {}) => ({
  APP_ENV: 'test',
  API_VERSION: 'test-version',
  DB: {
    prepare() {
      return { first: async () => ({ healthy: 1 }) };
    },
  },
  MEDIA: {},
  OUTBOX_QUEUE: {},
  COMMAND_COORDINATOR: {},
  ...overrides,
});

test('liveness returns the stable public contract and request id', async () => {
  const response = await worker.fetch(
    new Request('https://ali.kg/api/health/live', {
      headers: { 'x-request-id': 'req-test-1' },
    }),
    bindings(),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'req-test-1');
  const body = await response.json();
  assert.deepEqual(body, { status: 'ok' });
});

test('health and readiness aliases match the NestJS public contract', async () => {
  for (const path of ['/api/health', '/api/health/ready']) {
    const response = await worker.fetch(
      new Request(`https://ali.kg${path}`),
      bindings(),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  }
});

test('readiness fails closed when a critical binding is missing', async () => {
  const response = await worker.fetch(
    new Request('https://ali.kg/api/health/ready'),
    bindings({ MEDIA: undefined }),
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(body, { statusCode: 503, message: 'Service Unavailable' });
  assert.equal(typeof response.headers.get('x-request-id'), 'string');
});

test('unmigrated routes cannot silently proxy to the legacy backend', async () => {
  const response = await worker.fetch(
    new Request('https://ali.kg/api/orders'),
    bindings(),
  );
  assert.equal(response.status, 501);
  const body = await response.json();
  assert.equal(body.code, 'ROUTE_NOT_MIGRATED');
  assert.equal(typeof body.requestId, 'string');
});

test('command coordinator replays a stable command key', async () => {
  const values = new Map();
  const coordinator = new CommandCoordinator({
    blockConcurrencyWhile: (operation) => operation(),
    storage: {
      get: (key) => values.get(key),
      put: (key, value) => values.set(key, value),
    },
  });
  const request = () => new Request('https://coordinator.internal/', {
    method: 'POST',
    body: JSON.stringify({ key: 'stock:unit-1:sale-1' }),
  });

  const first = await coordinator.fetch(request());
  const replay = await coordinator.fetch(request());
  assert.equal(first.status, 202);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('Idempotency-Replayed'), 'true');
});

test('command coordinator rejects reuse of a key with a different payload', async () => {
  const values = new Map();
  const coordinator = new CommandCoordinator({
    blockConcurrencyWhile: (operation) => operation(),
    storage: {
      get: (key) => values.get(key),
      put: (key, value) => values.set(key, value),
    },
  });
  const request = (quantity) => new Request('https://coordinator.internal/', {
    method: 'POST',
    body: JSON.stringify({ key: 'stock:unit-1:sale-1', quantity }),
  });

  assert.equal((await coordinator.fetch(request(1))).status, 202);
  const conflict = await coordinator.fetch(request(2));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'IDEMPOTENCY_CONFLICT');
});
