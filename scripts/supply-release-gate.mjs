#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSupplyGateDatabaseUrl } from './supply-release-gate-db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const planOnly = args.has('--plan');
const skipNative = args.has('--skip-native');
const startedAt = new Date();
const results = [];

const certificationChecks = [
  ['payment_gateway', 'PAYMENT_PROVIDER_CERTIFIED'],
  ['refund_webhook', 'REFUND_WEBHOOK_CERTIFIED'],
  ['smtp', 'SMTP_CERTIFIED'],
  ['sms', 'SMS_PROVIDER_CERTIFIED'],
  ['fcm', 'FCM_CERTIFIED'],
  ['apns', 'APNS_CERTIFIED'],
  ['object_storage', 'OBJECT_STORAGE_CERTIFIED'],
  ['fiscal_ofd', 'FISCAL_OFD_CERTIFIED'],
  ['monitoring', 'MONITORING_CERTIFIED'],
  ['pos_hardware', 'POS_HARDWARE_CERTIFIED'],
];

function record(id, status, detail, command = null) {
  results.push({ id, status, detail, command });
  console.log(`[${status}] ${id}: ${detail}`);
}

function run(id, command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(' ');
  if (planOnly) {
    record(id, 'BLOCKED', 'not executed in --plan mode', printable);
    return false;
  }
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.error?.code === 'ENOENT') {
    record(id, options.optional ? 'BLOCKED' : 'FAIL', `${command} is not installed`, printable);
    return false;
  }
  const passed = result.status === 0;
  record(id, passed ? 'PASS' : 'FAIL', `exit ${result.status ?? 1}`, printable);
  return passed;
}

function certified(name) {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

function testDatabaseBase() {
  const explicitBase = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  return validateSupplyGateDatabaseUrl(explicitBase, {
    planOnly,
    confirmed: process.env.ALISTORE_TEST_DATABASE_CONFIRMED === '1',
    productionDatabaseUrl: process.env.DATABASE_URL,
  });
}

function probe(id, command, commandArgs) {
  if (planOnly) {
    record(id, 'BLOCKED', 'not probed in --plan mode', [command, ...commandArgs].join(' '));
    return false;
  }
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    record(id, 'BLOCKED', `${command} prerequisite unavailable`);
    return false;
  }
  const version = `${result.stdout ?? result.stderr ?? ''}`.trim().split('\n')[0] || 'available';
  record(id, 'PASS', version);
  return true;
}

function assertFeatureFlags() {
  const featureFlags = [
    'TO_ORDER_CHECKOUT_ENABLED',
    'SUPPLY_CANCELLATION_ENABLED',
    'SUPPLY_AUTO_REFUND_ENABLED',
    'SUPPLY_OWNER_RESOLUTION_ENABLED',
    'SUPPLY_PARTIAL_HANDOVER_ENABLED',
    'SUPPLY_QUARANTINE_CONVERSION_ENABLED',
  ];
  const unsafe = featureFlags.filter((name) => process.env[name]?.trim().toLowerCase() === 'true');
  if (unsafe.length === 0) {
    record('supply_feature_flags', 'PASS', 'all release-sensitive supply flags are false/unset');
    return;
  }
  record(
    'supply_feature_flags',
    'FAIL',
    `must remain false until explicit certified cutover: ${unsafe.join(', ')}`,
  );
}

