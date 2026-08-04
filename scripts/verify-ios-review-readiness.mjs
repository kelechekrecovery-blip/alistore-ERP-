#!/usr/bin/env node
/**
 * Read-only App Review readiness gate.
 *
 * The gate reads App Store Connect credentials from apps/ios/.env.production,
 * requests only the App Review fields needed for verification, signs in with
 * the demo accounts already stored by Apple, and performs GET-only readiness
 * checks after authentication. It never prints credentials, tokens, response
 * bodies, customer data, or store-point identifiers.
 *
 * Usage:
 *   node scripts/verify-ios-review-readiness.mjs
 *   node scripts/verify-ios-review-readiness.mjs --env-file apps/ios/.env.production
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_KEYS,
  ASC_APP_IDS,
  assertCredentials,
  parseEnvFile,
  readStoreMetadata,
  signAscToken,
} from './apply-ios-store-metadata.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ENV_FILE = 'apps/ios/.env.production';
const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com';
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_BUYABLE_PRODUCTS = 3;

export const REVIEW_PROFILES = {
  client: { kind: 'customer' },
  staff: { kind: 'staff', role: 'seller', readinessPath: 'staff-tasks/mine', readinessKind: 'collection' },
  courier: { kind: 'staff', role: 'courier', readinessPath: 'courier/me/deliveries', readinessKind: 'collection' },
  pos: { kind: 'staff', role: 'cashier', readinessPath: 'shifts/current', readinessKind: 'object' },
};

const ACTIVE_VERSION_STATES = [
  'IN_REVIEW',
  'WAITING_FOR_REVIEW',
  'READY_FOR_REVIEW',
  'METADATA_REJECTED',
  'REJECTED',
  'PREPARE_FOR_SUBMISSION',
];

export function parseMarketingVersion(source) {
  const match = source.match(/^\s*MARKETING_VERSION:\s*([^\s#]+)\s*$/mu);
  if (!match) throw new Error('iOS MARKETING_VERSION is missing');
  return match[1];
}

export function selectReviewVersion(versions, marketingVersion) {
  const matching = (versions ?? []).filter(
    (version) => version?.attributes?.versionString === marketingVersion,
  );
  if (matching.length === 0) {
    throw new Error('App Store Connect has no matching iOS version');
  }
  const active = matching
    .map((version, index) => ({
      version,
      rank: ACTIVE_VERSION_STATES.indexOf(version?.attributes?.appStoreState),
      index,
    }))
    .filter(({ rank }) => rank >= 0);
  if (active.length === 0) {
    throw new Error('App Store Connect matching iOS versions are not in an active review state');
  }
  return active
    .sort((left, right) => {
      return left.rank - right.rank || left.index - right.index;
    })[0].version;
}

export function normalizeReviewNotes(value) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').trim();
}

export function assertReviewNotesMatch(appKey, remoteNotes, expectedNotes) {
  if (normalizeReviewNotes(remoteNotes) !== normalizeReviewNotes(expectedNotes)) {
    throw new Error(`${appKey}: App Store review notes differ from metadata`);
  }
}

export function assertReviewCredentials(appKey, attributes) {
  if (attributes?.demoAccountRequired !== true) {
    throw new Error(`${appKey}: App Store demo account is not marked required`);
  }
  if (typeof attributes?.demoAccountName !== 'string' || attributes.demoAccountName.length === 0) {
    throw new Error(`${appKey}: App Store demo account name is missing`);
  }
  if (typeof attributes?.demoAccountPassword !== 'string' || attributes.demoAccountPassword.length === 0) {
    throw new Error(`${appKey}: App Store demo account credential is missing`);
  }
  return {
    username: attributes.demoAccountName,
    password: attributes.demoAccountPassword,
  };
}

export function assertStaffPrincipal(appKey, principal, expectedRole, expectedPoint) {
  if (principal?.typ !== 'staff' || principal?.active !== true) {
    throw new Error(`${appKey}: reviewer principal is not an active staff account`);
  }
  if (principal?.role !== expectedRole) {
    throw new Error(`${appKey}: reviewer role does not match the expected app role`);
  }
  if (typeof principal?.point !== 'string' || principal.point.length === 0) {
    throw new Error(`${appKey}: reviewer point is missing`);
  }
  if (principal.point !== expectedPoint) {
    throw new Error(`${appKey}: reviewer point does not match the configured review point`);
  }
}

export function assertReadinessValue(appKey, kind, value) {
  if (kind === 'collection') {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${appKey}: reviewer readiness data is empty`);
    }
    if (
      appKey === 'staff' &&
      !value.some((task) => ['open', 'in_progress'].includes(task?.status))
    ) {
      throw new Error('staff: no actionable reviewer task is available');
    }
    if (
      appKey === 'courier' &&
      !value.some((delivery) =>
        ['courier_assigned', 'out_for_delivery'].includes(delivery?.status),
      )
    ) {
      throw new Error('courier: no active reviewer delivery is available');
    }
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${appKey}: reviewer readiness object is missing`);
  }
}

export function assertCatalogReady(catalog) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  if (items.length === 0) throw new Error('catalog: no products are visible');
  const buyable = items.filter(
    (product) => Number(product?.availableUnits ?? 0) > 0,
  ).length;
  if (buyable < MIN_BUYABLE_PRODUCTS) {
    throw new Error(`catalog: fewer than ${MIN_BUYABLE_PRODUCTS} products are buyable`);
  }
}

export function safeHttpError(service, method, endpoint, status) {
  return new Error(`${service}: ${method} ${endpoint} failed with HTTP ${status}`);
}

export function reviewVersionEndpoint(appId, marketingVersion) {
  const query = new URLSearchParams({
    'filter[platform]': 'IOS',
    'filter[versionString]': marketingVersion,
    'fields[appStoreVersions]': 'versionString,appStoreState',
    limit: '10',
  });
  return `/v1/apps/${appId}/appStoreVersions?${query}`;
}

export function reviewDetailEndpoint(versionId) {
  const query = new URLSearchParams({
    'fields[appStoreReviewDetails]':
      'demoAccountName,demoAccountPassword,demoAccountRequired,notes',
  });
  return `/v1/appStoreVersions/${versionId}/appStoreReviewDetail?${query}`;
}

export async function verifyLiveReadiness({
  apiRequest,
  credentialsByApp,
  expectedPoint,
}) {
  if (!expectedPoint?.trim()) throw new Error('ALISTORE_REVIEW_POINT is required');

  const catalog = await apiRequest('GET', 'catalog/products?limit=100&offset=0');
  assertCatalogReady(catalog);

  for (const appKey of APP_KEYS) {
    const profile = REVIEW_PROFILES[appKey];
    const credentials = credentialsByApp[appKey];
    if (!credentials) throw new Error(`${appKey}: review credentials are unavailable`);

    if (profile.kind === 'customer') {
      const session = await apiRequest('POST', 'auth/otp/verify', {
        body: { phone: credentials.username, code: credentials.password },
      });
      if (typeof session?.accessToken !== 'string' || session.accessToken.length === 0) {
        throw new Error('client: login returned no access token');
      }
      const principal = await apiRequest('GET', 'auth/me', { token: session.accessToken });
      if (principal?.typ !== 'customer') {
        throw new Error('client: reviewer principal is not a customer');
      }
      continue;
    }

    const session = await apiRequest('POST', 'staff-auth/login', {
      body: { username: credentials.username, password: credentials.password },
    });
    if (typeof session?.accessToken !== 'string' || session.accessToken.length === 0) {
      throw new Error(`${appKey}: login returned no access token`);
    }
    const principal = await apiRequest('GET', 'staff-auth/me', { token: session.accessToken });
    assertStaffPrincipal(appKey, principal, profile.role, expectedPoint.trim());
    const readiness = await apiRequest('GET', profile.readinessPath, {
      token: session.accessToken,
    });
    assertReadinessValue(appKey, profile.readinessKind, readiness);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : 'Review readiness failed'}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const envFileArg = valueAfter(args, '--env-file') ?? DEFAULT_ENV_FILE;
  const envFile = path.resolve(PROJECT_ROOT, envFileArg);
  if (!fs.existsSync(envFile)) throw new Error('iOS production env file is not readable');
  const env = { ...process.env, ...parseEnvFile(fs.readFileSync(envFile, 'utf8')) };

  const apiBase = normalizeApiBase(env.ALISTORE_API_BASE_URL ?? env.API_BASE_URL);
  const expectedPoint = env.ALISTORE_REVIEW_POINT?.trim();
  if (!expectedPoint) throw new Error('ALISTORE_REVIEW_POINT is required');

  const ascCredentials = {
    keyPath: env.ASC_API_KEY_PATH,
    keyId: env.ASC_KEY_ID,
    issuerId: env.ASC_ISSUER_ID,
  };
  assertCredentials(ascCredentials);
  const keyPath = path.isAbsolute(ascCredentials.keyPath)
    ? ascCredentials.keyPath
    : path.resolve(path.dirname(envFile), ascCredentials.keyPath);
  let privateKey;
  try {
    privateKey = fs.readFileSync(keyPath, 'utf8');
  } catch {
    throw new Error('ASC API key file is not readable');
  }

  const marketingVersion = parseMarketingVersion(
    fs.readFileSync(path.join(PROJECT_ROOT, 'apps/ios/project.yml'), 'utf8'),
  );
  let ascToken;
  try {
    ascToken = signAscToken({
      privateKey,
      keyId: ascCredentials.keyId,
      issuerId: ascCredentials.issuerId,
    });
  } catch {
    throw new Error('Could not sign the App Store Connect request');
  }
  const ascRequest = createJsonRequester({
    baseUrl: ASC_BASE_URL,
    service: 'App Store Connect',
    defaultToken: ascToken,
  });
  const apiRequest = createJsonRequester({ baseUrl: apiBase, service: 'AliStore API' });

  const credentialsByApp = {};
  for (const appKey of APP_KEYS) {
    const versions = await ascRequest(
      'GET',
      reviewVersionEndpoint(ASC_APP_IDS[appKey], marketingVersion),
    );
    const version = selectReviewVersion(versions?.data, marketingVersion);
    const detail = await ascRequest('GET', reviewDetailEndpoint(version.id));
    const attributes = detail?.data?.attributes;
    const metadata = readStoreMetadata(appKey);
    assertReviewNotesMatch(appKey, attributes?.notes, metadata?.review?.appReviewNotes);
    credentialsByApp[appKey] = assertReviewCredentials(appKey, attributes);
    console.log(`✓ ${appKey}: App Store review configuration matches metadata`);
  }

  await verifyLiveReadiness({ apiRequest, credentialsByApp, expectedPoint });
  for (const appKey of APP_KEYS) {
    console.log(`✓ ${appKey}: live reviewer login and read-only readiness passed`);
  }
  console.log('✓ iOS App Review readiness passed; no business mutations were requested');
}

function normalizeApiBase(value) {
  if (!value?.trim()) throw new Error('ALISTORE_API_BASE_URL is required');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('ALISTORE_API_BASE_URL must be a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('ALISTORE_API_BASE_URL must use HTTPS');
  return url.toString().replace(/\/$/u, '');
}

function createJsonRequester({ baseUrl, service, defaultToken }) {
  return async (method, endpoint, { body, token } = {}) => {
    let response;
    try {
      response = await fetch(`${baseUrl}/${endpoint.replace(/^\/+/u, '')}`, {
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          ...(defaultToken || token
            ? { Authorization: `Bearer ${defaultToken ?? token}` }
            : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error(`${service}: ${method} ${endpoint} could not be reached`);
    }
    if (!response.ok) throw safeHttpError(service, method, endpoint, response.status);
    try {
      return await response.json();
    } catch {
      throw new Error(`${service}: ${method} ${endpoint} returned invalid JSON`);
    }
  };
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}
