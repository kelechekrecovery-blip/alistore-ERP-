#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectHeadWorktree, resolveTrustedGit, trustedGitArgs } from './trusted-git.mjs';
import { resolveTrustedNpm, trustedNpmEnvironment, verifyTrustedBootstrap } from './trusted-npm.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gateId = process.argv[2];
const gateScripts = new Map([
  ['ios-app-ui', 'ios:ui'],
  ['android-app-ui', 'android:ui'],
  ['pos-refund-reconciliation', 'ecosystem:pos-refund:e2e'],
  ['courier-cod-reconciliation', 'ecosystem:courier-cod:e2e'],
  ['service-loaner-reconciliation', 'ecosystem:service-loaner:e2e'],
  ['procurement-sale-reconciliation', 'ecosystem:procurement-sale:e2e'],
  ['reconciled-e2e', 'ecosystem:e2e'],
]);
const evidencePath = path.join(root, 'docs', 'acceptance', 'ecosystem-evidence.json');
const artifactDirectory = path.join(root, 'docs', 'acceptance', 'artifacts');
verifyTrustedBootstrap(root);
const npm = resolveTrustedNpm(root);
const trustedGit = resolveTrustedGit(root);
const sourcePaths = [
  'apps',
  'e2e',
  'scripts',
  'design_handoff_alistore/screens',
  'package.json',
  'package-lock.json',
  'playwright.config.ts',
];

if (!gateScripts.has(gateId)) {
  console.error(`Use the committed-HEAD command in docs/TRUSTED-ECOSYSTEM-GATE.md with <${[...gateScripts.keys()].join('|')}>.`);
  process.exit(2);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const git = (args, options = {}) => execFileSync(
  trustedGit.executablePath,
  trustedGitArgs(trustedGit, root, args),
  { cwd: root, encoding: 'utf8', env: trustedGit.environment, ...options },
);
const sourceHeadStatus = () => inspectHeadWorktree(trustedGit, root, sourcePaths);
const evidenceHeadStatus = () => inspectHeadWorktree(trustedGit, root, [
  'docs/acceptance/ecosystem-evidence.json',
  'docs/acceptance/artifacts',
]);
const sourceTreeSha256 = () => {
  const hash = crypto.createHash('sha256');
  for (const file of sourceHeadStatus().files) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  }
  return hash.digest('hex');
};
const dirtySource = () =>
  git(['status', '--porcelain', '--untracked-files=all', '--', ...sourcePaths]).trim();
