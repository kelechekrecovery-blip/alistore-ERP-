#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateSupplyGateDatabaseUrl } from './supply-release-gate-db.mjs';
import {
  inspectHeadWorktree,
  resolveTrustedGit,
  runTrustedGit,
} from './trusted-git.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CERT_POLICY_RELATIVE_PATH = 'config/supply-release-cert-policy.json';
const PINNED_CERT_ISSUER_FINGERPRINT = 'sha256:6656eacac266b505458cc745d9bbc7846e41353eedfb4f798d3f0e2d81a1170b';
const CERT_POLICY_KEYS = Object.freeze([
  'expectedScopes',
  'issuerFingerprint',
  'issuerPublicKeyPath',
  'maxAgeSeconds',
  'targetEnvironment',
  'version',
]);

export const FULL_PASS_REQUIRED_SUFFIXES = Object.freeze([
  'supply_feature_flags',
  'prisma_validate',
  'supply_migration_upgrade',
  'supply_lifecycle_journeys',
  'api_full',
  'web_tests',
  'web_build',
  'playwright_db_migrations',
  'playwright_postdeploy_indexes',
  'playwright_cross_browser',
  'production_preflight_strict',
  'production_readiness_strict',
  'ios_build',
  'ios_test',
  'ios_ui',
  'ios_lint',
  'android_build',
  'android_test_lint',
  'android_ui',
]);

export const SUPPLY_LIFECYCLE_JOURNEYS = Object.freeze([
  'supply_only',
  'mixed_pickup',
  'mixed_courier_readiness',
  'cancel_before_po',
  'cancel_after_po',
  'refund_retry',
  'partial_handover',
  'quarantine',
]);

export const SUPPLY_LIFECYCLE_EVIDENCE = Object.freeze({
  supply_only: ['order-to-order-request: orders a to_order product with zero stock'],
  mixed_pickup: [
    'order-to-order-request: creates line-level schedules for a mixed cart',
    'order-item-handover: hands over only the own-stock line and preserves the active supply line',
  ],
  mixed_courier_readiness: [
    'order-to-order-request: creates line-level schedules for a mixed cart',
    'order-line-supply: courier COD guard blocks completion before supply readiness',
  ],
  cancel_before_po: ['order-to-order-request: automatic deposit refund before PO send'],
  cancel_after_po: ['order-to-order-request: owner resolution policy after PO send'],
  refund_retry: ['order-to-order-request: transient refund failure completes on retry'],
  partial_handover: ['order-item-handover: hands over one line without completing the mixed order'],
  quarantine: ['supply-quarantine: quarantines and resolves serialized and quantity supply'],
});

export const certificationChecks = Object.freeze([
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
]);

function blockedCertification(detail) {
  return { status: 'BLOCKED', detail, evidence: null };
}

export function verifyCertificationArtifact({
  artifact,
  publicKeyPem,
  currentHead,
  targetEnvironment,
  expectedScopes,
  maxAgeSeconds,
  now = new Date(),
}) {
  const capabilities = certificationChecks.map(([capability]) => capability);
  const blocked = (detail) => new Map(capabilities.map((capability) => [
    capability,
    blockedCertification(detail),
  ]));
  if (!currentHead || !targetEnvironment || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    return blocked('signed certification gate config is incomplete');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      return blocked('certification trust key must be Ed25519');
    }
  } catch {
    return blocked('certification Ed25519 public key is invalid');
  }
  if (artifact?.version !== 1 || !Array.isArray(artifact.certifications)) {
    return blocked('signed certification artifact is missing or invalid');
  }

  const verifiedPayloads = [];
  for (const envelope of artifact.certifications) {
    if (typeof envelope?.payload !== 'string' || typeof envelope?.signature !== 'string') continue;
    try {
      const payloadBytes = Buffer.from(envelope.payload, 'base64');
      const signature = Buffer.from(envelope.signature, 'base64');
      if (!verifySignature(null, payloadBytes, publicKey, signature)) continue;
      verifiedPayloads.push(JSON.parse(payloadBytes.toString('utf8')));
    } catch {}
  }

  return new Map(capabilities.map((capability) => {
    const expectedScope = expectedScopes?.[capability];
    if (!expectedScope) {
      return [capability, blockedCertification(`trusted config has no expected scope for ${capability}`)];
    }
    const candidates = verifiedPayloads.filter((payload) => payload?.capability === capability);
    for (const payload of candidates) {
      const issuedAt = new Date(payload.issuedAt);
      const expiresAt = new Date(payload.expiresAt);
      const issuedMs = issuedAt.getTime();
      const expiresMs = expiresAt.getTime();
      const ageSeconds = (now.getTime() - issuedMs) / 1000;
      if (
        payload.version !== 1
        || typeof payload.reference !== 'string'
        || payload.reference.trim() === ''
        || payload.commit !== currentHead
        || payload.environment !== targetEnvironment
        || payload.scope !== expectedScope
        || !Number.isFinite(issuedMs)
        || !Number.isFinite(expiresMs)
        || issuedMs > now.getTime()
        || expiresMs <= now.getTime()
        || expiresMs < issuedMs
        || ageSeconds > maxAgeSeconds
      ) {
        continue;
      }
      return [capability, {
        status: 'PASS',
        detail: `verified signed ${capability} certification`,
        evidence: {
          reference: payload.reference,
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          scope: payload.scope,
          environment: payload.environment,
          commit: payload.commit,
          signatureAlgorithm: 'Ed25519',
        },
      }];
    }
    return [capability, blockedCertification(
      `no valid signed evidence for ${capability} bound to commit, environment, capability, scope, and validity window`,
    )];
  }));
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

