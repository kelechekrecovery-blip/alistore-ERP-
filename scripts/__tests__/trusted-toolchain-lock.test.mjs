import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertTrustedNodeRuntimePins,
  assertSupportedToolchainLockPolicy,
  diffToolchainLocks,
  parseToolchainLockMode,
  writeToolchainLockAtomically,
} from '../regenerate-toolchain-lock.mjs';
import { hashDependencyTree, sha256File } from '../toolchain-hashes.mjs';
import {
  isTrustedEvidenceDatabaseIdentity,
  resolveTrustedEvidenceDatabase,
  trustedNpmEnvironment,
} from '../trusted-npm.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonicalTmpDir = fs.realpathSync(os.tmpdir());
const trackedLock = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'scripts', 'ecosystem-toolchain-lock.json'), 'utf8'),
);

const leaves = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
  const childPath = prefix ? `${prefix}.${key}` : key;
  return child !== null && typeof child === 'object' && !Array.isArray(child)
    ? leaves(child, childPath)
    : [[childPath, child]];
});

const setPath = (target, dottedPath, value) => {
  const parts = dottedPath.split('.');
  const final = parts.pop();
  let cursor = target;
  for (const part of parts) cursor = cursor[part];
  cursor[final] = value;
};

test('every tracked toolchain leaf is fail-closed when tampered', () => {
  assert.deepEqual(diffToolchainLocks(trackedLock, structuredClone(trackedLock)), []);
  for (const [field, value] of leaves(trackedLock)) {
    const tampered = structuredClone(trackedLock);
    setPath(tampered, field, typeof value === 'number' ? value + 1 : `${value}-tampered`);
    assert.deepEqual(
      diffToolchainLocks(trackedLock, tampered).map((difference) => difference.path),
      [field],
      field,
    );
  }
});

test('unknown or missing trust-lock fields are reported instead of preserved', () => {
  const extra = structuredClone(trackedLock);
  extra.runtime.claimantOverride = 'ignored';
  assert.deepEqual(
    diffToolchainLocks(trackedLock, extra).map((difference) => difference.path),
    ['runtime.claimantOverride'],
  );

  const missing = structuredClone(trackedLock);
  delete missing.runtime.gitSha256;
  assert.deepEqual(
    diffToolchainLocks(trackedLock, missing).map((difference) => difference.path),
    ['runtime.gitSha256'],
  );
});

test('generator modes require one explicit non-ambiguous operation', () => {
  assert.equal(parseToolchainLockMode(['--check']), '--check');
  assert.equal(parseToolchainLockMode(['--write']), '--write');
  for (const args of [[], ['--write', '--check'], ['--force'], ['--write', 'elsewhere.json']]) {
    assert.throws(() => parseToolchainLockMode(args), /Usage:/);
  }
});

test('trusted evidence requires one explicitly confirmed disposable database', () => {
  const databaseUrl = 'postgresql://alistore@127.0.0.1:5432/alistore_evidence_gate0_a1_test?schema=public';
  for (const environment of [
    {},
    { TEST_DATABASE_URL: databaseUrl },
    { ALISTORE_EVIDENCE_DATABASE_CONFIRMED: '1' },
  ]) {
    assert.throws(
      () => resolveTrustedEvidenceDatabase(environment),
      /explicit|requires/u,
    );
  }

  assert.deepEqual(
    resolveTrustedEvidenceDatabase({
      ALISTORE_EVIDENCE_DATABASE_CONFIRMED: '1',
      TEST_DATABASE_URL: databaseUrl,
    }),
    {
      identity: 'postgresql://127.0.0.1:5432/alistore_evidence_gate0_a1_test',
      url: databaseUrl,
    },
  );
});

test('trusted evidence rejects shared, remote, credentialed, or rerouted databases', () => {
  const invalidUrls = [
    'postgresql://alistore@127.0.0.1:5432/alistore_test?schema=public',
    'postgresql://alistore@localhost:5432/alistore_evidence_gate0_test?schema=public',
    'postgresql://alistore:secret@127.0.0.1:5432/alistore_evidence_gate0_test?schema=public',
    'postgresql://claimant@127.0.0.1:5432/alistore_evidence_gate0_test?schema=public',
    'postgresql://alistore@127.0.0.1:5432/alistore_evidence_gate0_test?schema=public&host=remote',
    'postgresql://alistore@127.0.0.1:5432/claimant_test?schema=public',
  ];
  for (const databaseUrl of invalidUrls) {
    assert.throws(
      () => resolveTrustedEvidenceDatabase({
        ALISTORE_EVIDENCE_DATABASE_CONFIRMED: '1',
        TEST_DATABASE_URL: databaseUrl,
      }),
      /canonical, passwordless, loopback/u,
      databaseUrl,
    );
  }
});

