import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildPayload, canonicalJson, createSignedHeaders, parseArgs, sendEdgeEvent } from '../camera-edge-send.mjs';

test('canonical JSON and HMAC match the published edge vector', () => {
  const payload = {
    idempotencyKey: 'evt-1', deviceId: 'dev-1', storePointId: 'point-1',
    eventType: 'camera_offline', confidence: 1, value: {},
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(canonicalJson(payload), '{"confidence":1,"deviceId":"dev-1","eventType":"camera_offline","idempotencyKey":"evt-1","occurredAt":"2026-01-01T00:00:00.000Z","storePointId":"point-1","value":{}}');
  assert.equal(createSignedHeaders(payload, 'test-secret', 1767225600)['x-edge-device-signature'], '59a0f46e28ae65bb5464c48494476158fd944e23df2382e32c326b7dad9ff2bd');
});

test('payload builder rejects invalid event types and confidence', () => {
  assert.throws(() => buildPayload({ deviceId: 'd', storePointId: 'p', eventType: 'face_detected', confidence: '1', value: '{}' }), /unsupported/);
  assert.throws(() => buildPayload({ deviceId: 'd', storePointId: 'p', eventType: 'camera_offline', confidence: '2', value: '{}' }), /confidence/);
});

test('CLI kebab-case flags map to the documented payload fields', () => {
  const args = parseArgs(['--device-id', 'd', '--store-point-id', 'p', '--event-type', 'camera_offline', '--confidence', '1', '--value', '{}', '--retention-hours', '24', '--occurred-at', '2026-01-01T00:00:00.000Z', '--idempotency-key', 'cli:1']);
  assert.deepEqual(buildPayload(args), {
    idempotencyKey: 'cli:1',
    deviceId: 'd', storePointId: 'p', eventType: 'camera_offline', confidence: 1,
    value: {}, occurredAt: '2026-01-01T00:00:00.000Z',
    retentionHours: 24,
  });
});

test('remote insecure endpoints are refused by default', async () => {
  const payload = buildPayload({ deviceId: 'd', storePointId: 'p', eventType: 'camera_offline', confidence: '1', value: '{}' });
  await assert.rejects(() => sendEdgeEvent(payload, { apiUrl: 'http://example.com/events', secret: 'secret' }), /HTTPS/);
});

test('sends signed payload to a loopback gateway', async () => {
  const payload = buildPayload({ deviceId: 'd', storePointId: 'p', eventType: 'camera_offline', confidence: '1', value: '{}' });
  const server = http.createServer((request, response) => {
    assert.equal(request.headers['x-edge-device-secret'], 'secret');
    assert.match(request.headers['x-edge-device-signature'], /^[0-9a-f]{64}$/);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ accepted: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const result = await sendEdgeEvent(payload, { apiUrl: `http://127.0.0.1:${address.port}/events`, secret: 'secret', timestamp: 1767225600 });
    assert.deepEqual(result, { accepted: true });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('does not follow redirects that could exfiltrate the device secret', async () => {
  let redirected = false;
  const target = http.createServer((_request, response) => {
    redirected = true;
    response.end('unexpected');
  });
  const gateway = http.createServer((_request, response) => {
    const address = target.address();
    response.writeHead(302, { location: `http://127.0.0.1:${address.port}/capture` });
    response.end();
  });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  try {
    const payload = buildPayload({ deviceId: 'd', storePointId: 'p', eventType: 'camera_offline', confidence: '1', value: '{}' });
    const address = gateway.address();
    await assert.rejects(() => sendEdgeEvent(payload, { apiUrl: `http://127.0.0.1:${address.port}/events`, secret: 'secret' }));
    assert.equal(redirected, false);
  } finally {
    await Promise.all([
      new Promise((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve())),
      new Promise((resolve, reject) => target.close((error) => error ? reject(error) : resolve())),
    ]);
  }
});

test('bounds an unexpectedly large gateway response', async () => {
  const server = http.createServer((_request, response) => {
    response.end('x'.repeat(70 * 1024));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const payload = buildPayload({ deviceId: 'd', storePointId: 'p', eventType: 'camera_offline', confidence: '1', value: '{}' });
    const address = server.address();
    await assert.rejects(() => sendEdgeEvent(payload, { apiUrl: `http://127.0.0.1:${address.port}/events`, secret: 'secret' }), /64 KiB/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
