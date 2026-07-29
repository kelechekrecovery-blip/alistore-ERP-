import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSupplyGateDatabaseUrl } from '../supply-release-gate-db.mjs';

test('rejects remote destructive release-gate databases even when named test and confirmed', () => {
  assert.throws(
    () => validateSupplyGateDatabaseUrl(
      'postgresql://release@db.example.com:5432/alistore_test?schema=public',
      { confirmed: true },
    ),
    /non-loopback/,
  );
});

test('accepts an explicitly confirmed loopback test database', () => {
  const url = 'postgresql://alistore@127.0.0.1:5432/alistore_test?schema=public';
  assert.equal(
    validateSupplyGateDatabaseUrl(url, { confirmed: true }),
    url,
  );
});

test('accepts IPv6 loopback', () => {
  const url = 'postgresql://alistore@[::1]:5432/alistore_test?schema=public';
  assert.equal(
    validateSupplyGateDatabaseUrl(url, { confirmed: true }),
    url,
  );
});

test('rejects PostgreSQL query parameters that override the validated host', () => {
  assert.throws(
    () => validateSupplyGateDatabaseUrl(
      'postgresql://alistore@localhost:5432/alistore_test?host=db.example.com',
      { confirmed: true },
    ),
    /host overrides/,
  );
});

test('does not accept a production URL as the test target', () => {
  const url = 'postgresql://alistore@localhost:5432/alistore_test?schema=public';
  assert.throws(
    () => validateSupplyGateDatabaseUrl(url, {
      confirmed: true,
      productionDatabaseUrl: url,
    }),
    /must not equal DATABASE_URL/,
  );
});
