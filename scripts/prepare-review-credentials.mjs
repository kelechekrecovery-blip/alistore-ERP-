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
 *   API_BASE
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
  apiBase = DEFAULT_API_BASE,
  now = Date.now(),
  randomInt = crypto.randomInt,
  randomBytes = crypto.randomBytes,
} = {}) {
  const normalizedPoint = resolveReviewPoint([], { ALISTORE_REVIEW_POINT: point });
  const normalizedApiBase = normalizeApiBase(apiBase);
  const suffix = randomBytes(3).toString('hex');
  const reviewPhone = `+996700${String(randomInt(1_000_000)).padStart(6, '0')}`;
  const reviewOtp = String(randomInt(1_000_000)).padStart(6, '0');
  const until = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
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
    `AUTH_REVIEW_PHONE=${reviewPhone}`,
    `AUTH_REVIEW_OTP=${reviewOtp}`,
    `AUTH_REVIEW_UNTIL=${until}`,
    '',
    'CLIENT APP STORE CONNECT DEMO ACCOUNT',
    `User name: ${reviewPhone}`,
    `Password: ${reviewOtp}`,
    '',
    'STAFF / COURIER / POS',
    'Run each command with an active owner token substituted locally.',
    'The API verifies that the configured point exists and is active.',
  ];

  for (const account of staff) {
    const payload = provisionStaffPayload(account, normalizedPoint);
    lines.push(
      '',
      `${account.app} — role ${account.role}`,
      `curl -sS -X POST ${normalizedApiBase}/staff-auth/staff \\`,
      "  -H 'Authorization: Bearer <OWNER_TOKEN>' -H 'Content-Type: application/json' \\",
      `  -d '${JSON.stringify(payload)}'`,
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
    const apiBase = normalizeApiBase(process.env.API_BASE ?? DEFAULT_API_BASE);
    const { bundle } = buildCredentialBundle({ point, apiBase });
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