test('trusted npm propagates only the validated test identity to database consumers', () => {
  const databaseUrl = 'postgresql://alistore@127.0.0.1:5432/alistore_evidence_gate0_b2_test?schema=public';
  const environment = trustedNpmEnvironment(
    { cliPath: '/trusted/npm-cli.js', scriptShellPath: '/bin/sh' },
    {
      ALISTORE_EVIDENCE_DATABASE_CONFIRMED: '1',
      DATABASE_URL: 'postgresql://claimant:secret@remote.invalid/production',
      HOME: '/tmp/trusted-home',
      TEST_DATABASE_URL: databaseUrl,
    },
  );

  assert.equal(environment.TEST_DATABASE_URL, databaseUrl);
  assert.equal(environment.E2E_DATABASE_URL, databaseUrl);
  assert.equal(
    environment.ALISTORE_EVIDENCE_DATABASE_IDENTITY,
    'postgresql://127.0.0.1:5432/alistore_evidence_gate0_b2_test',
  );
  assert.equal(environment.ALISTORE_EVIDENCE_DATABASE_CONFIRMED, '1');
  assert.equal(Object.hasOwn(environment, 'DATABASE_URL'), false);
  assert.equal(isTrustedEvidenceDatabaseIdentity(environment.ALISTORE_EVIDENCE_DATABASE_IDENTITY), true);
  assert.equal(isTrustedEvidenceDatabaseIdentity('postgresql://127.0.0.1:5432/alistore_test'), false);
  assert.equal(isTrustedEvidenceDatabaseIdentity('postgresql://remote.invalid:5432/alistore_evidence_gate0_b2_test'), false);
});

test('generator refuses a claimant-controlled browser path', () => {
  assert.doesNotThrow(() => assertSupportedToolchainLockPolicy(trackedLock));
  const tampered = structuredClone(trackedLock);
  tampered.runtime.browserPath = '/Applications/Claimant Browser.app/Contents/MacOS/browser';
  assert.throws(
    () => assertSupportedToolchainLockPolicy(tampered),
    /must pin \/Applications\/Google Chrome\.app/u,
  );
});

test('generator refuses an ambient Node that differs from the bootstrap hard pin', (t) => {
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-runtime-pin-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const bootstrapPath = path.join(fixture, 'run-trusted-ecosystem-node.sh');
  const manifestPath = path.join(fixture, 'node-runtime-manifest.sha256');
  const manifest = '';
  fs.writeFileSync(manifestPath, manifest);
  fs.writeFileSync(bootstrapPath, [
    `NODE='${fs.realpathSync(process.execPath)}'`,
    `NODE_SHA256='${sha256File(process.execPath)}'`,
    `MANIFEST_SHA256='${crypto.createHash('sha256').update(manifest).digest('hex')}'`,
    '',
  ].join('\n'));

  assert.throws(
    () => assertTrustedNodeRuntimePins({
      bootstrapPath,
      manifestPath,
      execPath: '/bin/sh',
    }),
    /Ambient Node executable does not match the bootstrap NODE pin/u,
  );
});

test('generator requires the manifest bytes to be the exact ambient runtime closure', (t) => {
  const pinnedNode = '/opt/homebrew/Cellar/node/25.9.0_3/bin/node';
  if (
    process.platform !== 'darwin'
    || !fs.existsSync(pinnedNode)
    || fs.realpathSync(process.execPath) !== fs.realpathSync(pinnedNode)
  ) {
    t.skip('the pinned macOS evidence runtime is not active');
    return;
  }
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-runtime-closure-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const bootstrapPath = path.join(fixture, 'run-trusted-ecosystem-node.sh');
  const manifestPath = path.join(fixture, 'node-runtime-manifest.sha256');
  const projectBootstrap = fs.readFileSync(
    path.join(projectRoot, 'scripts', 'run-trusted-ecosystem-node.sh'),
    'utf8',
  );
  const projectManifest = fs.readFileSync(
    path.join(projectRoot, 'scripts', 'node-runtime-manifest.sha256'),
    'utf8',
  );
  const alteredManifest = `${projectManifest}${'0'.repeat(64)}  /tmp/claimant-library\n`;
  fs.writeFileSync(manifestPath, alteredManifest);
  fs.writeFileSync(
    bootstrapPath,
    projectBootstrap.replace(
      /^MANIFEST_SHA256='[a-f0-9]{64}'$/mu,
      `MANIFEST_SHA256='${crypto.createHash('sha256').update(alteredManifest).digest('hex')}'`,
    ),
  );

  assert.throws(
    () => assertTrustedNodeRuntimePins({ bootstrapPath, manifestPath }),
    /must exactly match the ambient Node runtime closure/u,
  );
});