const dirtyEvidence = () =>
  git([
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--',
    'docs/acceptance/ecosystem-evidence.json',
    'docs/acceptance/artifacts',
  ]).trim();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJsonAtomic = (targetPath, value) => {
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, json(value));
  fs.renameSync(temporaryPath, targetPath);
};
const assertSafeDirectory = (directoryPath) => {
  const repositoryRoot = fs.realpathSync(root);
  const relativeDirectory = path.relative(root, directoryPath);
  let cursor = root;
  for (const segment of relativeDirectory.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Refusing to write evidence through symlink: ${cursor}`);
    }
  }
  fs.mkdirSync(directoryPath, { recursive: true });
  const resolved = fs.realpathSync(directoryPath);
  const expectedAcceptanceRoot = path.join(repositoryRoot, 'docs', 'acceptance');
  if (!resolved.startsWith(`${expectedAcceptanceRoot}${path.sep}`)) {
    throw new Error('Evidence artifact directory resolves outside docs/acceptance.');
  }
};
const commandOutput = (command, args, env = process.env) => {
  const output = execFileSync(command, args, { encoding: 'utf8', stderr: 'pipe', env }).trim();
  if (!output) throw new Error(`Could not identify evidence toolchain: ${command}`);
  return output;
};
const executionEnvironment = () => ({
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  gitPath: trustedGit.executablePath,
  gitSha256: trustedGit.executableSha256,
  npmCliPath: npm.cliPath,
  npmCliSha256: npm.cliSha256,
  npmTreeSha256: npm.npmTreeSha256,
  scriptShellPath: npm.scriptShellPath,
  scriptShellSha256: npm.scriptShellSha256,
  nodePath: npm.nodePath,
  nodeSha256: npm.nodeSha256,
  nodeKegSha256: npm.nodeKegSha256,
  nodeRuntimeLibrariesSha256: npm.nodeRuntimeLibrariesSha256,
  browserPath: npm.browserPath,
  browserSha256: npm.browserSha256,
  browserAppTreeSha256: npm.browserAppTreeSha256,
  packageLockSha256: npm.packageLockSha256,
  nodeModulesTreeSha256: npm.nodeModulesTreeSha256,
  playwrightCliPath: npm.playwrightCliPath,
  playwrightCliSha256: npm.playwrightCliSha256,
  playwrightShim: npm.playwrightShim,
  jestCliPath: npm.jestCliPath,
  jestCliSha256: npm.jestCliSha256,
  jestShim: npm.jestShim,
  acceptanceDatabaseIdentity: npm.acceptanceDatabaseIdentity,
  toolchain:
    gateId === 'ios-app-ui'
      ? commandOutput('xcodebuild', ['-version'], {
          ...process.env,
          DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
        })
      : gateId === 'android-app-ui'
        ? commandOutput(path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, 'platform-tools', 'adb'), ['version'])
        : commandOutput(process.execPath, ['--version']),
});

if (process.env.ALISTORE_EVIDENCE_LOCK_HELD !== '1') {
  const lockPath = path.resolve(root, git(['rev-parse', '--git-path', 'ecosystem-evidence.lock']).trim());
  const lockedRun = spawnSync(
    '/usr/bin/lockf',
    ['-t', '0', lockPath, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      cwd: root,
      env: {
        ...trustedNpmEnvironment(npm),
        ALISTORE_EVIDENCE_LOCK_HELD: '1',
        ALISTORE_TRUSTED_BOOTSTRAP_FD: '3',
      },
      shell: false,
      stdio: ['inherit', 'inherit', 'inherit', 3],
    },
  );
  process.exit(lockedRun.status ?? 1);
}

if (dirtySource()) {
  console.error('Refusing to record evidence from a dirty source tree. Commit or remove source changes first.');
  process.exit(1);
}
if (!sourceHeadStatus().matches) {
  console.error('Refusing to record evidence when scoped files differ from HEAD or use special index flags.');
  process.exit(1);
}
if (dirtyEvidence()) {
  console.error('Refusing to overwrite uncommitted acceptance evidence. Commit or remove it first.');
  process.exit(1);
}
if (!evidenceHeadStatus().matches) {
  console.error('Refusing to record evidence when the manifest or existing artifacts differ from HEAD.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const gate = evidence.gates?.[gateId];
const packageScript = gate?.packageScript;
const packageCommand = packageJson.scripts?.[packageScript];
const expectedPackageScript = gateScripts.get(gateId);
if (
  !packageScript ||
  packageScript !== expectedPackageScript ||
  packageScript.startsWith('-') ||
  !packageCommand
) {
  console.error(`Gate ${gateId} does not reference an executable package script.`);
  process.exit(1);
}

assertSafeDirectory(artifactDirectory);
const beforeHash = sourceTreeSha256();
const sourceCommit = git(['rev-list', '-1', 'HEAD', '--', ...sourcePaths]).trim();
const directRunner = gateId === 'reconciled-e2e'
  ? path.join(root, 'scripts', 'run-reconciled-ecosystem-e2e.mjs')
  : null;
const executionCommand = directRunner
  ? `${process.execPath} ${path.relative(root, directRunner)}`
  : `npm run ${packageScript}`;
const run = spawnSync(
  process.execPath,
  directRunner ? [directRunner] : [npm.cliPath, 'run', '--', packageScript],
  {
    cwd: root,
    env: trustedNpmEnvironment(npm),
    shell: false,
    stdio: 'inherit',
  },
);
if (run.status !== 0) {
  console.error(`Gate ${gateId} failed; no evidence was recorded.`);
  process.exit(run.status ?? 1);
}
if (dirtySource() || !sourceHeadStatus().matches || sourceTreeSha256() !== beforeHash) {
  console.error('Source tree changed while the gate was running; no evidence was recorded.');
  process.exit(1);
}
const npmAfterRun = resolveTrustedNpm(root);
if (JSON.stringify(npmAfterRun) !== JSON.stringify(npm)) {
  console.error('The verified test toolchain changed while the gate was running; no evidence was recorded.');
  process.exit(1);
}
const gitAfterRun = resolveTrustedGit(root);
if (
  gitAfterRun.executablePath !== trustedGit.executablePath ||
  gitAfterRun.executableSha256 !== trustedGit.executableSha256 ||
  gitAfterRun.gitDirectory !== trustedGit.gitDirectory
) {
  console.error('The verified Git toolchain changed while the gate was running; no evidence was recorded.');
  process.exit(1);
}

assertSafeDirectory(artifactDirectory);
const environment = executionEnvironment();
const result = {
  schemaVersion: 1,
  gate: gateId,
  command: `npm run ${packageScript}`,
  executionCommand,
  exitCode: 0,
  packageCommandSha256: sha256(packageCommand),
  sourceTreeSha256: beforeHash,
  sourceCommit,
  executionEnvironment: environment,
  executionEnvironmentSha256: sha256(JSON.stringify(environment)),
  completedAt: new Date().toISOString(),
};
const resultBytes = json(result);
const resultSha256 = sha256(resultBytes);
const relativeArtifactPath = `docs/acceptance/artifacts/${gateId}-${resultSha256}.json`;
const artifactPath = path.join(root, relativeArtifactPath);
fs.writeFileSync(artifactPath, resultBytes, { flag: 'wx' });
gate.status = 'accepted';
gate.command = result.command;
gate.artifacts = [
  {
    kind: 'result',
    path: relativeArtifactPath,
    sha256: resultSha256,
  },
];
writeJsonAtomic(evidencePath, evidence);
console.log(`Recorded ${gateId} result for source tree ${beforeHash}.`);
