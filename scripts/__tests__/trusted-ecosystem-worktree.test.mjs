import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temporaryDirectory = fs.realpathSync(os.tmpdir());
const bootstrapSource = fs.readFileSync(
  path.join(projectRoot, 'scripts', 'run-trusted-ecosystem-node.sh'),
  'utf8',
);
const trustedGitSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'trusted-git.mjs'), 'utf8');
const evidenceRecorderSource = fs.readFileSync(
  path.join(projectRoot, 'scripts', 'record-ecosystem-evidence.mjs'),
  'utf8',
);
const systemGit = fs.realpathSync('/usr/bin/git');
const systemGitSha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(systemGit))
  .digest('hex');
const cleanGitEnvironment = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  HOME: temporaryDirectory,
  LANG: 'C',
  PATH: '/usr/bin:/bin',
  TMPDIR: temporaryDirectory,
};

const git = (cwd, args, options = {}) => execFileSync(
  systemGit,
  ['--no-replace-objects', ...args],
  { cwd, env: cleanGitEnvironment, encoding: 'utf8', ...options },
);

const write = (root, relativePath, contents) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

const commitAll = (root, message) => {
  git(root, ['add', '--all']);
  git(root, [
    '-c', 'user.name=AliStore Test',
    '-c', 'user.email=alistore-test@example.invalid',
    'commit', '-m', message,
  ]);
};

const sourceWithCommonDirectory = (source, commonDirectory) => {
  const anchored = source.replace(
    /\/Users\/alistore\/Desktop\/alistore-erp\/\.git/gu,
    () => commonDirectory,
  );
  assert.notEqual(anchored, source);
  return anchored;
};

const loadTrustedGit = async (commonDirectory) => {
  const source = sourceWithCommonDirectory(trustedGitSource, commonDirectory);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const createRepository = (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryDirectory, 'alistore-trusted-git-'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const mainRoot = path.join(temporaryRoot, 'main');
  const linkedRoot = path.join(temporaryRoot, 'linked');
  fs.mkdirSync(mainRoot);
  git(mainRoot, ['init', '--initial-branch=main']);

  write(mainRoot, 'scripts/ecosystem-toolchain-lock.json', `${JSON.stringify({
    schemaVersion: 3,
    runtime: {
      gitPath: systemGit,
      gitSha256: systemGitSha256,
    },
  }, null, 2)}\n`);
  write(
    mainRoot,
    'scripts/run-trusted-ecosystem-node.sh',
    sourceWithCommonDirectory(bootstrapSource, path.join(mainRoot, '.git')),
  );
  fs.copyFileSync(
    path.join(projectRoot, 'scripts', 'node-runtime-manifest.sha256'),
    path.join(mainRoot, 'scripts', 'node-runtime-manifest.sha256'),
  );
  write(mainRoot, 'scripts/trusted-git.mjs', 'export const marker = "trusted-git";\n');
  write(mainRoot, 'scripts/trusted-npm.mjs', 'export const marker = "trusted-npm";\n');
  write(mainRoot, 'scripts/toolchain-hashes.mjs', 'export const marker = "toolchain-hashes";\n');
  write(
    mainRoot,
    'scripts/ecosystem-contract-audit.mjs',
    'console.log(JSON.stringify({ marker: "main", cwd: process.cwd() }));\n',
  );
  write(
    mainRoot,
    'scripts/record-ecosystem-evidence.mjs',
    `import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = process.env.ALISTORE_TRUSTED_WORK_TREE;
if (process.env.ALISTORE_TEST_EVIDENCE_LOCKED !== '1') {
  const child = spawnSync('/usr/bin/lockf', [
    '-t', '0', path.join(root, '.test-evidence.lock'), process.execPath, fileURLToPath(import.meta.url),
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ALISTORE_TEST_EVIDENCE_LOCKED: '1',
      ALISTORE_TRUSTED_WORK_TREE: root,
    },
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  process.exit(child.status ?? 1);
}
console.log(JSON.stringify({ root, runtime: fileURLToPath(import.meta.url) }));
`,
  );
  commitAll(mainRoot, 'main audit');

  git(mainRoot, ['worktree', 'add', '--quiet', '-b', 'linked-test', linkedRoot]);
  write(
    linkedRoot,
    'scripts/ecosystem-contract-audit.mjs',
    'console.log(JSON.stringify({ marker: "linked", cwd: process.cwd() }));\n',
  );
  commitAll(linkedRoot, 'linked audit');
  return { linkedRoot, mainRoot };
};

const runBootstrapFrom = (
  bootstrapRoot,
  workTree,
  script = 'scripts/ecosystem-contract-audit.mjs',
) => spawnSync(
  '/bin/sh',
  [path.join(bootstrapRoot, 'scripts', 'run-trusted-ecosystem-node.sh'), script],
  { cwd: workTree, encoding: 'utf8', env: { ...process.env } },
);
const runBootstrap = (root) => runBootstrapFrom(root, root);

const assertBootstrapRejected = (root) => {
  const result = runBootstrap(root);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /"marker":"linked"/u);
};

