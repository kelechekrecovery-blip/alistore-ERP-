import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FULL_PASS_REQUIRED_SUFFIXES,
  SUPPLY_LIFECYCLE_EVIDENCE,
  SUPPLY_LIFECYCLE_JOURNEYS,
  buildEvidenceManifest,
  deriveOverall,
  gitSnapshot,
  loadPinnedCertificationPolicy,
  loadPinnedCertificationResults,
  requiredPassIds,
  runSupplyReleaseGateMain,
  sameCleanCommit,
  verifyCertificationArtifact,
} from '../supply-release-gate.mjs';
import { resolveTrustedGit } from '../trusted-git.mjs';

const cleanGit = { head: 'abc123', status: 'clean' };

// The committed toolchain lock is intentionally bound to the evidence
// workstation (currently macOS/arm64). CI still exercises the gate's policy and
// signature logic, but cannot claim a workstation-bound fixture it does not
// possess. Keep this check explicit so an unsupported runner skips only the
// host-specific fixture instead of turning the whole release pre-step red.
const PINNED_TOOLCHAIN_AVAILABLE = (() => {
  try {
    resolveTrustedGit(process.cwd());
    return true;
  } catch {
    return false;
  }
})();

function passingRequiredResults() {
  return [
    ...requiredPassIds(1),
    ...requiredPassIds(2),
    'same_clean_commit_two_full_passes',
  ].map((id) => ({ id, status: 'PASS', detail: 'test' }));
}

test('required pass includes populated-schema migration upgrade and every execution layer', () => {
  assert.ok(FULL_PASS_REQUIRED_SUFFIXES.includes('supply_migration_upgrade'));
  assert.ok(FULL_PASS_REQUIRED_SUFFIXES.includes('supply_lifecycle_journeys'));
  assert.ok(FULL_PASS_REQUIRED_SUFFIXES.includes('api_full'));
  assert.ok(FULL_PASS_REQUIRED_SUFFIXES.includes('playwright_cross_browser'));
  assert.ok(FULL_PASS_REQUIRED_SUFFIXES.includes('ios_ui'));
  assert.ok(FULL_PASS_REQUIRED_SUFFIXES.includes('android_ui'));
});

test('lifecycle evidence contract names every mandatory journey', () => {
  assert.deepEqual(SUPPLY_LIFECYCLE_JOURNEYS, [
    'supply_only',
    'mixed_pickup',
    'mixed_courier_readiness',
    'cancel_before_po',
    'cancel_after_po',
    'refund_retry',
    'partial_handover',
    'quarantine',
  ]);
  assert.deepEqual(Object.keys(SUPPLY_LIFECYCLE_EVIDENCE), SUPPLY_LIFECYCLE_JOURNEYS);
  for (const references of Object.values(SUPPLY_LIFECYCLE_EVIDENCE)) {
    assert.ok(references.length > 0);
    assert.ok(references.every((reference) => reference.includes(': ')));
  }
});

test('READY requires two complete passes and the clean-commit proof', () => {
  assert.equal(deriveOverall({
    results: passingRequiredResults(),
    git: cleanGit,
  }), 'READY');

  assert.equal(deriveOverall({
    results: passingRequiredResults().filter((row) => row.id !== 'pass_2_supply_migration_upgrade'),
    git: cleanGit,
  }), 'NOT_READY');
});

test('a dirty tree is never READY', () => {
  assert.equal(deriveOverall({
    results: passingRequiredResults(),
    git: { ...cleanGit, status: ' M scripts/supply-release-gate.mjs' },
  }), 'NOT_READY');
});

test('optional fail-closed blockers use READY_WITH_FAIL_CLOSED vocabulary', () => {
  assert.equal(deriveOverall({
    results: [
      ...passingRequiredResults(),
      { id: 'external_sms', status: 'BLOCKED', detail: 'no evidence' },
    ],
    git: cleanGit,
  }), 'READY_WITH_FAIL_CLOSED');
});

test('plan mode remains non-executing evidence and is NOT_READY', () => {
  assert.equal(deriveOverall({
    results: passingRequiredResults(),
    git: cleanGit,
    planOnly: true,
  }), 'NOT_READY');
});

