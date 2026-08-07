import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  acquireProductionWorkerActivationLock,
  activateProductionWorker,
  archiveGitRevision,
  assertArchivedReleaseHasNoSecrets,
  assertNoEscapingSymlinks,
  buildWorkerReleaseManifest,
  finalizeWorkerRelease,
  prepareWorkerRelease,
  durablyWriteFile,
  inspectCleanSource,
  loadLaunchdWorkerEnvironment,
  parseProductionWorkerIdentity,
  pruneWorkerReleases,
  removeReadOnlyWorkerRelease,
  removeWorkerEnvironmentSnapshot,
  renderProductionWorkerPlist,
  validateWorkerEnvironmentContract,
  verifyWorkerRelease,
  verifyWorkerEnvironmentSnapshot,
  waitUntilWorkerReady,
  writeWorkerEnvironmentSnapshot,
  writeWorkerReleaseManifest,
} from '../activate-production-worker.mjs';

const projectRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const revision = 'a'.repeat(40);
const instanceId = '11111111-2222-4333-8444-555555555555';
const previousRevision = 'b'.repeat(40);
const previousInstanceId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const execFile = promisify(execFileCallback);

function missing() {
  return Object.assign(new Error('missing'), { code: 'ENOENT' });
}

function okResponse(responseRevision = revision, responseInstanceId = instanceId) {
  return {
    status: 200,
    headers: {
      get: (name) => ({
        'x-alistore-revision': responseRevision,
        'x-alistore-worker-instance': responseInstanceId,
      })[name.toLowerCase()] ?? null,
    },
  };
}

function defaults(overrides = {}) {
  return {
    projectRoot,
    inspectSource: async () => ({ revision }),
    acquireActivationLock: async () => async () => {},
    loadEnvironment: async () => ({
      NODE_ENV: 'production',
      PROCESS_ROLE: 'worker',
      APPLE_REVOCATION_RELAY_ENABLED: 'true',
      REFUND_RELAY_ENABLED: 'false',
      DATABASE_URL: 'postgresql://runtime-db',
    }),
    createInstanceId: () => instanceId,
    prepareRelease: async ({ releaseRoot }) => `${releaseRoot}.new-${process.pid}`,
    finalizeRelease: async () => {},
    verifyRelease: async () => {},
    pruneReleases: async () => {},
    pruneSnapshots: async () => {},
    writeSnapshot: async ({ runtimeConfigRoot, revision: releaseRevision, instanceId: releaseInstanceId, environment }) => ({
      path: join(runtimeConfigRoot, `${releaseRevision}-${releaseInstanceId}.json`),
      sha256: 'e'.repeat(64),
      environment,
    }),
    verifySnapshot: async ({ environment }) => environment,
    removeSnapshot: async () => {},
    replacePlist: async () => {},
    writeDurable: async () => {},
    isRunning: async () => true,
    ...overrides,
  };
}

test('worker plist renders stable paths, revision, and public instance ID without secrets', async () => {
  const template = await readFile(`${projectRoot}/scripts/com.alistore.worker.plist`, 'utf8');
  const plist = renderProductionWorkerPlist(template, {
    nodePath: '/opt/node & tools/bin/node',
    projectRoot: '/srv/AliStore & Production',
    revision,
    instanceId,
    releaseRoot: '/Users/operator/Library/Application Support/AliStore/worker-releases/release-one',
    modulePath: '/release/apps/api/node_modules:/release/node_modules',
    workerPath: '/Users/operator/.local/bin:/usr/bin:/bin',
    environmentSnapshotPath: '/Users/operator/Library/Application Support/AliStore/runtime-config/snapshot.json',
    environmentSnapshotSha256: 'e'.repeat(64),
  });

  assert.match(plist, /<string>\/opt\/node &amp; tools\/bin\/node<\/string>/u);
  assert.match(plist, /worker-releases\/release-one\/apps\/api\/dist\/worker\.js<\/string>/u);
  assert.match(plist, /<string>\/release\/apps\/api\/node_modules:\/release\/node_modules<\/string>/u);
  assert.match(plist, /<string>\/Users\/operator\/\.local\/bin:\/usr\/bin:\/bin<\/string>/u);
  assert.match(plist, new RegExp(`<key>RENDER_GIT_COMMIT</key>\\s*<string>${revision}</string>`, 'u'));
  assert.match(plist, new RegExp(`<key>ALISTORE_WORKER_INSTANCE_ID</key>\\s*<string>${instanceId}</string>`, 'u'));
  assert.match(plist, /<key>PROCESS_ROLE<\/key>\s*<string>worker<\/string>/u);
  assert.match(plist, /<key>APPLE_REVOCATION_RELAY_ENABLED<\/key>\s*<string>true<\/string>/u);
  assert.match(plist, /<key>REFUND_RELAY_ENABLED<\/key>\s*<string>false<\/string>/u);
  assert.doesNotMatch(
    plist,
    /__[A-Z0-9_]+__/u,
  );
  assert.doesNotMatch(
    plist,
    /<key>(?:APPLE_PRIVATE_KEY|APPLE_KEY_ID|DATABASE_URL|JWT_SECRET|REDIS_URL|SMTP_PASSWORD)<\/key>/u,
  );
});