export function loadPinnedCertificationPolicy(cwd = root) {
    const repositoryRoot = realpathSync(cwd);
    const trustedGit = resolveTrustedGit(repositoryRoot);
    const policyPath = path.join(repositoryRoot, CERT_POLICY_RELATIVE_PATH);
    if (lstatSync(policyPath).isSymbolicLink()) throw new Error('pinned certification policy must not be a symlink');
    const policyBytes = readFileSync(policyPath);
    const policy = JSON.parse(policyBytes.toString('utf8'));
    if (
      !exactKeys(policy, CERT_POLICY_KEYS)
      || policy.version !== 1
      || policy.targetEnvironment !== 'production'
      || !Number.isSafeInteger(policy.maxAgeSeconds)
      || policy.maxAgeSeconds <= 0
      || policy.issuerFingerprint !== PINNED_CERT_ISSUER_FINGERPRINT
      || !exactKeys(policy.expectedScopes, certificationChecks.map(([capability]) => capability))
      || Object.values(policy.expectedScopes).some((scope) => typeof scope !== 'string' || scope.trim() === '')
    ) {
      throw new Error('pinned certification policy schema or production policy is invalid');
    }
    if (policy.issuerPublicKeyPath !== 'supply-release-cert-issuer.pem') {
      throw new Error('pinned issuer key path is invalid');
    }

    const keyRelativePath = path.posix.join('config', policy.issuerPublicKeyPath);
    const keyPath = path.join(repositoryRoot, keyRelativePath);
    if (lstatSync(keyPath).isSymbolicLink()) throw new Error('pinned certification key must not be a symlink');
    const inspection = inspectHeadWorktree(
      trustedGit,
      repositoryRoot,
      [CERT_POLICY_RELATIVE_PATH, keyRelativePath],
    );
    if (
      !inspection.matches
      || JSON.stringify(inspection.files) !== JSON.stringify(
        [CERT_POLICY_RELATIVE_PATH, keyRelativePath].sort(),
      )
    ) {
      throw new Error('pinned certification policy/key must be tracked and byte-identical to HEAD');
    }
    const publicKeyPem = readFileSync(keyPath);
    const publicKey = createPublicKey(publicKeyPem);
    const fingerprint = `sha256:${createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex')}`;
    if (fingerprint !== PINNED_CERT_ISSUER_FINGERPRINT) {
      throw new Error('pinned certification issuer fingerprint mismatch');
    }
    return { policy, publicKeyPem };
}