test('same commit proof rejects dirty, changed, or too few checkpoints', () => {
  assert.equal(sameCleanCommit([cleanGit, cleanGit, cleanGit]), true);
  assert.equal(sameCleanCommit([cleanGit, { head: 'def456', status: 'clean' }, cleanGit]), false);
  assert.equal(sameCleanCommit([cleanGit, { ...cleanGit, status: 'dirty' }, cleanGit]), false);
  assert.equal(sameCleanCommit([cleanGit, cleanGit]), false);
});

const signingKeys = generateKeyPairSync('ed25519');
const publicKeyPem = signingKeys.publicKey.export({ type: 'spki', format: 'pem' });
const expectedScopes = Object.fromEntries([
  'payment_gateway',
  'refund_webhook',
  'smtp',
  'sms',
  'fcm',
  'apns',
  'object_storage',
  'fiscal_ofd',
  'monitoring',
  'pos_hardware',
].map((capability) => [capability, `production:${capability}`]));
const verificationNow = new Date('2026-07-30T08:00:00.000Z');

function signedArtifact(overrides = {}, privateKey = signingKeys.privateKey) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    reference: 'CERT-42',
    capability: 'sms',
    environment: 'production',
    scope: expectedScopes.sms,
    commit: 'abc123',
    issuedAt: '2026-07-30T07:00:00.000Z',
    expiresAt: '2026-07-31T07:00:00.000Z',
    ...overrides,
  }));
  return {
    version: 1,
    certifications: [{
      payload: payload.toString('base64'),
      signature: sign(null, payload, privateKey).toString('base64'),
    }],
  };
}

function verifySms(artifact) {
  return verifyCertificationArtifact({
    artifact,
    publicKeyPem,
    currentHead: 'abc123',
    targetEnvironment: 'production',
    expectedScopes,
    maxAgeSeconds: 7200,
    now: verificationNow,
  }).get('sms');
}

test('only a valid Ed25519 artifact bound to commit, environment, capability and scope can pass', () => {
  assert.equal(verifySms(signedArtifact()).status, 'PASS');
  assert.equal(verifySms(signedArtifact({ commit: 'other-commit' })).status, 'BLOCKED');
  assert.equal(verifySms(signedArtifact({ environment: 'staging' })).status, 'BLOCKED');
  assert.equal(verifySms(signedArtifact({ capability: 'smtp' })).status, 'BLOCKED');
  assert.equal(verifySms(signedArtifact({ scope: 'staging:sms' })).status, 'BLOCKED');
});

test('legacy environment booleans cannot produce a certification PASS', () => {
  const results = loadPinnedCertificationResults({ evidencePath: null, currentHead: 'abc123' });
  assert.equal(results.get('sms').status, 'BLOCKED');
  assert.match(results.get('sms').detail, /booleans are never certification evidence/);
});