test('main checkout and linked worktree resolve their own worktree and HEAD', async (t) => {
  const { linkedRoot, mainRoot } = createRepository(t);
  const trustedGit = await loadTrustedGit(path.join(mainRoot, '.git'));
  const mainGit = trustedGit.resolveTrustedGit(mainRoot);
  const linkedGit = trustedGit.resolveTrustedGit(linkedRoot);

  assert.equal(mainGit.workTree, fs.realpathSync(mainRoot));
  assert.equal(linkedGit.workTree, fs.realpathSync(linkedRoot));
  assert.notEqual(mainGit.gitDirectory, linkedGit.gitDirectory);
  assert.equal(mainGit.commonDirectory, linkedGit.commonDirectory);
  assert.notEqual(
    trustedGit.runTrustedGit(mainGit, mainRoot, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    trustedGit.runTrustedGit(linkedGit, linkedRoot, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  );

  const mainRun = runBootstrap(mainRoot);
  assert.equal(mainRun.status, 0, mainRun.stderr);
  assert.deepEqual(JSON.parse(mainRun.stdout), { marker: 'main', cwd: mainRoot });

  const linkedRun = runBootstrap(linkedRoot);
  assert.equal(linkedRun.status, 0, linkedRun.stderr);
  assert.deepEqual(JSON.parse(linkedRun.stdout), { marker: 'linked', cwd: linkedRoot });
});

test('committed-HEAD runbook binds the extracted bootstrap to the selected worktree', () => {
  const runbook = fs.readFileSync(path.join(projectRoot, 'docs', 'TRUSTED-ECOSYSTEM-GATE.md'), 'utf8');
  assert.match(
    runbook,
    /RESOLVED_GIT_DIR=[\s\S]*?--absolute-git-dir[\s\S]+\[ "\$RESOLVED_GIT_DIR" != "\$TRUSTED_GIT_DIR" \]/u,
  );
  assert.ok(
    runbook.indexOf('[ "$RESOLVED_GIT_DIR" != "$TRUSTED_GIT_DIR" ]') <
      runbook.indexOf('show HEAD:scripts/run-trusted-ecosystem-node.sh'),
  );
  assert.match(
    runbook,
    /cd "\$TRUSTED_WORK_TREE"\s*\n\s*\/bin\/sh "\$TRUSTED_BOOTSTRAP" scripts\/ecosystem-contract-audit\.mjs/u,
  );
});

test('committed recorder self-respawn preserves the bootstrap-validated worktree root', (t) => {
  assert.match(
    evidenceRecorderSource,
    /ALISTORE_EVIDENCE_LOCK_HELD: '1',[\s\S]*ALISTORE_TRUSTED_WORK_TREE: root,/u,
  );
  const { linkedRoot } = createRepository(t);
  const run = runBootstrapFrom(
    linkedRoot,
    linkedRoot,
    'scripts/record-ecosystem-evidence.mjs',
  );
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.root, linkedRoot);
  assert.notEqual(path.dirname(path.dirname(result.runtime)), linkedRoot);
});

test('bootstrap bytes from a different worktree HEAD fail closed', (t) => {
  const { linkedRoot, mainRoot } = createRepository(t);
  fs.appendFileSync(
    path.join(linkedRoot, 'scripts', 'run-trusted-ecosystem-node.sh'),
    '\n# linked-branch bootstrap bytes\n',
  );
  commitAll(linkedRoot, 'diverge linked bootstrap');

  const result = runBootstrapFrom(mainRoot, linkedRoot);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Bootstrap dependency differs from committed HEAD: scripts\/run-trusted-ecosystem-node\.sh/u,
  );
  assert.doesNotMatch(result.stdout, /"marker":"linked"/u);
});

test('same-byte dependency symlinked outside the selected worktree fails closed', (t) => {
  const { linkedRoot, mainRoot } = createRepository(t);
  const entrypoint = path.join(linkedRoot, 'scripts', 'ecosystem-contract-audit.mjs');
  const redirected = path.join(mainRoot, 'redirected-linked-audit.mjs');
  fs.copyFileSync(entrypoint, redirected);
  fs.unlinkSync(entrypoint);
  fs.symlinkSync(redirected, entrypoint);

  const result = runBootstrap(linkedRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Could not resolve a trusted canonical Git worktree/u);
  assert.doesNotMatch(result.stdout, /"marker":"linked"/u);
});

test('dirty shared toolchain hashing code is rejected before Node executes', (t) => {
  const { linkedRoot } = createRepository(t);
  fs.appendFileSync(
    path.join(linkedRoot, 'scripts', 'toolchain-hashes.mjs'),
    '// claimant-controlled hashing bypass\n',
  );

  const result = runBootstrap(linkedRoot);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Bootstrap dependency differs from committed HEAD: scripts\/toolchain-hashes\.mjs/u,
  );
  assert.doesNotMatch(result.stdout, /"marker":"linked"/u);
});