test('plist public controls match the canonical launchd environment contract', async () => {
  const contract = validateWorkerEnvironmentContract(JSON.parse(await readFile(
    join(projectRoot, 'apps', 'api', 'src', 'config', 'production-worker-environment.json'),
    'utf8',
  )));
  const plist = await readFile(join(projectRoot, 'scripts', 'com.alistore.worker.plist'), 'utf8');
  for (const [key, value] of Object.entries(contract.forcedEnvironment)) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>${value}</string>`, 'u'));
  }
  assert.throws(
    () => validateWorkerEnvironmentContract({ ...contract, safeOsKeys: ['HOME', 'HOME'] }),
    /Invalid production worker environment contract/u,
  );
});

test('release keeps pinned dev gates until migration, then strips the peer-retained Prisma CLI before sealing', async () => {
  const releaseRoot = '/releases/revision-instance';
  const commands = [];
  const archives = [];
  const moves = [];
  const checked = [];
  const audited = [];
  const sealed = [];
  const finalizationEvents = [];
  const removeRelease = async () => {};
  const staged = await prepareWorkerRelease({
    projectRoot: '/srv/alistore',
    releaseRoot,
    revision,
    instanceId,
    nodePath: '/opt/node',
    buildEnvironment: { HOME: '/Users/operator', PATH: '/usr/bin:/bin' },
    run: async (command, args, options) => commands.push([command, args, options]),
    archive: async (...args) => archives.push(args),
    makeDirectory: async () => {},
    removeRelease,
    assertExists: async (path) => {
      if (path === releaseRoot) throw missing();
      checked.push(path);
    },
    auditSymlinks: async (path) => audited.push(path),
    assertNoSecrets: async () => {},
  });

  await finalizeWorkerRelease({
    releaseRoot,
    stagedRelease: staged,
    revision,
    instanceId,
    nodePath: '/opt/node',
    buildEnvironment: { HOME: '/Users/operator', PATH: '/usr/bin:/bin' },
    run: async (command, args, options) => {
      commands.push([command, args, options]);
      finalizationEvents.push(args[0]);
    },
    move: async (...args) => {
      moves.push(args);
      finalizationEvents.push('move');
    },
    removePath: async (path, options) => {
      finalizationEvents.push(['remove', path, options]);
    },
    removeRelease,
    assertExists: async (path) => checked.push(path),
    assertMissing: async (path) => {
      checked.push(`missing:${path}`);
      finalizationEvents.push(['missing', path]);
    },
    auditSymlinks: async (path) => audited.push(path),
    assertNoSecrets: async () => {},
    sealRelease: async (options) => {
      sealed.push(options);
      finalizationEvents.push('seal');
    },
  });

  assert.deepEqual(archives, [['/srv/alistore', revision, staged]]);
  assert.deepEqual(commands.map(([command, args]) => [command, args]), [
    ['gitleaks', ['dir', '--redact', '--no-banner', staged]],
    ['npm', ['ci', '--include=dev', '--workspace', '@alistore/api', '--include-workspace-root']],
    ['npm', ['run', 'prisma:generate', '-w', '@alistore/api']],
    ['npm', ['run', 'build', '-w', '@alistore/api']],
    ['npm', ['prune', '--omit=dev', '--workspace', '@alistore/api', '--include-workspace-root']],
  ]);
  assert.equal(commands.every(([, , options]) => options.cwd === staged), true);
  assert.deepEqual(checked, [
    `${staged}/apps/api/dist/worker.js`,
    `${staged}/node_modules/@prisma/client`,
    `${staged}/node_modules/.prisma/client`,
    `${staged}/node_modules/.bin/ts-node`,
    `${staged}/node_modules/.bin/prisma`,
    `missing:${staged}/node_modules/.bin/ts-node`,
    `missing:${staged}/node_modules/.bin/prisma`,
    `missing:${staged}/node_modules/prisma`,
    `${staged}/apps/api/dist/worker.js`,
    `${staged}/node_modules/@prisma/client`,
    `${staged}/node_modules/.prisma/client`,
  ]);
  assert.deepEqual(moves, [[staged, releaseRoot]]);
  assert.deepEqual(audited, [staged, staged, staged]);
  assert.deepEqual(sealed, [{
    releaseRoot: staged,
    revision,
    instanceId,
    nodePath: '/opt/node',
  }]);
  assert.deepEqual(finalizationEvents, [
    'prune',
    ['remove', `${staged}/node_modules/.bin/prisma`, { force: true }],
    ['remove', `${staged}/node_modules/prisma`, { force: true, recursive: true }],
    ['missing', `${staged}/node_modules/.bin/ts-node`],
    ['missing', `${staged}/node_modules/.bin/prisma`],
    ['missing', `${staged}/node_modules/prisma`],
    'seal',
    'move',
  ]);
});

test('git archive refuses tracked secrets and excludes untracked workspace links without copying bytes', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'alistore-worker-archive-fixture-'));
  const destination = join(fixture, 'release');
  const externalSecret = join(fixture, 'external-secret.txt');
  try {
    await execFile('git', ['init', '-q'], { cwd: fixture });
    await execFile('git', ['config', 'user.email', 'test@example.invalid'], { cwd: fixture });
    await execFile('git', ['config', 'user.name', 'Test'], { cwd: fixture });
    await mkdir(join(fixture, 'apps', 'api'), { recursive: true });
    await writeFile(join(fixture, 'package.json'), '{"private":true}\n');
    await writeFile(join(fixture, 'apps', 'api', 'safe.txt'), 'tracked-safe\n');
    await writeFile(join(fixture, 'apps', 'api', '.env.production'), 'JWT_SECRET=tracked-secret-bytes\n');
    await writeFile(join(fixture, 'apps', 'api', '.env.production.example'), 'EXAMPLE=public\n');
    await execFile('git', ['add', '-f', '.'], { cwd: fixture });
    await execFile('git', ['commit', '-qm', 'fixture'], { cwd: fixture });
    const unsafeRevision = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();
    await assert.rejects(
      archiveGitRevision(fixture, unsafeRevision, destination),
      (error) => error.message.includes('.env.production')
        && !error.message.includes('tracked-secret-bytes'),
    );
    await execFile('git', ['rm', '-q', 'apps/api/.env.production'], { cwd: fixture });
    await execFile('git', ['commit', '-qm', 'remove secret path'], { cwd: fixture });
    const fixtureRevision = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();

    await writeFile(externalSecret, 'untracked-secret-bytes\n');
    await mkdir(join(fixture, 'node_modules', '@alistore'), { recursive: true });
    await symlink(externalSecret, join(fixture, 'node_modules', '@alistore', 'api'));
    await writeFile(join(fixture, 'apps', 'api', '.env.production.local'), 'JWT_SECRET=local-secret-bytes\n');

    await archiveGitRevision(fixture, fixtureRevision, destination);
    assert.equal(await readFile(join(destination, 'apps', 'api', 'safe.txt'), 'utf8'), 'tracked-safe\n');
    assert.equal(
      await readFile(join(destination, 'apps', 'api', '.env.production.example'), 'utf8'),
      'EXAMPLE=public\n',
    );
    for (const forbiddenPath of [
      join(destination, 'apps', 'api', '.env.production'),
      join(destination, 'apps', 'api', '.env.production.local'),
      join(destination, 'node_modules', '@alistore', 'api'),
    ]) {
      await assert.rejects(readFile(forbiddenPath), { code: 'ENOENT' });
    }
    await assertArchivedReleaseHasNoSecrets(destination);
    assert.doesNotMatch(
      await readFile(join(destination, 'apps', 'api', 'safe.txt'), 'utf8'),
      /secret-bytes/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('git archive allowlists only the exact tracked Ed25519 public issuer key without exposing key bytes', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'alistore-worker-public-key-fixture-'));
  const destination = join(fixture, 'release');
  const approvedPath = join(fixture, 'config', 'supply-release-cert-issuer.pem');
  const otherPemPath = join(fixture, 'config', 'other-issuer.pem');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ format: 'pem', type: 'spki' });
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const privatePayloadMarker = privatePem.toString('utf8').split('\n')[1];
  try {
    await execFile('git', ['init', '-q'], { cwd: fixture });
    await execFile('git', ['config', 'user.email', 'test@example.invalid'], { cwd: fixture });
    await execFile('git', ['config', 'user.name', 'Test'], { cwd: fixture });
    await mkdir(join(fixture, 'config'), { recursive: true });
    await writeFile(join(fixture, 'package.json'), '{"private":true}\n');
    await writeFile(approvedPath, publicPem);
    await execFile('git', ['add', '.'], { cwd: fixture });
    await execFile('git', ['commit', '-qm', 'approved public issuer'], { cwd: fixture });
    const approvedRevision = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();

    await archiveGitRevision(fixture, approvedRevision, destination);
    await assertArchivedReleaseHasNoSecrets(destination);

    await writeFile(approvedPath, privatePem);
    await execFile('git', ['commit', '-qam', 'reject private issuer'], { cwd: fixture });
    const privateRevision = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();
    await assert.rejects(
      archiveGitRevision(fixture, privateRevision, join(fixture, 'private-release')),
      (error) => error.message.includes('config/supply-release-cert-issuer.pem')
        && !error.message.includes(privatePayloadMarker),
    );

    await writeFile(approvedPath, publicPem);
    await writeFile(otherPemPath, publicPem);
    await execFile('git', ['add', '.'], { cwd: fixture });
    await execFile('git', ['commit', '-qm', 'reject other pem'], { cwd: fixture });
    const otherPemRevision = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();
    await assert.rejects(
      archiveGitRevision(fixture, otherPemRevision, join(fixture, 'other-pem-release')),
      (error) => error.message.includes('config/other-issuer.pem')
        && !error.message.includes(privatePayloadMarker),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public issuer allowlist rejects trailing private DER before and after archive without exposing payload', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'alistore-worker-trailing-der-fixture-'));
  const approvedRelativePath = 'config/supply-release-cert-issuer.pem';
  const approvedPath = join(fixture, approvedRelativePath);
  const extractedRoot = join(fixture, 'post-extract');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const trailingBody = Buffer.concat([publicDer, privateDer]).toString('base64');
  const trailingPem = [
    '-----BEGIN PUBLIC KEY-----',
    ...(trailingBody.match(/.{1,64}/gu) ?? []),
    '-----END PUBLIC KEY-----',
    '',
  ].join('\n');
  const privatePayloadMarker = trailingBody.slice(-24);
  try {
    await execFile('git', ['init', '-q'], { cwd: fixture });
    await execFile('git', ['config', 'user.email', 'test@example.invalid'], { cwd: fixture });
    await execFile('git', ['config', 'user.name', 'Test'], { cwd: fixture });
    await mkdir(join(fixture, 'config'), { recursive: true });
    await writeFile(join(fixture, 'package.json'), '{"private":true}\n');
    await writeFile(approvedPath, trailingPem);
    await execFile('git', ['add', '.'], { cwd: fixture });
    await execFile('git', ['commit', '-qm', 'trailing private der'], { cwd: fixture });
    const maliciousRevision = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();

    await assert.rejects(
      archiveGitRevision(fixture, maliciousRevision, join(fixture, 'release')),
      (error) => error.message.includes(approvedRelativePath)
        && !error.message.includes(privatePayloadMarker),
    );

    await mkdir(join(extractedRoot, 'config'), { recursive: true });
    await writeFile(join(extractedRoot, approvedRelativePath), trailingPem);
    await assert.rejects(
      assertArchivedReleaseHasNoSecrets(extractedRoot),
      (error) => error.message.includes(approvedRelativePath)
        && !error.message.includes(privatePayloadMarker),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('release executable resolves API-local dependencies before root versions', async () => {
  const release = await mkdtemp(join(tmpdir(), 'alistore-worker-resolution-fixture-'));
  try {
    const worker = join(release, 'apps', 'api', 'dist', 'worker.js');
    const apiRxjs = join(release, 'apps', 'api', 'node_modules', 'rxjs');
    const rootRxjs = join(release, 'node_modules', 'rxjs');
    await mkdir(join(release, 'apps', 'api', 'dist'), { recursive: true });
    await mkdir(apiRxjs, { recursive: true });
    await mkdir(rootRxjs, { recursive: true });
    await writeFile(worker, 'module.exports = {};\n');
    await writeFile(join(apiRxjs, 'package.json'), '{"name":"rxjs","version":"7.8.1"}\n');
    await writeFile(join(rootRxjs, 'package.json'), '{"name":"rxjs","version":"7.8.2"}\n');

    const resolved = createRequire(worker).resolve('rxjs/package.json');
    assert.match(resolved, /\/apps\/api\/node_modules\/rxjs\/package\.json$/u);
    assert.doesNotMatch(resolved, /fixture-[^/]+\/node_modules\/rxjs\/package\.json$/u);
    assert.equal(JSON.parse(await readFile(resolved, 'utf8')).version, '7.8.1');
  } finally {
    await rm(release, { recursive: true, force: true });
  }
});

test('immutable release audit rejects dependency symlinks that escape the bundle', async () => {
  const releaseRoot = await mkdtemp(join(tmpdir(), 'alistore-worker-release-audit-'));
  try {
    await mkdir(join(releaseRoot, 'node_modules', 'safe'), { recursive: true });
    await symlink('safe', join(releaseRoot, 'node_modules', 'internal-link'));
    await assertNoEscapingSymlinks(releaseRoot);

    await symlink('/srv/mutable-checkout/apps/api', join(releaseRoot, 'node_modules', 'external-link'));
    await assert.rejects(
      assertNoEscapingSymlinks(releaseRoot),
      /escaping symlink/u,
    );
  } finally {
    await rm(releaseRoot, { recursive: true, force: true });
  }
});

test('secret audit allows examples but rejects real env paths without reading their bytes', async () => {
  const release = await mkdtemp(join(tmpdir(), 'alistore-worker-secret-audit-'));
  try {
    await writeFile(join(release, '.env.production.example'), 'PUBLIC_PLACEHOLDER=true\n');
    await assertArchivedReleaseHasNoSecrets(release);
    await writeFile(join(release, '.env.production'), 'DO_NOT_REPORT_THIS_VALUE\n');
    await assert.rejects(
      assertArchivedReleaseHasNoSecrets(release),
      (error) => error.message.includes('.env.production')
        && !error.message.includes('DO_NOT_REPORT_THIS_VALUE'),
    );
  } finally {
    await rm(release, { recursive: true, force: true });
  }
});

test('redacted gitleaks gate rejects tracked private-key content before npm without exposing bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alistore-worker-gitleaks-'));
  const releasesRoot = join(root, 'worker-releases');
  const releaseRoot = join(releasesRoot, `${revision}-${instanceId}`);
  const { stdout: privateBytes } = await execFile(
    'openssl',
    ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048'],
  );
  const privatePayload = privateBytes.split('\n')[1];
  const commands = [];
  try {
    await assert.rejects(
      prepareWorkerRelease({
        projectRoot: root,
        releaseRoot,
        revision,
        instanceId,
        nodePath: process.execPath,
        buildEnvironment: { PATH: process.env.PATH },
        archive: async (_root, _revision, destination) => {
          await mkdir(destination, { recursive: true });
          await writeFile(join(destination, 'neutral-notes.txt'), privateBytes);
        },
        auditSymlinks: async () => {},
        run: async (command, args, options) => {
          commands.push(command);
          if (command === 'gitleaks') await execFile(command, args, options);
          else assert.fail('npm must not run after the scanner rejects tracked source');
        },
      }),
      (error) => !error.message.includes(privatePayload),
    );
    assert.deepEqual(commands, ['gitleaks']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release manifest detects tampering in installed dependency JavaScript', async () => {
  const release = await mkdtemp(join(tmpdir(), 'alistore-worker-manifest-fixture-'));
  try {
    const files = {
      worker: join(release, 'apps', 'api', 'dist', 'worker.js'),
      schema: join(release, 'apps', 'api', 'prisma', 'schema.prisma'),
      dependency: join(release, 'node_modules', 'dependency', 'index.js'),
      dependencyPackage: join(release, 'node_modules', 'dependency', 'package.json'),
    };
    for (const path of Object.values(files)) await mkdir(join(path, '..'), { recursive: true });
    await mkdir(join(release, 'apps', 'api', 'node_modules'), { recursive: true });
    await writeFile(files.worker, 'module.exports = "worker";\n');
    await writeFile(files.schema, 'datasource db { provider = "postgresql" }\n');
    await writeFile(files.dependency, 'module.exports = "original";\n');
    await writeFile(files.dependencyPackage, '{"name":"dependency","version":"1.0.0"}\n');
    await writeFile(join(release, 'package.json'), '{"private":true}\n');
    await writeFile(join(release, 'package-lock.json'), '{"lockfileVersion":3}\n');
    await writeFile(join(release, 'apps', 'api', 'package.json'), '{"name":"@alistore/api"}\n');
    const manifest = await writeWorkerReleaseManifest({ releaseRoot: release, revision, instanceId, nodePath: process.execPath });
    assert.equal(manifest.runtime.nodeSha256, createHash('sha256').update(await readFile(process.execPath)).digest('hex'));
    await verifyWorkerRelease({ releaseRoot: release, revision, instanceId, nodePath: process.execPath });

    const dependencyMode = (await stat(files.dependency)).mode & 0o777;
    await chmod(files.dependency, 0o777);
    await assert.rejects(
      verifyWorkerRelease({ releaseRoot: release, revision, instanceId, nodePath: process.execPath }),
      /integrity verification failed/u,
    );
    await chmod(files.dependency, dependencyMode);
    await writeFile(files.dependency, 'module.exports = "tampered";\n');
    await assert.rejects(
      verifyWorkerRelease({ releaseRoot: release, revision, instanceId, nodePath: process.execPath }),
      /integrity verification failed/u,
    );
  } finally {
    await rm(release, { recursive: true, force: true });
  }
});

test('durable plist write fsyncs content and parent before success', async () => {
  const events = [];
  let opens = 0;
  await durablyWriteFile({
    target: '/LaunchAgents/com.alistore.worker.plist',
    content: '<plist/>',
    lint: async (path) => events.push(['lint', path]),
    openFile: async (path, flags) => {
      opens += 1;
      events.push(['open', path, flags]);
      return {
        writeFile: async (content) => events.push(['write', content]),
        sync: async () => events.push([opens === 1 ? 'file-sync' : 'directory-sync']),
        close: async () => events.push([opens === 1 ? 'file-close' : 'directory-close']),
      };
    },
    move: async (from, to) => events.push(['rename', from, to]),
    remove: async () => assert.fail('successful durable write must not clean a partial file'),
  });
  assert.deepEqual(events.map(([event]) => event), [
    'open', 'write', 'file-sync', 'file-close', 'lint', 'rename',
    'open', 'directory-sync', 'directory-close',
  ]);
});

test('partial durable plist write never renames and cleans its unique temporary file', async () => {
  const removed = [];
  let moved = false;
  await assert.rejects(
    durablyWriteFile({
      target: '/LaunchAgents/com.alistore.worker.plist.previous',
      content: '<plist>partial</plist>',
      openFile: async () => ({
        writeFile: async () => { throw new Error('disk full'); },
        sync: async () => {},
        close: async () => {},
      }),
      move: async () => { moved = true; },
      remove: async (path) => removed.push(path),
    }),
    /disk full/u,
  );
  assert.equal(moved, false);
  assert.equal(removed.length, 1);
  assert.match(removed[0], /\.previous\.new-\d+-[0-9a-f-]+$/u);
});

test('read-only nested releases are removed only through exact scoped targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alistore-worker-readonly-cleanup-'));
  const releasesRoot = join(root, 'worker-releases');
  const target = join(releasesRoot, `${revision}-${instanceId}`);
  const nested = join(target, 'node_modules', 'dependency');
  try {
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, 'index.js'), 'module.exports = true;\n');
    await chmod(join(nested, 'index.js'), 0o400);
    await chmod(nested, 0o500);
    await chmod(join(target, 'node_modules'), 0o500);
    await chmod(target, 0o500);
    await removeReadOnlyWorkerRelease({ releasesRoot, target });
    await assert.rejects(access(target), { code: 'ENOENT' });

    await assert.rejects(
      removeReadOnlyWorkerRelease({ releasesRoot, target: releasesRoot }),
      /unsafe worker release target/u,
    );
    await assert.rejects(
      removeReadOnlyWorkerRelease({ releasesRoot, target: join(root, `${revision}-${instanceId}`) }),
      /unsafe worker release target/u,
    );
    await assert.rejects(
      removeReadOnlyWorkerRelease({ releasesRoot: '/', target: `/${revision}-${instanceId}` }),
      /unsafe worker release target/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rename failure cleans a sealed read-only staged release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alistore-worker-rename-cleanup-'));
  const releasesRoot = join(root, 'worker-releases');
  const releaseRoot = join(releasesRoot, `${revision}-${instanceId}`);
  const staged = `${releaseRoot}.new-${process.pid}`;
  try {
    await mkdir(join(staged, 'nested'), { recursive: true });
    await writeFile(join(staged, 'nested', 'runtime.js'), 'runtime\n');
    await assert.rejects(
      finalizeWorkerRelease({
        releaseRoot,
        stagedRelease: staged,
        revision,
        instanceId,
        nodePath: process.execPath,
        buildEnvironment: {},
        run: async () => {},
        assertExists: async () => {},
        assertMissing: async () => {},
        auditSymlinks: async () => {},
        assertNoSecrets: async () => {},
        sealRelease: async () => {
          await chmod(join(staged, 'nested', 'runtime.js'), 0o400);
          await chmod(join(staged, 'nested'), 0o500);
          await chmod(staged, 0o500);
        },
        move: async () => { throw new Error('rename blocked'); },
      }),
      /rename blocked/u,
    );
    await assert.rejects(access(staged), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('environment snapshot is durable, private, multiline-safe, and safely removable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alistore-worker-env-snapshot-'));
  const runtimeConfigRoot = join(root, 'runtime-config');
  try {
    const snapshot = await writeWorkerEnvironmentSnapshot({
      runtimeConfigRoot,
      revision,
      instanceId,
      environment: { APPLE_PRIVATE_KEY: 'line-one\nline-two', DATABASE_URL: 'postgresql://db' },
    });
    assert.equal((await stat(runtimeConfigRoot)).mode & 0o777, 0o700);
    assert.equal((await stat(snapshot.path)).mode & 0o777, 0o600);
    assert.equal((await verifyWorkerEnvironmentSnapshot(snapshot)).APPLE_PRIVATE_KEY, 'line-one\nline-two');
    await assert.rejects(
      removeWorkerEnvironmentSnapshot({ runtimeConfigRoot, target: join(root, 'outside.json') }),
      /unsafe worker environment snapshot/u,
    );
    await removeWorkerEnvironmentSnapshot({ runtimeConfigRoot, target: snapshot.path });
    await assert.rejects(access(snapshot.path), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release retention never deletes the installed or rollback target', async () => {
  const current = `${revision}-${instanceId}`;
  const previous = `${previousRevision}-${previousInstanceId}`;
  const obsolete = `${'c'.repeat(40)}-99999999-8888-4777-8666-555555555555`;
  const removed = [];
  await pruneWorkerReleases({
    releasesRoot: '/releases',
    preserve: [`/releases/${current}`, `/releases/${previous}`],
    retain: 1,
    list: async () => [obsolete, previous, current],
    inspect: async (path) => ({ isDirectory: () => true, mtimeMs: path.includes(obsolete) ? 3 : 1 }),
    removeRelease: async ({ target }) => removed.push(target),
  });
  assert.deepEqual(removed, []); // newest obsolete is retained in addition to both protected targets

  await pruneWorkerReleases({
    releasesRoot: '/releases',
    preserve: [`/releases/${current}`, `/releases/${previous}`],
    retain: 0,
    list: async () => [obsolete, previous, current],
    inspect: async () => ({ isDirectory: () => true, mtimeMs: 1 }),
    removeRelease: async ({ target }) => removed.push(target),
  });
  assert.deepEqual(removed, [`/releases/${obsolete}`]);
});

test('dirty source inspection refuses both tracked and untracked state before revision lookup', async () => {
  for (const status of [' M apps/api/src/worker.ts\n', '?? scripts/untracked-release-file.mjs\n']) {
    const calls = [];
    await assert.rejects(
      inspectCleanSource(projectRoot, async (_command, args) => {
        calls.push(args);
        return { stdout: status };
      }),
      /dirty worktree/u,
    );
    assert.deepEqual(calls, [['status', '--porcelain=v1', '--untracked-files=all']]);
  }
});

test('atomic activation lock refuses an overlapping live owner', async () => {
  const lockDirectory = await mkdtemp(join(tmpdir(), 'alistore-worker-lock-test-'));
  try {
    const release = await acquireProductionWorkerActivationLock({ lockDirectory });
    await assert.rejects(
      acquireProductionWorkerActivationLock({ lockDirectory }),
      /lock is live/u,
    );
    await release();
    const releaseAgain = await acquireProductionWorkerActivationLock({ lockDirectory });
    await releaseAgain();
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
  }
});

test('failed strict worker preflight releases the lock without build or launchd changes', async () => {
  const calls = [];
  let released = false;
  await assert.rejects(
    activateProductionWorker(defaults({
      acquireActivationLock: async () => async () => { released = true; },
      run: async (command, args, options) => {
        calls.push([command, ...args]);
        if (args.includes('preflight')) {
          assert.equal(options.env.NODE_ENV, 'production');
          assert.equal(options.env.PROCESS_ROLE, 'worker');
          assert.equal(options.env.APPLE_REVOCATION_RELAY_ENABLED, 'true');
          assert.equal(options.env.REFUND_RELAY_ENABLED, 'false');
          throw new Error('worker preflight blocked');
        }
      },
      write: async () => {},
      isLoaded: async () => assert.fail('launchd must not be queried'),
    })),
    /worker preflight blocked/u,
  );

  assert.equal(calls.some((call) => call.includes('preflight')), true);
  assert.equal(calls.some((call) => call.includes('db:deploy')), false);
  assert.equal(released, true);
});

test('snapshot tampering is rejected before database deployment', async () => {
  const calls = [];
  let verifications = 0;
  await assert.rejects(
    activateProductionWorker(defaults({
      verifySnapshot: async ({ environment }) => {
        verifications += 1;
        if (verifications === 3) throw new Error('snapshot integrity verification failed');
        return environment;
      },
      run: async (command, args) => calls.push([command, ...args]),
    })),
    /snapshot integrity verification failed/u,
  );
  assert.equal(calls.some((call) => call.includes('preflight')), true);
  assert.equal(calls.some((call) => call.includes('db:deploy')), false);
});

test('source revision is rechecked before release preparation or migration', async () => {
  let inspections = 0;
  const calls = [];
  await assert.rejects(
    activateProductionWorker(defaults({
      inspectSource: async () => {
        inspections += 1;
        return { revision: inspections === 1 ? revision : previousRevision };
      },
      run: async (command, args) => calls.push([command, ...args]),
      prepareRelease: async () => assert.fail('release must not be created'),
    })),
    /git revision changed during preparation/u,
  );
  assert.equal(inspections, 2);
  assert.equal(calls.some((call) => call.includes('db:deploy')), false);
});

test('release install or build failure happens before preflight and database mutation', async () => {
  const calls = [];
  await assert.rejects(
    activateProductionWorker(defaults({
      run: async (command, args) => calls.push([command, ...args]),
      prepareRelease: async () => { throw new Error('scoped npm ci failed'); },
      write: async () => {},
      remove: async () => {},
      makeTemporaryDirectory: async () => '/tmp/alistore-worker-agent-test',
    })),
    /scoped npm ci failed/u,
  );
  assert.equal(calls.some((call) => call.includes('preflight')), false);
  assert.equal(calls.some((call) => call.includes('db:deploy')), false);
});

test('database deployment receives precedence-resolved production runtime environment', async () => {
  const envRoot = await mkdtemp(join(tmpdir(), 'alistore-worker-env-test-'));
  await mkdir(join(envRoot, 'apps', 'api', 'src', 'config'), { recursive: true });
  await writeFile(
    join(envRoot, 'apps', 'api', 'src', 'config', 'production-worker-environment.json'),
    await readFile(join(projectRoot, 'apps', 'api', 'src', 'config', 'production-worker-environment.json')),
  );
  const localEnv = join(envRoot, 'apps', 'api', '.env.production.local');
  const snapshotA = join(envRoot, 'snapshot-a.env');
  const snapshotB = join(envRoot, 'snapshot-b.env');
  await writeFile(
    snapshotA,
    'DATABASE_URL=postgresql://local-secret\nDIRECT_DATABASE_URL=postgresql://local-direct-secret\nJWT_SECRET=local-file-secret\nLOCAL_ONLY=present\n',
  );
  await writeFile(snapshotB, 'DATABASE_URL=postgresql://mutated-after-capture\nJWT_SECRET=mutated\n');
  await symlink(snapshotA, localEnv);
  await writeFile(
    join(envRoot, 'apps', 'api', '.env.production'),
    'DATABASE_URL=postgresql://committed-fallback\nPRODUCTION_ONLY=present\n',
  );
  await writeFile(
    join(envRoot, '.env.production.local'),
    'DATABASE_URL=postgresql://root-must-not-win\nJWT_SECRET=root-must-not-win\n',
  );
  const childEnvironments = [];
  try {
    await activateProductionWorker(defaults({
      run: async (command, args, options) => {
        if (command === 'npm' && (args.includes('preflight') || args.includes('db:deploy'))) {
          childEnvironments.push(options.env);
          if (args.includes('preflight')) {
            await rm(localEnv, { force: true });
            await symlink(snapshotB, localEnv);
          }
        }
      },
      loadEnvironment: ({ revision: selectedRevision, instanceId: selectedInstance, modulePath }) => (
        loadLaunchdWorkerEnvironment({
          projectRoot: envRoot,
          base: {
            HOME: '/Users/operator',
            DATABASE_URL: 'postgresql://shell-must-not-win',
            DIRECT_DATABASE_URL: 'postgresql://shell-direct-must-not-win',
            JWT_SECRET: 'shell-must-not-win',
          },
          revision: selectedRevision,
          instanceId: selectedInstance,
          modulePath,
        })
      ),
      write: async () => {},
      remove: async () => {},
      move: async () => {},
      makeDirectory: async () => {},
      makeTemporaryDirectory: async () => '/tmp/alistore-worker-agent-test',
      isLoaded: async () => false,
      fetchImpl: async () => okResponse(),
    }));
  } finally {
    await rm(envRoot, { recursive: true, force: true });
  }

  assert.equal(childEnvironments.length, 2);
  for (const environment of childEnvironments) {
    assert.equal(environment.NODE_ENV, 'production');
    assert.equal(environment.DATABASE_URL, 'postgresql://local-secret');
    assert.equal(environment.DIRECT_DATABASE_URL, 'postgresql://local-direct-secret');
    assert.equal(environment.JWT_SECRET, 'local-file-secret');
    assert.equal(environment.LOCAL_ONLY, 'present');
    assert.equal(environment.PRODUCTION_ONLY, 'present');
  }
});

test('green gates activate the exact revision and instance after build and database deploy', async () => {
  const calls = [];
  const commandOptions = [];
  const writes = [];
  const replacements = [];
  const durableMarkers = [];
  let inspections = 0;
  const result = await activateProductionWorker(defaults({
    userHome: '/tmp/alistore-worker-test-home',
    uid: 501,
    nodePath: '/opt/alistore/node',
    inspectSource: async () => { inspections += 1; return { revision }; },
    run: async (command, args, options) => {
      calls.push([command, ...args]);
      commandOptions.push({ args, options });
    },
    isLoaded: async () => true,
    write: async (...args) => writes.push(args),
    replacePlist: async (input) => replacements.push(input),
    writeDurable: async (input) => durableMarkers.push(input),
    remove: async () => {},
    makeDirectory: async () => {},
    makeTemporaryDirectory: async () => '/tmp/alistore-worker-agent-test',
    fetchImpl: async () => okResponse(),
  }));

  assert.equal(result.activated, true);
  assert.equal(result.revision, revision);
  assert.equal(result.instanceId, instanceId);
  assert.equal(inspections, 6); // initial and every boundary through final launchd mutation
  assert.match(replacements[0].content, new RegExp(`<string>${instanceId}</string>`, 'u'));
  assert.equal(
    parseProductionWorkerIdentity(replacements[0].content).executablePath,
    `/tmp/alistore-worker-test-home/Library/Application Support/AliStore/worker-releases/${revision}-${instanceId}/apps/api/dist/worker.js`,
  );
  assert.equal(String(durableMarkers[0].content), 'ALISTORE_NO_PREVIOUS_PLIST\n');
  assert.deepEqual(calls, [
    ['/usr/bin/plutil', '-lint', '/tmp/alistore-worker-agent-test/com.alistore.worker.plist'],
    ['npm', 'run', 'preflight', '-w', '@alistore/api', '--', '--environment-snapshot', `/tmp/alistore-worker-test-home/Library/Application Support/AliStore/runtime-config/${revision}-${instanceId}.json`, 'e'.repeat(64), '--strict'],
    ['npm', 'run', 'db:deploy', '-w', '@alistore/api'],
    ['/bin/launchctl', 'bootout', 'gui/501/com.alistore.worker'],
    ['/bin/launchctl', 'bootstrap', 'gui/501', '/tmp/alistore-worker-test-home/Library/LaunchAgents/com.alistore.worker.plist'],
    ['/bin/launchctl', 'kickstart', '-k', 'gui/501/com.alistore.worker'],
  ]);
  const immutableReleaseRoot = `/tmp/alistore-worker-test-home/Library/Application Support/AliStore/worker-releases/${revision}-${instanceId}.new-${process.pid}`;
  for (const { args, options } of commandOptions.filter(({ args }) => (
    args.includes('preflight') || args.includes('db:deploy')
  ))) {
    assert.equal(options.cwd, immutableReleaseRoot);
    assert.equal(options.env.NODE_ENV, 'production');
  }
});

test('stale same-revision heartbeat from an earlier activation is rejected', async () => {
  await assert.rejects(
    waitUntilWorkerReady({
      fetchImpl: async () => okResponse(revision, previousInstanceId),
      revision,
      instanceId,
      service: 'gui/501/com.alistore.worker',
      isRunning: async () => true,
      attempts: 1,
    }),
    new RegExp(`did not become ready at ${revision}/${instanceId}`, 'u'),
  );
});

test('one-shot worker crash is rejected even after writing the exact heartbeat', async () => {
  let runningChecks = 0;
  await assert.rejects(
    waitUntilWorkerReady({
      fetchImpl: async () => okResponse(),
      revision,
      instanceId,
      service: 'gui/501/com.alistore.worker',
      isRunning: async () => {
        runningChecks += 1;
        return false;
      },
      attempts: 1,
    }),
    /did not become ready/u,
  );
  assert.equal(runningChecks, 1);
});

function rollbackHarness({ rollbackHealthy }) {
  const installed = '/tmp/alistore-worker-test-home/Library/LaunchAgents/com.alistore.worker.plist';
  const backup = `${installed}.previous`;
  const previousReleaseRoot = `/tmp/alistore-worker-test-home/Library/Application Support/AliStore/worker-releases/${previousRevision}-${previousInstanceId}`;
  const previousPlist = renderProductionWorkerPlist(
    `<?xml version="1.0"?><plist><dict>
      <key>ProgramArguments</key><array>
        <string>__NODE_PATH__</string><string>__WORKER_RELEASE_ROOT__/apps/api/dist/worker.js</string>
      </array>
      <key>RENDER_GIT_COMMIT</key><string>__GIT_REVISION__</string>
      <key>ALISTORE_WORKER_INSTANCE_ID</key><string>__WORKER_INSTANCE_ID__</string>
      <key>ALISTORE_WORKER_ENV_SNAPSHOT_PATH</key><string>__WORKER_ENV_SNAPSHOT_PATH__</string>
      <key>ALISTORE_WORKER_ENV_SNAPSHOT_SHA256</key><string>__WORKER_ENV_SNAPSHOT_SHA256__</string>
    </dict></plist>`,
    {
      nodePath: '/old/node',
      projectRoot: '/old/root',
      revision: previousRevision,
      instanceId: previousInstanceId,
      releaseRoot: previousReleaseRoot,
      modulePath: `${previousReleaseRoot}/apps/api/node_modules:${previousReleaseRoot}/node_modules`,
      workerPath: '/Users/operator/.local/bin:/usr/bin:/bin',
      environmentSnapshotPath: `/tmp/alistore-worker-test-home/Library/Application Support/AliStore/runtime-config/${previousRevision}-${previousInstanceId}.json`,
      environmentSnapshotSha256: 'd'.repeat(64),
    },
  );
  const previousBytes = Buffer.from(previousPlist);
  const files = new Map([[installed, previousBytes]]);
  const removed = [];
  let fetchCount = 0;
  const read = async (path, encoding) => {
    if (files.has(path)) {
      const value = files.get(path);
      return encoding ? value.toString(encoding) : value;
    }
    if (path.startsWith(projectRoot)) return readFile(path, encoding);
    throw missing();
  };
  return {
    installed,
    backup,
    previousBytes,
    files,
    removed,
    options: defaults({
      userHome: '/tmp/alistore-worker-test-home',
      uid: 501,
      run: async () => {},
      read,
      write: async () => {},
      replacePlist: async ({ target, content }) => (
        files.set(target, Buffer.isBuffer(content) ? content : Buffer.from(content))
      ),
      writeDurable: async ({ target, content }) => (
        files.set(target, Buffer.isBuffer(content) ? content : Buffer.from(content))
      ),
      remove: async (path) => { removed.push(path); files.delete(path); },
      removeRelease: async ({ target }) => { removed.push(target); },
      makeDirectory: async () => {},
      makeTemporaryDirectory: async () => '/tmp/alistore-worker-agent-test',
      isLoaded: async () => true,
      fetchImpl: async () => {
        fetchCount += 1;
        if (fetchCount === 1) return okResponse(revision, previousInstanceId);
        return rollbackHealthy
          ? okResponse(previousRevision, previousInstanceId)
          : okResponse(revision, instanceId);
      },
      readinessAttempts: 1,
    }),
  };
}

test('rollback claims restoration only after the previous revision and instance are healthy', async () => {
  const harness = rollbackHarness({ rollbackHealthy: true });
  await assert.rejects(
    activateProductionWorker(harness.options),
    /previous agent restored and verified/u,
  );
  assert.deepEqual(harness.files.get(harness.installed), harness.previousBytes);
  assert.equal(
    parseProductionWorkerIdentity(harness.files.get(harness.installed).toString()).executablePath,
    `/tmp/alistore-worker-test-home/Library/Application Support/AliStore/worker-releases/${previousRevision}-${previousInstanceId}/apps/api/dist/worker.js`,
  );
  assert.equal(harness.files.has(harness.backup), false);
  assert.equal(
    harness.removed.includes(`/tmp/alistore-worker-test-home/Library/Application Support/AliStore/worker-releases/${revision}-${instanceId}`),
    true,
  );
  assert.equal(
    harness.removed.includes(`/tmp/alistore-worker-test-home/Library/Application Support/AliStore/worker-releases/${previousRevision}-${previousInstanceId}`),
    false,
  );
});

test('unverified rollback reports incomplete and preserves the durable backup', async () => {
  const harness = rollbackHarness({ rollbackHealthy: false });
  await assert.rejects(
    activateProductionWorker(harness.options),
    /rollback incomplete \(1 failure\(s\)\); backup preserved/u,
  );
  assert.deepEqual(harness.files.get(harness.installed), harness.previousBytes);
  assert.deepEqual(harness.files.get(harness.backup), harness.previousBytes);
});

test('failed database deployment never touches launchd or the installed plist', async () => {
  const calls = [];
  const writes = [];
  await assert.rejects(
    activateProductionWorker(defaults({
      run: async (command, args) => {
        calls.push([command, ...args]);
        if (command === 'npm' && args.includes('db:deploy')) throw new Error('migration blocked');
      },
      write: async (...args) => writes.push(args),
      remove: async () => {},
      makeTemporaryDirectory: async () => '/tmp/alistore-worker-agent-test',
      makeDirectory: async () => assert.fail('LaunchAgents must not be created'),
      isLoaded: async () => assert.fail('launchd must not be queried'),
    })),
    /migration blocked/u,
  );
  assert.equal(writes.length, 1);
  assert.equal(calls.some((call) => call[0] === '/bin/launchctl'), false);
});

test('dry run renders and lints without database or launchd mutation', async () => {
  const calls = [];
  const result = await activateProductionWorker(defaults({
    run: async (command, args) => calls.push([command, ...args]),
    write: async () => {},
    remove: async () => {},
    makeTemporaryDirectory: async () => '/tmp/alistore-worker-agent-test',
    makeDirectory: async () => assert.fail('LaunchAgents must not be created'),
    isLoaded: async () => assert.fail('launchd must not be queried'),
    dryRun: true,
  }));
  assert.equal(result.activated, false);
  assert.equal(calls.some((call) => call.includes('db:deploy')), false);
  assert.equal(calls.some((call) => call[0] === '/bin/launchctl'), false);
});

test('dry run leaves no read-only staged release residue on the real filesystem', async () => {
  const userHome = await mkdtemp(join(tmpdir(), 'alistore-worker-dry-run-home-'));
  let staged;
  try {
    const result = await activateProductionWorker(defaults({
      userHome,
      run: async () => {},
      prepareRelease: async ({ releaseRoot }) => {
        staged = `${releaseRoot}.new-${process.pid}`;
        await mkdir(join(staged, 'nested'), { recursive: true });
        await writeFile(join(staged, 'nested', 'runtime.js'), 'runtime\n');
        await chmod(join(staged, 'nested', 'runtime.js'), 0o400);
        await chmod(join(staged, 'nested'), 0o500);
        await chmod(staged, 0o500);
        return staged;
      },
      dryRun: true,
    }));
    assert.equal(result.reason, 'dry-run');
    await assert.rejects(access(staged), { code: 'ENOENT' });
  } finally {
    await rm(userHome, { recursive: true, force: true });
  }
});

test('root package exposes the bounded worker activation command', async () => {
  const packageJson = JSON.parse(await readFile(`${projectRoot}/package.json`, 'utf8'));
  assert.equal(
    packageJson.scripts['launch:activate:worker'],
    'node scripts/activate-production-worker.mjs',
  );
  assert.match(
    await readFile(join(projectRoot, 'apps', 'api', 'scripts', 'deploy-database.mjs'), 'utf8'),
    /run\('npx', \['--no-install', 'prisma', 'migrate', 'deploy'\]\)/u,
  );
});