test('claimant-controlled temporary config and self-signed key cannot become the trust anchor', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'supply-gate-claimant-config-'));
  try {
    writeFileSync(path.join(cwd, 'claimant-key.pem'), publicKeyPem);
    writeFileSync(path.join(cwd, 'claimant-evidence.json'), JSON.stringify(signedArtifact()));
    writeFileSync(path.join(cwd, 'claimant-config.json'), JSON.stringify({
      publicKeyPath: 'claimant-key.pem',
      targetEnvironment: 'production',
      expectedScopes,
      maxAgeSeconds: 7200,
    }));
    const results = loadPinnedCertificationResults({
      cwd,
      evidencePath: path.join(cwd, 'claimant-evidence.json'),
      currentHead: 'abc123',
    });
    assert.equal(results.get('sms').status, 'BLOCKED');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('clean committed pinned-policy fixture is accepted by trusted Git verification', {
  skip: !PINNED_TOOLCHAIN_AVAILABLE,
}, () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'supply-gate-cert-config-'));
  try {
    const configDir = path.join(cwd, 'config');
    const scriptsDir = path.join(cwd, 'scripts');
    mkdirSync(configDir);
    mkdirSync(scriptsDir);
    for (const relative of [
      'config/supply-release-cert-policy.json',
      'config/supply-release-cert-issuer.pem',
      'scripts/ecosystem-toolchain-lock.json',
    ]) {
      writeFileSync(path.join(cwd, relative), readFileSync(path.join(process.cwd(), relative)));
    }
    execFileSync('/usr/bin/git', ['init', '-q'], { cwd });
    execFileSync('/usr/bin/git', ['add', '.'], { cwd });
    execFileSync('/usr/bin/git', [
      '-c', 'user.name=Supply Gate Test',
      '-c', 'user.email=supply-gate@example.invalid',
      'commit', '-q', '-m', 'pinned policy fixture',
    ], { cwd });
    const { policy } = loadPinnedCertificationPolicy(cwd);
    assert.equal(policy.targetEnvironment, 'production');
    assert.equal(policy.issuerPublicKeyPath, 'supply-release-cert-issuer.pem');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('trusted Git snapshot ignores fake PATH git and inherited Git replacement/config environment', () => {
  const fakeBin = mkdtempSync(path.join(tmpdir(), 'supply-gate-fake-git-'));
  const marker = path.join(fakeBin, 'fake-git-ran');
  const fakeGit = path.join(fakeBin, 'git');
  writeFileSync(fakeGit, `#!/bin/sh\n: > '${marker}'\nexit 0\n`);
  chmodSync(fakeGit, 0o755);
  const keys = [
    'PATH',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_SYSTEM',
    'GIT_REPLACE_REF_BASE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NO_REPLACE_OBJECTS',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const baseline = gitSnapshot(process.cwd());
  try {
    process.env.PATH = `${fakeBin}:${previous.PATH ?? ''}`;
    process.env.GIT_DIR = path.join(fakeBin, 'claimant.git');
    process.env.GIT_WORK_TREE = fakeBin;
    process.env.GIT_CONFIG_GLOBAL = path.join(fakeBin, 'claimant.gitconfig');
    process.env.GIT_CONFIG_SYSTEM = path.join(fakeBin, 'claimant-system.gitconfig');
    process.env.GIT_REPLACE_REF_BASE = 'refs/claimant-replace';
    process.env.GIT_OBJECT_DIRECTORY = fakeBin;
    process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = fakeBin;
    process.env.GIT_NO_REPLACE_OBJECTS = '0';
    const attacked = gitSnapshot(process.cwd());
    assert.equal(attacked.head, baseline.head);
    assert.equal(attacked.status, baseline.status);
    assert.equal(existsSync(marker), false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(fakeBin, { recursive: true, force: true });
  }
});

test('forged and stale external evidence remains BLOCKED', () => {
  const forgedKeys = generateKeyPairSync('ed25519');
  assert.equal(verifySms(signedArtifact({}, forgedKeys.privateKey)).status, 'BLOCKED');
  assert.equal(verifySms(signedArtifact({
    issuedAt: '2026-07-29T07:00:00.000Z',
    expiresAt: '2026-07-31T07:00:00.000Z',
  })).status, 'BLOCKED');
  assert.equal(verifySms(signedArtifact({
    expiresAt: '2026-07-30T07:59:59.000Z',
  })).status, 'BLOCKED');
});

test('top-level runtime catch atomically replaces stale READY latest evidence with NOT_READY', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'supply-gate-runtime-'));
  try {
    const artifacts = path.join(cwd, 'docs/acceptance/artifacts');
    mkdirSync(artifacts, { recursive: true });
    writeFileSync(path.join(artifacts, 'supply-release-gate-latest.json'), '{"overall":"READY"}\n');
    const runtimeManifest = await runSupplyReleaseGateMain({
      cwd,
      execute: async () => {
        throw new Error('cleanup failed');
      },
      setExitCode: false,
    });
    const latest = JSON.parse(readFileSync(
      path.join(artifacts, 'supply-release-gate-latest.json'),
      'utf8',
    ));
    assert.equal(runtimeManifest.overall, 'NOT_READY');
    assert.equal(latest.overall, 'NOT_READY');
    assert.deepEqual(latest.results, [{
      id: 'gate_runtime',
      status: 'FAIL',
      detail: 'cleanup failed',
      command: null,
    }]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('manifest vocabulary and no-deploy assertions are stable', () => {
  const manifest = buildEvidenceManifest({
    results: passingRequiredResults(),
    startedAt: new Date('2026-07-30T08:00:00.000Z'),
    endedAt: new Date('2026-07-30T08:00:01.000Z'),
    planOnly: false,
    git: cleanGit,
    commitSnapshots: [],
  });
  assert.equal(manifest.overall, 'READY');
  assert.equal(manifest.deploymentPerformed, false);
  assert.equal(manifest.storeReleasePerformed, false);
  assert.ok(['READY', 'READY_WITH_FAIL_CLOSED', 'NOT_READY'].includes(manifest.overall));
});