test('a worktree swap after verification cannot replace the committed runtime', async (t) => {
  const { linkedRoot } = createRepository(t);
  const bootstrapPath = path.join(linkedRoot, 'scripts', 'run-trusted-ecosystem-node.sh');
  const readyPath = path.join(linkedRoot, '.bootstrap-snapshot-ready');
  const releasePath = path.join(linkedRoot, '.bootstrap-snapshot-release');
  const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
  const coordinated = bootstrap.replace(
    'actual_node_sha256=',
    `: > "$ROOT/.bootstrap-snapshot-ready"\nwhile [ ! -f "$ROOT/.bootstrap-snapshot-release" ]; do /bin/sleep 0.01; done\nactual_node_sha256=`,
  );
  assert.notEqual(coordinated, bootstrap);
  fs.writeFileSync(bootstrapPath, coordinated);
  commitAll(linkedRoot, 'coordinate committed runtime test');

  let stdout = '';
  let stderr = '';
  const child = spawn(
    '/bin/sh',
    [bootstrapPath, 'scripts/ecosystem-contract-audit.mjs'],
    { cwd: linkedRoot, env: { ...process.env } },
  );
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const result = new Promise((resolve) => child.on('close', (status) => resolve({ status, stdout, stderr })));

  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(readyPath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(fs.existsSync(readyPath), 'bootstrap did not reach the post-snapshot checkpoint');
  fs.writeFileSync(
    path.join(linkedRoot, 'scripts', 'ecosystem-contract-audit.mjs'),
    'console.log(JSON.stringify({ marker: "claimant-swap", cwd: process.cwd() }));\n',
  );
  fs.writeFileSync(releasePath, 'release\n');

  const completed = await result;
  assert.equal(completed.status, 0, completed.stderr);
  assert.deepEqual(JSON.parse(completed.stdout), { marker: 'linked', cwd: linkedRoot });
  assert.doesNotMatch(completed.stdout, /claimant-swap/u);
});

test('valid hostile repository metadata cannot replace the pinned common Git directory', async (t) => {
  const victim = createRepository(t);
  const hostile = createRepository(t);
  const trustedGit = await loadTrustedGit(path.join(victim.mainRoot, '.git'));
  const hostileAudit =
    'console.log(JSON.stringify({ marker: "hostile", cwd: process.cwd() }));\n';
  write(hostile.linkedRoot, 'scripts/ecosystem-contract-audit.mjs', hostileAudit);
  commitAll(hostile.linkedRoot, 'hostile audit');

  const hostileGitDirectory = git(
    hostile.linkedRoot,
    ['rev-parse', '--absolute-git-dir'],
  ).trim();
  fs.writeFileSync(
    path.join(hostileGitDirectory, 'gitdir'),
    `${path.join(victim.linkedRoot, '.git')}\n`,
  );
  fs.writeFileSync(
    path.join(victim.linkedRoot, '.git'),
    `gitdir: ${hostileGitDirectory}\n`,
  );
  write(victim.linkedRoot, 'scripts/ecosystem-contract-audit.mjs', hostileAudit);

  assert.throws(() => trustedGit.resolveTrustedGit(victim.linkedRoot), /Git does not match/u);
  const result = runBootstrap(victim.linkedRoot);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /"marker":"hostile"/u);
});

test('mismatched linked-worktree .git pointer fails closed', async (t) => {
  const { linkedRoot, mainRoot } = createRepository(t);
  const trustedGit = await loadTrustedGit(path.join(mainRoot, '.git'));
  fs.writeFileSync(path.join(linkedRoot, '.git'), `gitdir: ${path.join(mainRoot, '.git')}\n`);

  assert.throws(() => trustedGit.resolveTrustedGit(linkedRoot), /Git does not match/u);
  assertBootstrapRejected(linkedRoot);
});

test('malformed linked-worktree commondir fails closed', async (t) => {
  const { linkedRoot, mainRoot } = createRepository(t);
  const trustedGit = await loadTrustedGit(path.join(mainRoot, '.git'));
  const gitDirectory = git(linkedRoot, ['rev-parse', '--absolute-git-dir']).trim();
  fs.writeFileSync(path.join(gitDirectory, 'commondir'), '../..\nunexpected metadata\n');

  assert.throws(() => trustedGit.resolveTrustedGit(linkedRoot), /Git does not match/u);
  assertBootstrapRejected(linkedRoot);
});

test('mismatched linked-worktree backpointer fails closed', async (t) => {
  const { linkedRoot, mainRoot } = createRepository(t);
  const trustedGit = await loadTrustedGit(path.join(mainRoot, '.git'));
  const gitDirectory = git(linkedRoot, ['rev-parse', '--absolute-git-dir']).trim();
  fs.writeFileSync(path.join(gitDirectory, 'gitdir'), `${path.join(mainRoot, '.git')}\n`);

  assert.throws(() => trustedGit.resolveTrustedGit(linkedRoot), /Git does not match/u);
  assertBootstrapRejected(linkedRoot);
});