async function isolatedPlaywright() {
  if (planOnly) {
    record('playwright_cross_browser', 'BLOCKED', 'not executed in --plan mode', 'playwright test');
    return;
  }
  const require = createRequire(import.meta.url);
  const { Client } = require(require.resolve('pg', { paths: [path.join(root, 'apps/api'), root] }));
  const base = testDatabaseBase();
  const database = `alistore_test_release_gate_${process.pid}`;
  const urlFor = (name) => {
    const url = new URL(base);
    url.pathname = `/${name}`;
    url.search = '?schema=public';
    return url.toString();
  };
  const admin = new Client({ connectionString: urlFor('postgres') });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
    const databaseUrl = urlFor(database);
    const migrated = run(
      'playwright_db_migrations',
      'npm',
      ['exec', '-w', '@alistore/api', '--', 'prisma', 'migrate', 'deploy'],
      { env: { DATABASE_URL: databaseUrl } },
    );
    if (migrated) {
      run('playwright_postdeploy_indexes', 'node', ['apps/api/scripts/postdeploy-indexes.mjs'], {
        env: { DATABASE_URL: databaseUrl },
      });
      run('playwright_cross_browser', 'npm', ['exec', '--', 'playwright', 'test'], {
        env: {
          E2E_DATABASE_URL: databaseUrl,
          E2E_BROWSERS: 'chromium,firefox,webkit',
          E2E_REUSE_EXISTING_SERVER: 'false',
          CI: '1',
        },
      });
    } else {
      record('playwright_cross_browser', 'BLOCKED', 'isolated migration failed');
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
}

function writeEvidence() {
  const endedAt = new Date();
  let git = { head: null, status: 'unavailable' };
  try {
    git = {
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      status: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim() || 'clean',
    };
  } catch {}
  const technicalFailure = results.some((row) => row.status === 'FAIL');
  const blocked = results.some((row) => row.status === 'BLOCKED');
  const overall = technicalFailure ? 'FAIL' : blocked ? 'BLOCKED' : 'PASS';
  const manifest = {
    title: 'AliStore supply release gate evidence',
    overall,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    planOnly,
    deploymentPerformed: false,
    storeReleasePerformed: false,
    git,
    results,
  };
  const dir = path.join(root, 'docs/acceptance/artifacts');
  mkdirSync(dir, { recursive: true });
  const stamp = endedAt.toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `supply-release-gate-${stamp}.json`);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(dir, 'supply-release-gate-latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[evidence] ${path.relative(root, file)} (${overall})`);
  process.exitCode = technicalFailure ? 1 : blocked ? 2 : 0;
}

async function main() {
  const testUrl = testDatabaseBase();
  assertFeatureFlags();
  run('prisma_validate', 'npm', ['exec', '-w', '@alistore/api', '--', 'prisma', 'validate']);
  const isolatedEnv = {
    TEST_DATABASE_URL: testUrl,
    ALISTORE_TEST_DATABASE_CONFIRMED: '1',
    ALISTORE_TEST_TEMPLATE_DB: 'alistore_test_template',
    ALISTORE_TEST_ADMIN_DB: 'postgres',
  };
  run('api_full_pass_1', 'node', ['scripts/run-isolated-api-tests.mjs'], { env: isolatedEnv });
  run('api_full_pass_2', 'node', ['scripts/run-isolated-api-tests.mjs'], { env: isolatedEnv });
  run('web_tests', 'npm', ['run', 'test', '-w', '@alistore/web']);
  run('web_build', 'npm', ['run', 'build', '-w', '@alistore/web']);
  await isolatedPlaywright();
  run('production_preflight_strict', 'npm', ['run', 'launch:preflight:strict']);
  run('production_readiness_strict', 'npm', ['run', 'launch:readiness:strict']);
  run('secret_scan', 'gitleaks', ['dir', '--redact', '--no-banner', '.'], { optional: true });
  run('dependency_scan', 'osv-scanner', ['scan', 'source', '-r', '.'], { optional: true });
  if (skipNative) {
    record('ios_build_test_ui_lint', 'BLOCKED', 'skipped by --skip-native');
    record('android_build_test_lint_ui', 'BLOCKED', 'skipped by --skip-native');
  } else {
    const xcodeReady = probe('ios_xcode_prerequisite', 'xcodebuild', ['-version']);
    const swiftlintReady = probe('ios_swiftlint_prerequisite', 'swiftlint', ['version']);
    if (xcodeReady) {
      run('ios_build', 'npm', ['run', 'ios:build']);
      run('ios_test', 'npm', ['run', 'ios:test']);
      run('ios_ui', 'npm', ['run', 'ios:ui']);
    } else {
      for (const id of ['ios_build', 'ios_test', 'ios_ui']) record(id, 'BLOCKED', 'Xcode prerequisite unavailable');
    }
    if (swiftlintReady) run('ios_lint', 'npm', ['run', 'ios:lint']);
    else record('ios_lint', 'BLOCKED', 'swiftlint prerequisite unavailable');
    const javaReady = probe('android_java_prerequisite', '/opt/homebrew/opt/openjdk@17/bin/java', ['-version']);
    if (javaReady) {
      run('android_build', 'npm', ['run', 'android:build']);
      run('android_test_lint', 'npm', ['run', 'android:test']);
      run('android_ui', 'npm', ['run', 'android:ui']);
    } else {
      for (const id of ['android_build', 'android_test_lint', 'android_ui']) record(id, 'BLOCKED', 'Java 17 prerequisite unavailable');
    }
  }
  for (const [id, envName] of certificationChecks) {
    record(
      `external_${id}`,
      certified(envName) ? 'PASS' : 'BLOCKED',
      certified(envName) ? `${envName} attested` : `${envName} is not explicitly true; capability must remain fail-closed`,
    );
  }
  writeEvidence();
}

main().catch((error) => {
  record('gate_runtime', 'FAIL', error instanceof Error ? error.message : String(error));
  writeEvidence();
});
