import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCredentialBundle,
  normalizeApiBase,
  provisionStaffPayload,
  resolveClientIdentity,
  resolveOutputPath,
  resolveReviewPoint,
  strongPassword,
} from '../prepare-review-credentials.mjs';

test('client review identity must reference an explicit existing account', () => {
  assert.deepEqual(
    resolveClientIdentity([], {
      ALISTORE_REVIEW_PHONE: '+996700123456',
      ALISTORE_REVIEW_CUSTOMER_ID: 'customer_review_123',
    }),
    { phone: '+996700123456', customerId: 'customer_review_123' },
  );
  assert.throws(() => resolveClientIdentity([], {}), /existing \+996 account/iu);
  assert.throws(
    () => resolveClientIdentity(['--client-phone', '+996700123456'], {}),
    /customer-id/iu,
  );
});

test('review point is explicit, normalized, and may come from argv or env', () => {
  assert.equal(resolveReviewPoint(['--point', ' REVIEW-POINT '], {}), 'REVIEW-POINT');
  assert.equal(
    resolveReviewPoint([], { ALISTORE_REVIEW_POINT: 'REVIEW-POINT' }),
    'REVIEW-POINT',
  );
  assert.throws(() => resolveReviewPoint([], {}), /is required/iu);
  assert.throws(
    () => resolveReviewPoint(['--point', 'review point'], {}),
    /uppercase inventory-location/iu,
  );
});

test('staff provisioning always includes the server-validated point', () => {
  assert.deepEqual(
    provisionStaffPayload(
      { username: 'review_staff', password: 'strong-secret', role: 'seller' },
      'REVIEW-POINT',
    ),
    {
      username: 'review_staff',
      password: 'strong-secret',
      role: 'seller',
      point: 'REVIEW-POINT',
    },
  );
});

test('password generation keeps length and all four required character classes', () => {
  let value = 0;
  const deterministicRandomInt = (maximum) => {
    const next = value % maximum;
    value += 1;
    return next;
  };
  const password = strongPassword(deterministicRandomInt);
  assert.equal(password.length, 16);
  assert.match(password, /[a-z]/u);
  assert.match(password, /[A-Z]/u);
  assert.match(password, /[0-9]/u);
  assert.match(password, /[!@#$%\-_=+]/u);
});

test('credential bundle is deterministic under injected randomness and includes point', () => {
  const randomInt = (maximum) => 42 % maximum;
  const randomBytes = () => Buffer.from('a1b2c3', 'hex');
  const first = buildCredentialBundle({
    point: 'REVIEW-POINT',
    clientPhone: '+996700123456',
    clientCustomerId: 'customer_review_123',
    now: Date.parse('2026-07-30T00:00:00.000Z'),
    randomInt,
    randomBytes,
  });
  const second = buildCredentialBundle({
    point: 'REVIEW-POINT',
    clientPhone: '+996700123456',
    clientCustomerId: 'customer_review_123',
    now: Date.parse('2026-07-30T00:00:00.000Z'),
    randomInt,
    randomBytes,
  });

  assert.equal(first.bundle, second.bundle);
  assert.equal(first.staff.length, 3);
  assert.match(first.bundle, /AUTH_REVIEW_PHONE=\+996700123456/u);
  assert.match(first.bundle, /AUTH_REVIEW_CUSTOMER_ID=customer_review_123/u);
  assert.match(first.bundle, /AUTH_REVIEW_UNTIL=2026-08-02T00:00:00.000Z/u);
  assert.doesNotMatch(first.bundle, /curl|OWNER_TOKEN|Authorization:/u);
  assert.doesNotMatch(first.bundle, /undefined|null/u);
});

test('credential output must be explicit and outside the repository', () => {
  assert.throws(() => resolveOutputPath([], {}), /is required/iu);
  assert.throws(
    () => resolveOutputPath(['--output', 'scripts/review-secrets.txt'], {}),
    /outside the repository/iu,
  );
  assert.throws(
    () => resolveOutputPath(['--output', '..review-secrets/credentials.txt'], {}),
    /outside the repository/iu,
  );
  const external = path.resolve('/tmp/alistore-review-credentials-test.txt');
  assert.equal(resolveOutputPath(['--output', external], {}), external);
});

test('credential output rejects an external symlink that resolves inside the repository', () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'alistore-review-output-'));
  try {
    const link = path.join(tempDirectory, 'linked-repository-directory');
    fs.symlinkSync(path.resolve('scripts'), link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => resolveOutputPath(['--output', path.join(link, 'review-secrets.txt')], {}),
      /outside the repository/iu,
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('remote API requires HTTPS while local development remains available', () => {
  assert.equal(normalizeApiBase('https://api.example.test/api/'), 'https://api.example.test/api');
  assert.equal(normalizeApiBase('http://127.0.0.1:4000/api'), 'http://127.0.0.1:4000/api');
  assert.throws(() => normalizeApiBase('http://api.example.test/api'), /HTTPS/u);
});
