#!/usr/bin/env node
/**
 * Apply the two App Store Connect fields that `apps/ios/store/*-metadata.json`
 * declares but nothing ever wrote: the app's primary category and its content
 * rights declaration. Both are required before a version can be submitted for
 * review, and both were empty for Staff, Courier and POS while the metadata
 * files claimed BUSINESS / DOES_NOT_USE_THIRD_PARTY_CONTENT.
 *
 * Read-only by default. Writes only with --apply, and only for fields that
 * actually differ, so a second run is a no-op.
 *
 * Usage:
 *   node scripts/apply-ios-store-metadata.mjs [--env-file apps/ios/.env.production] [--apply]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ENV_FILE = 'apps/ios/.env.production';
const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com';

export const APP_KEYS = ['client', 'staff', 'courier', 'pos'];

export const ASC_APP_IDS = {
  client: '6792492229',
  staff: '6792488057',
  courier: '6792489244',
  pos: '6792489921',
};

/**
 * Allowlist rather than a passthrough: an unknown id would be rejected by Apple
 * anyway, and failing here keeps a typo in a metadata file from turning into a
 * confusing 4xx mid-run.
 */
const ASC_CATEGORIES = new Set(['BUSINESS', 'SHOPPING', 'PRODUCTIVITY', 'UTILITIES', 'FINANCE']);

/**
 * `contentRightsDeclaration` accepts only two values. The metadata files use a
 * third, more descriptive wording for the storefront, which maps onto the
 * "uses third-party content" answer.
 */
const CONTENT_RIGHTS = new Map([
  ['DOES_NOT_USE_THIRD_PARTY_CONTENT', 'DOES_NOT_USE_THIRD_PARTY_CONTENT'],
  ['USES_THIRD_PARTY_CONTENT', 'USES_THIRD_PARTY_CONTENT'],
  ['USES_THIRD_PARTY_CONTENT_WITH_RIGHTS', 'USES_THIRD_PARTY_CONTENT'],
]);

export function readStoreMetadata(appKey) {
  const file = path.join(PROJECT_ROOT, 'apps/ios/store', `${appKey}-metadata.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Translate one metadata file into the exact values App Store Connect stores. */
export function desiredMetadata(metadata) {
  const category = metadata?.app?.category;
  if (!ASC_CATEGORIES.has(category)) {
    throw new Error(`Unsupported App Store category: ${category}`);
  }
  const contentRights = CONTENT_RIGHTS.get(metadata?.app?.contentRights);
  if (!contentRights) {
    throw new Error(`Unsupported content rights declaration: ${metadata?.app?.contentRights}`);
  }
  return { primaryCategory: category, contentRightsDeclaration: contentRights };
}

/** The diff that drives every write: empty means the remote app already matches. */
export function planChanges(desired, current) {
  return ['primaryCategory', 'contentRightsDeclaration']
    .filter((field) => (current?.[field] ?? null) !== desired[field])
    .map((field) => ({ field, from: current?.[field] ?? null, to: desired[field] }));
}

export function assertCredentials({ keyPath, keyId, issuerId }) {
  if (!keyPath) throw new Error('ASC API key path is required');
  if (!/^[A-Z0-9]{10}$/u.test(keyId ?? '')) {
    throw new Error('ASC key id must be a 10-character identifier');
  }
  if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/u.test(issuerId ?? '')) {
    throw new Error('ASC issuer id must be a UUID');
  }
}

/** Same ES256 scheme as scripts/verify-app-store-connect.mjs. */
export function signAscToken({ privateKey, keyId, issuerId, now = Math.floor(Date.now() / 1000) }) {
  const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${base64url({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${base64url({
    iss: issuerId,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })}`;
  // JWT ES256 signatures are the raw 64-byte R||S form, not OpenSSL's DER form.
  const signature = crypto
    .sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

export function parseEnvFile(source) {
  return Object.fromEntries(
    source
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const envFile = args.includes('--env-file')
    ? args[args.indexOf('--env-file') + 1]
    : DEFAULT_ENV_FILE;

  let env = process.env;
  const resolvedEnvFile = path.resolve(PROJECT_ROOT, envFile);
  if (fs.existsSync(resolvedEnvFile)) {
    env = { ...process.env, ...parseEnvFile(fs.readFileSync(resolvedEnvFile, 'utf8')) };
  }

  const credentials = {
    keyPath: env.ASC_API_KEY_PATH,
    keyId: env.ASC_KEY_ID,
    issuerId: env.ASC_ISSUER_ID,
  };
  try {
    assertCredentials(credentials);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }

  let privateKey;
  try {
    privateKey = fs.readFileSync(credentials.keyPath, 'utf8');
  } catch {
    console.error('✗ ASC API key file is not readable');
    process.exit(1);
  }

  const token = signAscToken({ privateKey, keyId: credentials.keyId, issuerId: credentials.issuerId });
  const call = async (method, endpoint, body) => {
    const response = await fetch(`${ASC_BASE_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${method} ${endpoint} failed with HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    return response.status === 204 ? null : response.json();
  };

  console.log(apply ? 'Applying iOS store metadata to App Store Connect' : 'Dry run — no writes (pass --apply to write)');

  let pending = 0;
  let written = 0;
  for (const appKey of APP_KEYS) {
    const appId = ASC_APP_IDS[appKey];
    const desired = desiredMetadata(readStoreMetadata(appKey));

    const app = await call('GET', `/v1/apps/${appId}`);
    const appInfos = await call('GET', `/v1/apps/${appId}/appInfos?limit=10`);
    // The editable record is the one still being prepared; a live version's
    // appInfo is read-only and must not be targeted.
    const appInfo = (appInfos.data ?? []).find(
      (info) => (info.attributes?.appStoreState ?? info.attributes?.state) === 'PREPARE_FOR_SUBMISSION',
    );
    if (!appInfo) {
      console.error(`✗ ${appKey}: no editable appInfo in PREPARE_FOR_SUBMISSION`);
      process.exit(1);
    }
    const primaryCategory = await call('GET', `/v1/appInfos/${appInfo.id}/primaryCategory`);

    const current = {
      primaryCategory: primaryCategory?.data?.id ?? null,
      contentRightsDeclaration: app?.data?.attributes?.contentRightsDeclaration ?? null,
    };
    const changes = planChanges(desired, current);

    if (changes.length === 0) {
      console.log(`  ✓ ${appKey}: already matches (${desired.primaryCategory}, ${desired.contentRightsDeclaration})`);
      continue;
    }

    for (const change of changes) {
      console.log(`  ${apply ? '→' : '·'} ${appKey}: ${change.field} ${change.from ?? 'NULL'} → ${change.to}`);
      if (!apply) {
        pending += 1;
        continue;
      }
      if (change.field === 'primaryCategory') {
        await call('PATCH', `/v1/appInfos/${appInfo.id}`, {
          data: {
            type: 'appInfos',
            id: appInfo.id,
            relationships: {
              primaryCategory: { data: { type: 'appCategories', id: change.to } },
            },
          },
        });
      } else {
        await call('PATCH', `/v1/apps/${appId}`, {
          data: {
            type: 'apps',
            id: appId,
            attributes: { contentRightsDeclaration: change.to },
          },
        });
      }
      written += 1;
    }
  }

  if (apply) {
    console.log(written === 0 ? '✓ No changes needed' : `✓ Applied ${written} change(s)`);
  } else {
    console.log(pending === 0 ? '✓ No changes needed' : `${pending} change(s) pending — re-run with --apply`);
  }
}