test('atomic lock write refuses a destination symlink swap and cleans its exact temporary', (t) => {
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-lock-symlink-swap-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const lockPath = path.join(fixture, 'ecosystem-toolchain-lock.json');
  const displacedLockPath = path.join(fixture, 'original-lock.json');
  const symlinkTargetPath = path.join(fixture, 'protected.json');
  const originalLock = '{"trusted":true}\n';
  const protectedBytes = '{"mustRemain":"unchanged"}\n';
  fs.writeFileSync(lockPath, originalLock);
  fs.writeFileSync(symlinkTargetPath, protectedBytes);

  let temporaryPath;
  assert.throws(
    () => writeToolchainLockAtomically(lockPath, '{"trusted":false}\n', {
      beforeRename(context) {
        temporaryPath = context.temporaryPath;
        fs.renameSync(lockPath, displacedLockPath);
        fs.symlinkSync(symlinkTargetPath, lockPath);
      },
    }),
    /Toolchain lock must remain a canonical regular file/u,
  );

  assert.equal(fs.readFileSync(displacedLockPath, 'utf8'), originalLock);
  assert.equal(fs.readFileSync(symlinkTargetPath, 'utf8'), protectedBytes);
  assert.equal(fs.lstatSync(lockPath).isSymbolicLink(), true);
  assert.equal(fs.existsSync(temporaryPath), false);
});

test('atomic lock write leaves the target untouched when interrupted before rename', (t) => {
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-lock-interrupt-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const lockPath = path.join(fixture, 'ecosystem-toolchain-lock.json');
  const originalLock = '{"trusted":true}\n';
  fs.writeFileSync(lockPath, originalLock);

  let temporaryPath;
  assert.throws(
    () => writeToolchainLockAtomically(lockPath, '{"trusted":false}\n', {
      beforeRename(context) {
        temporaryPath = context.temporaryPath;
        throw new Error('simulated interruption before rename');
      },
    }),
    /simulated interruption before rename/u,
  );

  assert.equal(fs.readFileSync(lockPath, 'utf8'), originalLock);
  assert.equal(fs.existsSync(temporaryPath), false);
});

test('atomic lock write detects a post-check temporary substitution and restores the target', (t) => {
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-lock-post-check-swap-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const lockPath = path.join(fixture, 'ecosystem-toolchain-lock.json');
  const displacedTemporaryPath = path.join(fixture, 'displaced-temporary.json');
  const originalLock = '{"trusted":true}\n';
  fs.writeFileSync(lockPath, originalLock);

  assert.throws(
    () => writeToolchainLockAtomically(lockPath, '{"trusted":"candidate"}\n', {
      afterTemporaryRevalidation({ temporaryPath }) {
        fs.renameSync(temporaryPath, displacedTemporaryPath);
        fs.writeFileSync(temporaryPath, '{"trusted":"claimant"}\n');
      },
    }),
    /does not match the fsynced temporary/u,
  );

  assert.equal(fs.readFileSync(lockPath, 'utf8'), originalLock);
  assert.equal(fs.readFileSync(displacedTemporaryPath, 'utf8'), '{"trusted":"candidate"}\n');
});

test('a package-lock byte change is reported without rewriting the trusted lock', (t) => {
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-package-lock-hash-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const packageLockPath = path.join(fixture, 'package-lock.json');
  fs.writeFileSync(packageLockPath, '{"lockfileVersion":3}\n');

  const expected = structuredClone(trackedLock);
  expected.packageLockSha256 = sha256File(packageLockPath);
  const expectedBytes = JSON.stringify(expected);
  fs.appendFileSync(packageLockPath, ' ');
  const generated = structuredClone(expected);
  generated.packageLockSha256 = sha256File(packageLockPath);

  assert.deepEqual(
    diffToolchainLocks(expected, generated).map((difference) => difference.path),
    ['packageLockSha256'],
  );
  assert.equal(JSON.stringify(expected), expectedBytes);
});

test('shared dependency hashing detects file and symlink tampering deterministically', (t) => {
  const fixture = fs.mkdtempSync(path.join(canonicalTmpDir, 'alistore-toolchain-hash-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fixture, 'package.js'), 'export const value = 1;\n');
  fs.symlinkSync('package.js', path.join(fixture, 'entry.js'));

  const first = hashDependencyTree(fixture);
  assert.equal(first, hashDependencyTree(fixture));
  assert.equal(
    sha256File(path.join(fixture, 'package.js')),
    crypto.createHash('sha256').update('export const value = 1;\n').digest('hex'),
  );

  fs.writeFileSync(path.join(fixture, 'package.js'), 'export const value = 2;\n');
  assert.notEqual(hashDependencyTree(fixture), first);
  fs.writeFileSync(path.join(fixture, 'package.js'), 'export const value = 1;\n');
  fs.unlinkSync(path.join(fixture, 'entry.js'));
  fs.symlinkSync('./package.js', path.join(fixture, 'entry.js'));
  assert.notEqual(hashDependencyTree(fixture), first);
});
