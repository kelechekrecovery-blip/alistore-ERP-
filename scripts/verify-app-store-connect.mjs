#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const [keyPath, keyId, issuerId] = process.argv.slice(2);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!keyPath || !keyId || !issuerId) {
  fail('Usage: verify-app-store-connect.mjs <AuthKey.p8> <key-id> <issuer-id>');
}
if (!/^[A-Z0-9]{10}$/u.test(keyId)) fail('ASC key id must be a 10-character identifier');
if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/u.test(issuerId)) {
  fail('ASC issuer id must be a UUID');
}

let privateKey;
try {
  privateKey = fs.readFileSync(keyPath, 'utf8');
} catch {
  fail('ASC API key file is not readable');
}

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const payload = {
  iss: issuerId,
  iat: now,
  exp: now + 600,
  aud: 'appstoreconnect-v1',
};
const unsignedToken = `${base64url(header)}.${base64url(payload)}`;
let signature;
try {
  // JWT ES256 signatures are the raw 64-byte R||S form, not OpenSSL's DER form.
  signature = crypto.sign(
    'sha256',
    Buffer.from(unsignedToken),
    { key: privateKey, dsaEncoding: 'ieee-p1363' },
  ).toString('base64url');
} catch {
  fail('Could not sign App Store Connect JWT with the provided key');
}

const response = await fetch('https://api.appstoreconnect.apple.com/v1/apps?limit=1', {
  headers: {
    Authorization: `Bearer ${unsignedToken}.${signature}`,
    Accept: 'application/json',
  },
});

if (!response.ok) {
  fail(`App Store Connect API verification failed with HTTP ${response.status}`);
}

const body = await response.json();
if (!Array.isArray(body.data)) fail('App Store Connect API returned an unexpected response');
