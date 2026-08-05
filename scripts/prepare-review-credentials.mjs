#!/usr/bin/env node
/**
 * Prepare App Store review credentials without printing them.
 *
 * The generated bundle contains secrets and synthetic reviewer identifiers, so
 * it must be written to a new mode-0600 file outside the repository. Staff
 * provisioning payloads include an explicit store point; the API remains the
 * authority that rejects a missing, unknown, or inactive point.
 *
 * Usage:
 *   node scripts/prepare-review-credentials.mjs \
 *     --point REVIEW-POINT \
 *     --output /secure/path/alistore-review-credentials.txt
 *
 * Environment alternatives:
 *   ALISTORE_REVIEW_POINT
 *   ALISTORE_REVIEW_CREDENTIALS_FILE
 *   ALISTORE_REVIEW_PHONE
 *   ALISTORE_REVIEW_CUSTOMER_ID
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_API_BASE = 'https://api.ali.kg/api';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SPECIAL = '!@#$%-_+=';
const ALL = LOWER + UPPER + DIGIT + SPECIAL;
const REVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;

function canonicalPath(target) {
  const missing = [];
  let existing = path.resolve(target);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync.native(existing), ...missing);
}

function pick(alphabet, randomInt) {
  return alphabet[randomInt(alphabet.length)];
}

/** Strong password: all four classes, length 16, cryptographic randomness. */
export function strongPassword(randomInt = crypto.randomInt) {
  const base = [
    pick(LOWER, randomInt),
    pick(UPPER, randomInt),
    pick(DIGIT, randomInt),
    pick(SPECIAL, randomInt),
  ];
  while (base.length < 16) base.push(pick(ALL, randomInt));
  for (let index = base.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    [base[index], base[swapWith]] = [base[swapWith], base[index]];
  }
  return base.join('');
}

export function resolveReviewPoint(args, env = process.env) {
  const point = valueAfter(args, '--point') ?? env.ALISTORE_REVIEW_POINT;
  const normalized = point?.trim();
  if (!normalized) {
    throw new Error('--point or ALISTORE_REVIEW_POINT is required');
  }
  if (!/^[A-Z0-9-]{1,80}$/u.test(normalized)) {
    throw new Error('review point must be an uppercase inventory-location identifier');
  }
  return normalized;
}

export function resolveClientIdentity(args, env = process.env) {
  const phone = (valueAfter(args, '--client-phone') ?? env.ALISTORE_REVIEW_PHONE)?.trim();
  const customerId = (
    valueAfter(args, '--client-customer-id') ?? env.ALISTORE_REVIEW_CUSTOMER_ID
  )?.trim();
  if (!phone || !/^\+996\d{9}$/u.test(phone)) {
    throw new Error('--client-phone or ALISTORE_REVIEW_PHONE must be an existing +996 account');
  }
  if (!customerId || !/^[A-Za-z0-9_-]{8,128}$/u.test(customerId)) {
    throw new Error('--client-customer-id or ALISTORE_REVIEW_CUSTOMER_ID is required');
  }
  return { phone, customerId };
}

export function resolveOutputPath(args, env = process.env) {
  const value = valueAfter(args, '--output') ?? env.ALISTORE_REVIEW_CREDENTIALS_FILE;
  if (!value?.trim()) {
    throw new Error('--output or ALISTORE_REVIEW_CREDENTIALS_FILE is required');
  }
  const output = path.resolve(value.trim());
  const relative = path.relative(canonicalPath(PROJECT_ROOT), canonicalPath(output));
  const outsideRepository = (
    relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  );
  if (!outsideRepository) {
    throw new Error('credential output must be outside the repository');
  }
  return output;
}

export function normalizeApiBase(value) {
  let url;
  try {
    url = new URL(value ?? DEFAULT_API_BASE);
  } catch {
    throw new Error('API_BASE must be a valid URL');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('remote API_BASE must use HTTPS');
  }
  return url.toString().replace(/\/$/u, '');
}

export function buildCredentialBundle({
  point,
  clientPhone,
  clientCustomerId,
  now = Date.now(),
  randomInt = crypto.randomInt,
  randomBytes = crypto.randomBytes,
} = {}) {
  const normalizedPoint = resolveReviewPoint([], { ALISTORE_REVIEW_POINT: point });
  const clientIdentity = resolveClientIdentity([], {
    ALISTORE_REVIEW_PHONE: clientPhone,
    ALISTORE_REVIEW_CUSTOMER_ID: clientCustomerId,
  });
  const suffix = randomBytes(3).toString('hex');
  const reviewOtp = String(randomInt(1_000_000)).padStart(6, '0');
  // The API deliberately rejects review windows longer than seven days.
  // Keep generated credentials short-lived while leaving enough time for a
  // normal App Review pass; regenerate instead of extending stale access.
  const until = new Date(now + REVIEW_WINDOW_MS).toISOString();
  const staff = [
    {
      app: 'Staff',
      username: `review_staff_${suffix}`,
      role: 'seller',
      password: strongPassword(randomInt),
    },
    {
      app: 'Courier',
      username: `review_courier_${suffix}`,
      role: 'courier',
      password: strongPassword(randomInt),
    },
    {
      app: 'POS',
      username: `review_cashier_${suffix}`,
      role: 'cashier',
      password: strongPassword(randomInt),
    },
  ];

  const lines = [
    'ALISTORE APP REVIEW CREDENTIALS — SECRET — DELETE AFTER REVIEW',
    '',
    'CLIENT SERVER ENV',
    `AUTH_REVIEW_PHONE=${clientIdentity.phone}`,
    `AUTH_REVIEW_CUSTOMER_ID=${clientIdentity.customerId}`,
    `AUTH_REVIEW_OTP=${reviewOtp}`,
    `AUTH_REVIEW_UNTIL=${until}`,
    '',
    'CLIENT APP STORE CONNECT DEMO ACCOUNT',
    `User name: ${clientIdentity.phone}`,
    `Password: ${reviewOtp}`,
    '',
    'STAFF / COURIER / POS',
    'Create these accounts through the protected owner ERP provisioning flow.',
    'Never place owner tokens or generated passwords in shell arguments.',
  ];

  for (const account of staff) {
    lines.push(
      '',
      `${account.app} — role ${account.role}`,
      `ASC User name: ${account.username}`,
      `ASC Password: ${account.password}`,
    );
  }

  lines.push(
    '',
    'AFTER REVIEW',
    'Remove AUTH_REVIEW_* from the server and deactivate all three staff accounts.',
    '',
  );
  return {
    bundle: lines.join('\n'),
    point: normalizedPoint,
    staff: staff.map(({ app, username, role }) => ({ app, username, role })),
  };
}

export function provisionStaffPayload(account, point) {
  return {
    username: account.username,
    password: account.password,
    role: account.role,
    point,
  };
}

export function writeCredentialBundle(outputPath, bundle) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, bundle, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  fs.chmodSync(outputPath, 0o600);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const args = process.argv.slice(2);
    const point = resolveReviewPoint(args);
    const output = resolveOutputPath(args);
    const clientIdentity = resolveClientIdentity(args);
    const { bundle } = buildCredentialBundle({
      point,
      clientPhone: clientIdentity.phone,
      clientCustomerId: clientIdentity.customerId,
    });
    writeCredentialBundle(output, bundle);
    console.log('✓ Secure App Review credential bundle written with mode 0600');
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : 'Credential preparation failed'}`);
    process.exit(1);
  }
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}