export function loadPinnedCertificationResults({
  cwd = root,
  evidencePath,
  currentHead,
  now = new Date(),
}) {
  if (!evidencePath) {
    return new Map(certificationChecks.map(([capability]) => [
      capability,
      blockedCertification('SUPPLY_GATE_CERT_EVIDENCE is required; environment booleans are never certification evidence'),
    ]));
  }
  try {
    const { policy, publicKeyPem } = loadPinnedCertificationPolicy(cwd);
    const artifact = JSON.parse(readFileSync(path.resolve(evidencePath), 'utf8'));
    return verifyCertificationArtifact({
      artifact,
      publicKeyPem,
      currentHead,
      targetEnvironment: policy.targetEnvironment,
      expectedScopes: policy.expectedScopes,
      maxAgeSeconds: policy.maxAgeSeconds,
      now,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Map(certificationChecks.map(([capability]) => [
      capability,
      blockedCertification(`pinned certification policy/artifact could not be verified: ${detail}`),
    ]));
  }
}

export function gitSnapshot(cwd = root) {
  try {
    const repositoryRoot = realpathSync(cwd);
    const trustedGit = resolveTrustedGit(repositoryRoot);
    return {
      head: runTrustedGit(trustedGit, repositoryRoot, ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      status: runTrustedGit(
        trustedGit,
        repositoryRoot,
        ['status', '--porcelain=v1', '--untracked-files=all'],
        {
        encoding: 'utf8',
        },
      ).trim() || 'clean',
    };
  } catch {
    return { head: null, status: 'unavailable' };
  }
}

export function sameCleanCommit(snapshots) {
  return snapshots.length >= 3
    && snapshots.every((snapshot) => snapshot.head && snapshot.status === 'clean')
    && new Set(snapshots.map((snapshot) => snapshot.head)).size === 1;
}

export function requiredPassIds(passNumber) {
  return FULL_PASS_REQUIRED_SUFFIXES.map((suffix) => `pass_${passNumber}_${suffix}`);
}

export function deriveOverall({ results, git, planOnly = false }) {
  if (planOnly || !git?.head || git.status !== 'clean') return 'NOT_READY';
  const requiredIds = [
    ...requiredPassIds(1),
    ...requiredPassIds(2),
    'same_clean_commit_two_full_passes',
  ];
  const byId = new Map(results.map((row) => [row.id, row]));
  if (requiredIds.some((id) => byId.get(id)?.status !== 'PASS')) return 'NOT_READY';
  if (results.some((row) => row.status === 'FAIL')) return 'NOT_READY';
  if (results.some((row) => row.status === 'BLOCKED')) return 'READY_WITH_FAIL_CLOSED';
  return 'READY';
}

export function buildEvidenceManifest({
  results,
  startedAt,
  endedAt,
  planOnly,
  git,
  commitSnapshots,
}) {
  return {
    title: 'AliStore supply release gate evidence',
    overall: deriveOverall({ results, git, planOnly }),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    planOnly,
    deploymentPerformed: false,
    storeReleasePerformed: false,
    git,
    commitSnapshots,
    requiredLifecycleJourneys: SUPPLY_LIFECYCLE_JOURNEYS,
    results,
  };
}

function atomicWriteJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

export function writeEvidenceManifest(cwd, manifest) {
  const dir = path.join(cwd, 'docs/acceptance/artifacts');
  mkdirSync(dir, { recursive: true });
  const stamp = manifest.endedAt.replace(/[:.]/g, '-');
  const file = path.join(dir, `supply-release-gate-${stamp}.json`);
  atomicWriteJson(file, manifest);
  atomicWriteJson(path.join(dir, 'supply-release-gate-latest.json'), manifest);
  return file;
}

export function writeRuntimeFailureEvidence({
  cwd = root,
  error,
  startedAt = new Date(),
  git = gitSnapshot(cwd),
}) {
  const endedAt = new Date();
  const detail = error instanceof Error ? error.message : String(error);
  const manifest = {
    title: 'AliStore supply release gate evidence',
    overall: 'NOT_READY',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    planOnly: false,
    deploymentPerformed: false,
    storeReleasePerformed: false,
    git,
    commitSnapshots: [],
    requiredLifecycleJourneys: SUPPLY_LIFECYCLE_JOURNEYS,
    results: [{ id: 'gate_runtime', status: 'FAIL', detail, command: null }],
  };
  const file = writeEvidenceManifest(cwd, manifest);
  return { manifest, file };
}

export async function executeSupplyReleaseGate({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = root,
} = {}) {
  const args = new Set(argv);
  const planOnly = args.has('--plan');
  const skipNative = args.has('--skip-native');
  const startedAt = new Date();
  const results = [];
  const commitSnapshots = [];

  function record(id, status, detail, command = null, evidence = undefined) {
    const row = { id, status, detail, command };
    if (evidence !== undefined) row.evidence = evidence;
    results.push(row);
    console.log(`[${status}] ${id}: ${detail}`);
  }

  function run(id, command, commandArgs, options = {}) {
    const printable = [command, ...commandArgs].join(' ');
    if (planOnly) {
      record(id, 'BLOCKED', 'not executed in --plan mode', printable);
      return false;
    }
    const result = spawnSync(command, commandArgs, {
      cwd,
      stdio: 'inherit',
      env: { ...env, ...(options.env ?? {}) },
    });
    if (result.error?.code === 'ENOENT') {
      record(id, options.optional ? 'BLOCKED' : 'FAIL', `${command} is not installed`, printable);
      return false;
    }
    const passed = result.status === 0;
    record(id, passed ? 'PASS' : 'FAIL', `exit ${result.status ?? 1}`, printable, options.evidence);
    return passed;
  }

  function testDatabaseBase() {
    const explicitBase = env.E2E_DATABASE_URL ?? env.TEST_DATABASE_URL;
    return validateSupplyGateDatabaseUrl(explicitBase, {
      planOnly,
      confirmed: env.ALISTORE_TEST_DATABASE_CONFIRMED === '1',
      productionDatabaseUrl: env.DATABASE_URL,
    });
  }

  function probe(id, command, commandArgs) {
    if (planOnly) {
      record(id, 'BLOCKED', 'not probed in --plan mode', [command, ...commandArgs].join(' '));
      return false;
    }
    const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
      record(id, 'BLOCKED', `${command} prerequisite unavailable`);
      return false;
    }
    const version = `${result.stdout ?? result.stderr ?? ''}`.trim().split('\n')[0] || 'available';
    record(id, 'PASS', version);
    return true;
  }

  function assertFeatureFlags(id) {
    const featureFlags = [
      'TO_ORDER_CHECKOUT_ENABLED',
      'SUPPLY_CANCELLATION_ENABLED',
      'SUPPLY_AUTO_REFUND_ENABLED',
      'SUPPLY_OWNER_RESOLUTION_ENABLED',
      'SUPPLY_PARTIAL_HANDOVER_ENABLED',
      'SUPPLY_QUARANTINE_CONVERSION_ENABLED',
    ];
    const unsafe = featureFlags.filter((name) => env[name]?.trim().toLowerCase() === 'true');
    record(
      id,
      unsafe.length === 0 ? 'PASS' : 'FAIL',
      unsafe.length === 0
        ? 'all release-sensitive supply flags are false/unset'
        : `must remain false until explicit certified cutover: ${unsafe.join(', ')}`,
    );
  }

  async function isolatedPlaywright(prefix) {
    if (planOnly) {
      for (const suffix of ['playwright_db_migrations', 'playwright_postdeploy_indexes', 'playwright_cross_browser']) {
        record(`${prefix}_${suffix}`, 'BLOCKED', 'not executed in --plan mode', 'playwright test');
      }
      return;
    }
    const require = createRequire(import.meta.url);
    const { Client } = require(require.resolve('pg', { paths: [path.join(cwd, 'apps/api'), cwd] }));
    const base = testDatabaseBase();
    const database = `alistore_test_release_gate_${process.pid}_${prefix}`;
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
        `${prefix}_playwright_db_migrations`,
        'npm',
        ['exec', '-w', '@alistore/api', '--', 'prisma', 'migrate', 'deploy'],
        { env: { DATABASE_URL: databaseUrl } },
      );
      if (migrated) {
        const indexed = run(`${prefix}_playwright_postdeploy_indexes`, 'node', ['apps/api/scripts/postdeploy-indexes.mjs'], {
          env: { DATABASE_URL: databaseUrl },
        });
        if (indexed) {
          run(`${prefix}_playwright_cross_browser`, 'npm', ['exec', '--', 'playwright', 'test'], {
            env: {
              E2E_DATABASE_URL: databaseUrl,
              E2E_BROWSERS: 'chromium,firefox,webkit',
              E2E_REUSE_EXISTING_SERVER: 'false',
              CI: '1',
            },
          });
        } else {
          record(`${prefix}_playwright_cross_browser`, 'BLOCKED', 'postdeploy indexes failed');
        }
      } else {
        record(`${prefix}_playwright_postdeploy_indexes`, 'BLOCKED', 'isolated migration failed');
        record(`${prefix}_playwright_cross_browser`, 'BLOCKED', 'isolated migration failed');
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  }

  function captureCommitCheckpoint(id, baselineHead = null) {
    const snapshot = gitSnapshot(cwd);
    commitSnapshots.push({ id, ...snapshot });
    const valid = snapshot.status === 'clean'
      && Boolean(snapshot.head)
      && (!baselineHead || snapshot.head === baselineHead);
    record(
      id,
      valid ? 'PASS' : 'FAIL',
      valid
        ? `clean commit ${snapshot.head}`
        : `gate requires the same clean commit; head=${snapshot.head ?? 'unavailable'} status=${snapshot.status}`,
      null,
      snapshot,
    );
    return snapshot;
  }

  async function runFullPass(passNumber, testUrl) {
    const prefix = `pass_${passNumber}`;
    assertFeatureFlags(`${prefix}_supply_feature_flags`);
    run(`${prefix}_prisma_validate`, 'npm', ['exec', '-w', '@alistore/api', '--', 'prisma', 'validate']);
    run(`${prefix}_supply_migration_upgrade`, 'npm', ['run', 'test:supply-migration-upgrade', '-w', '@alistore/api'], {
      env: { TEST_DATABASE_URL: testUrl },
    });
    run(
      `${prefix}_supply_lifecycle_journeys`,
      'npm',
      [
        'run', 'test', '-w', '@alistore/api', '--', '--runInBand',
        'test/order-to-order-request.e2e-spec.ts',
        'test/order-line-supply.e2e-spec.ts',
        'test/order-item-handover.e2e-spec.ts',
        'test/supply-quarantine.e2e-spec.ts',
      ],
      {
        env: {
          TEST_DATABASE_URL: testUrl,
          ALISTORE_TEST_DATABASE_CONFIRMED: '1',
        },
        evidence: { journeys: SUPPLY_LIFECYCLE_EVIDENCE, layer: 'api_e2e' },
      },
    );
    const isolatedEnv = {
      TEST_DATABASE_URL: testUrl,
      ALISTORE_TEST_DATABASE_CONFIRMED: '1',
      ALISTORE_TEST_TEMPLATE_DB: 'alistore_test_template',
      ALISTORE_TEST_ADMIN_DB: 'postgres',
    };
    run(`${prefix}_api_full`, 'node', ['scripts/run-isolated-api-tests.mjs'], { env: isolatedEnv });
    run(`${prefix}_web_tests`, 'npm', ['run', 'test', '-w', '@alistore/web']);
    run(`${prefix}_web_build`, 'npm', ['run', 'build', '-w', '@alistore/web']);
    await isolatedPlaywright(prefix);
    run(`${prefix}_production_preflight_strict`, 'npm', ['run', 'launch:preflight:strict']);
    run(`${prefix}_production_readiness_strict`, 'npm', ['run', 'launch:readiness:strict']);
    run(`${prefix}_secret_scan`, 'gitleaks', ['dir', '--redact', '--no-banner', '.'], { optional: true });
    run(`${prefix}_dependency_scan`, 'osv-scanner', ['scan', 'source', '-r', '.'], { optional: true });
    if (skipNative) {
      for (const suffix of ['ios_build', 'ios_test', 'ios_ui', 'ios_lint', 'android_build', 'android_test_lint', 'android_ui']) {
        record(`${prefix}_${suffix}`, 'BLOCKED', 'skipped by --skip-native');
      }
      return;
    }
    const xcodeReady = probe(`${prefix}_ios_xcode_prerequisite`, 'xcodebuild', ['-version']);
    const swiftlintReady = probe(`${prefix}_ios_swiftlint_prerequisite`, 'swiftlint', ['version']);
    if (xcodeReady) {
      run(`${prefix}_ios_build`, 'npm', ['run', 'ios:build']);
      run(`${prefix}_ios_test`, 'npm', ['run', 'ios:test']);
      run(`${prefix}_ios_ui`, 'npm', ['run', 'ios:ui']);
    } else {
      for (const suffix of ['ios_build', 'ios_test', 'ios_ui']) {
        record(`${prefix}_${suffix}`, 'BLOCKED', 'Xcode prerequisite unavailable');
      }
    }
    if (swiftlintReady) run(`${prefix}_ios_lint`, 'npm', ['run', 'ios:lint']);
    else record(`${prefix}_ios_lint`, 'BLOCKED', 'swiftlint prerequisite unavailable');
    const javaReady = probe(`${prefix}_android_java_prerequisite`, '/opt/homebrew/opt/openjdk@17/bin/java', ['-version']);
    if (javaReady) {
      run(`${prefix}_android_build`, 'npm', ['run', 'android:build']);
      run(`${prefix}_android_test_lint`, 'npm', ['run', 'android:test']);
      run(`${prefix}_android_ui`, 'npm', ['run', 'android:ui']);
    } else {
      for (const suffix of ['android_build', 'android_test_lint', 'android_ui']) {
        record(`${prefix}_${suffix}`, 'BLOCKED', 'Java 17 prerequisite unavailable');
      }
    }
  }

  const testUrl = testDatabaseBase();
  const baseline = captureCommitCheckpoint('git_clean_baseline');
  for (const passNumber of [1, 2]) {
    captureCommitCheckpoint(`pass_${passNumber}_git_before`, baseline.head);
    await runFullPass(passNumber, testUrl);
    captureCommitCheckpoint(`pass_${passNumber}_git_after`, baseline.head);
  }
  const cleanCommitProof = sameCleanCommit(commitSnapshots.map(({ head, status }) => ({ head, status })));
  const passRowsComplete = [1, 2].every((passNumber) => {
    const required = new Set(requiredPassIds(passNumber));
    return results.filter((row) => required.has(row.id)).every((row) => row.status === 'PASS')
      && results.filter((row) => required.has(row.id)).length === required.size;
  });
  record(
    'same_clean_commit_two_full_passes',
    cleanCommitProof && passRowsComplete ? 'PASS' : cleanCommitProof ? 'BLOCKED' : 'FAIL',
    cleanCommitProof && passRowsComplete
      ? `two complete passes verified at ${baseline.head}`
      : 'two complete passing gates on one unchanged clean commit were not demonstrated',
    null,
    { head: baseline.head, checkpoints: commitSnapshots.map((row) => row.id) },
  );

  const certificationResults = loadPinnedCertificationResults({
    cwd,
    evidencePath: env.SUPPLY_GATE_CERT_EVIDENCE,
    currentHead: baseline.head,
  });
  for (const [id] of certificationChecks) {
    const certification = certificationResults.get(id)
      ?? blockedCertification(`no signed certification result for ${id}`);
    record(
      `external_${id}`,
      certification.status,
      certification.detail,
      null,
      certification.evidence,
    );
  }

  const endedAt = new Date();
  const git = gitSnapshot(cwd);
  const manifest = buildEvidenceManifest({
    results,
    startedAt,
    endedAt,
    planOnly,
    git,
    commitSnapshots,
  });
  const file = writeEvidenceManifest(cwd, manifest);
  console.log(`[evidence] ${path.relative(cwd, file)} (${manifest.overall})`);
  process.exitCode = manifest.overall === 'READY' ? 0 : manifest.overall === 'READY_WITH_FAIL_CLOSED' ? 2 : 1;
  return manifest;
}

export async function runSupplyReleaseGateMain({
  cwd = root,
  argv = process.argv.slice(2),
  env = process.env,
  execute = executeSupplyReleaseGate,
  setExitCode = true,
} = {}) {
  const startedAt = new Date();
  try {
    return await execute({ argv, env, cwd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FAIL] gate_runtime: ${message}`);
    try {
      const failure = writeRuntimeFailureEvidence({ cwd, error, startedAt });
      console.error(`[evidence] ${path.relative(cwd, failure.file)} (NOT_READY)`);
      if (setExitCode) process.exitCode = 1;
      return failure.manifest;
    } catch (evidenceError) {
      const evidenceMessage = evidenceError instanceof Error ? evidenceError.message : String(evidenceError);
      console.error(`[FAIL] gate_runtime_evidence: ${evidenceMessage}`);
      if (setExitCode) process.exitCode = 1;
      return null;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runSupplyReleaseGateMain();
}
