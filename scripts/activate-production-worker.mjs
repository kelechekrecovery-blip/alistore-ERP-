#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { acquireBackupLock } from './production-postgres-backup.mjs';

const execFile = promisify(execFileCallback);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerEnvironmentContractPath = join(
  'apps',
  'api',
  'src',
  'config',
  'production-worker-environment.json',
);

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.quiet ? 'ignore' : 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

export async function loadLaunchdWorkerEnvironment({
  projectRoot,
  base = process.env,
  revision,
  instanceId,
  modulePath,
  read = readFile,
  contract: suppliedContract,
}) {
  const contract = suppliedContract ?? validateWorkerEnvironmentContract(JSON.parse(
    await read(join(projectRoot, workerEnvironmentContractPath), 'utf8'),
  ));
  const environment = {};
  for (const key of contract.safeOsKeys) {
    if (base[key] !== undefined) environment[key] = base[key];
  }
  Object.assign(environment, contract.forcedEnvironment, {
    NODE_PATH: modulePath,
    RENDER_GIT_COMMIT: revision,
    ALISTORE_WORKER_INSTANCE_ID: instanceId,
  });
  for (const name of ['.env.production.local', '.env.production']) {
    let parsed;
    try {
      parsed = dotenv.parse(await read(join(projectRoot, 'apps', 'api', name), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw new Error(`Unable to read apps/api/${name}`);
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (environment[key] === undefined) environment[key] = value;
    }
  }
  return environment;
}

export function validateWorkerEnvironmentContract(contract) {
  const validKeys = (value) => Array.isArray(value)
    && value.length > 0
    && new Set(value).size === value.length
    && value.every((key) => typeof key === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(key));
  const forcedEntries = contract?.forcedEnvironment && typeof contract.forcedEnvironment === 'object'
    ? Object.entries(contract.forcedEnvironment)
    : [];
  if (
    !contract
    || typeof contract.launchdMarker !== 'string'
    || !validKeys(contract.safeOsKeys)
    || !validKeys(contract.plistIdentityKeys)
    || forcedEntries.length === 0
    || forcedEntries.some(([key, value]) => (
      !/^[A-Z][A-Z0-9_]*$/u.test(key) || typeof value !== 'string'
    ))
    || contract.forcedEnvironment[contract.launchdMarker] !== 'true'
    || !contract.plistIdentityKeys.includes('NODE_PATH')
    || !contract.plistIdentityKeys.includes('RENDER_GIT_COMMIT')
    || !contract.plistIdentityKeys.includes('ALISTORE_WORKER_INSTANCE_ID')
    || !contract.plistIdentityKeys.includes('ALISTORE_WORKER_ENV_SNAPSHOT_PATH')
    || !contract.plistIdentityKeys.includes('ALISTORE_WORKER_ENV_SNAPSHOT_SHA256')
  ) {
    throw new Error('Invalid production worker environment contract');
  }
  return contract;
}

function canonicalEnvironmentSnapshot(environment) {
  const entries = Object.entries(environment)
    .filter(([, value]) => typeof value === 'string')
    .sort(([left], [right]) => left.localeCompare(right));
  return `${JSON.stringify(Object.fromEntries(entries))}\n`;
}

export async function verifyWorkerEnvironmentSnapshot({ path, sha256, read = readFile }) {
  if (!/^[0-9a-f]{64}$/iu.test(sha256)) {
    throw new Error('Production worker environment snapshot hash is invalid');
  }
  let bytes;
  try {
    bytes = await read(path);
  } catch {
    throw new Error(`Production worker environment snapshot is unavailable at ${path}`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256.toLowerCase()) {
    throw new Error(`Production worker environment snapshot integrity verification failed at ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`Production worker environment snapshot is invalid at ${path}`);
  }
  if (
    !parsed
    || Array.isArray(parsed)
    || typeof parsed !== 'object'
    || Object.entries(parsed).some(([key, value]) => (
      !/^[A-Z][A-Z0-9_]*$/u.test(key) || typeof value !== 'string'
    ))
  ) {
    throw new Error(`Production worker environment snapshot is invalid at ${path}`);
  }
  return parsed;
}

export async function writeWorkerEnvironmentSnapshot({
  runtimeConfigRoot,
  revision,
  instanceId,
  environment,
  writeDurable = durablyWriteFile,
  makeDirectory = mkdir,
  setMode = chmod,
  removeSnapshot = removeWorkerEnvironmentSnapshot,
}) {
  const path = join(runtimeConfigRoot, `${revision}-${instanceId}.json`);
  await makeDirectory(runtimeConfigRoot, { recursive: true, mode: 0o700 });
  await setMode(runtimeConfigRoot, 0o700);
  const content = canonicalEnvironmentSnapshot(environment);
  const sha256 = createHash('sha256').update(content).digest('hex');
  await writeDurable({ target: path, content, mode: 0o600 });
  try {
    const parsed = await verifyWorkerEnvironmentSnapshot({ path, sha256 });
    return { path, sha256, environment: parsed };
  } catch (error) {
    await removeSnapshot({ runtimeConfigRoot, target: path }).catch(() => undefined);
    throw error;
  }
}

function applyWorkerPublicControls({ environment, contract, identity }) {
  Object.assign(environment, identity, contract.forcedEnvironment);
  return environment;
}

export async function inspectCleanSource(projectRoot, execute = execFile) {
  const status = await execute(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: projectRoot },
  );
  if (status.stdout.trim()) {
    throw new Error('Refusing production worker activation from a dirty worktree.');
  }
  const revision = (await execute('git', ['rev-parse', 'HEAD'], { cwd: projectRoot })).stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error(`Refusing to activate an invalid git revision: ${revision || 'empty'}`);
  }
  return { revision };
}

export async function acquireProductionWorkerActivationLock({
  lockDirectory = join(tmpdir(), 'alistore-production-worker-activation'),
} = {}) {
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 });
  return acquireBackupLock(lockDirectory, new Date(), { purpose: 'production-worker-activation' });
}

const workerReleaseDirectoryNamePattern = /^[0-9a-f]{40}-[0-9a-f-]{16,128}$/iu;

function stagedWorkerReleasePath(releaseRoot) {
  return `${releaseRoot}.new-${process.pid}`;
}

export async function removeReadOnlyWorkerRelease({
  releasesRoot,
  target,
  inspect = lstat,
  list = readdir,
  setMode = chmod,
  remove = rm,
}) {
  const resolvedRoot = resolve(releasesRoot);
  const resolvedTarget = resolve(target);
  const name = relative(resolvedRoot, resolvedTarget);
  const finalName = workerReleaseDirectoryNamePattern.test(name);
  const stagedName = new RegExp(
    `^(?:${workerReleaseDirectoryNamePattern.source.slice(1, -1)})\\.new-[0-9]+$`,
    'iu',
  ).test(name);
  if (
    resolvedRoot === dirname(resolvedRoot)
    || dirname(resolvedTarget) !== resolvedRoot
    || (!finalName && !stagedName)
  ) {
    throw new Error(`Refusing to remove an unsafe worker release target: ${target}`);
  }

  const restoreOwnerAccess = async (path) => {
    let details;
    try {
      details = await inspect(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    if (details.isSymbolicLink()) return true;
    if (details.isDirectory()) {
      await setMode(path, details.mode | 0o700);
      for (const child of await list(path)) await restoreOwnerAccess(join(path, child));
    } else {
      await setMode(path, details.mode | 0o600);
    }
    return true;
  };

  if (await restoreOwnerAccess(resolvedTarget)) {
    await remove(resolvedTarget, { recursive: true, force: true });
  }
}

export async function removeWorkerEnvironmentSnapshot({
  runtimeConfigRoot,
  target,
  remove = rm,
}) {
  const resolvedRoot = resolve(runtimeConfigRoot);
  const resolvedTarget = resolve(target);
  const name = relative(resolvedRoot, resolvedTarget);
  if (
    resolvedRoot === dirname(resolvedRoot)
    || dirname(resolvedTarget) !== resolvedRoot
    || !new RegExp(`^(?:${workerReleaseDirectoryNamePattern.source.slice(1, -1)})\\.json$`, 'iu').test(name)
  ) {
    throw new Error(`Refusing to remove an unsafe worker environment snapshot: ${target}`);
  }
  await remove(resolvedTarget, { force: true });
}

export async function pruneWorkerEnvironmentSnapshots({
  runtimeConfigRoot,
  preserve = [],
  retain = 3,
  list = readdir,
  inspect = stat,
  removeSnapshot = removeWorkerEnvironmentSnapshot,
}) {
  let names;
  try {
    names = await list(runtimeConfigRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const candidates = [];
  for (const name of names) {
    if (!new RegExp(`^(?:${workerReleaseDirectoryNamePattern.source.slice(1, -1)})\\.json$`, 'iu').test(name)) continue;
    const path = join(runtimeConfigRoot, name);
    const details = await inspect(path);
    if (details.isFile()) candidates.push({ path, modified: details.mtimeMs });
  }
  candidates.sort((left, right) => right.modified - left.modified);
  const keep = new Set([...preserve, ...candidates.slice(0, retain).map(({ path }) => path)]);
  for (const { path } of candidates) {
    if (!keep.has(path)) await removeSnapshot({ runtimeConfigRoot, target: path });
  }
}

export async function prepareWorkerRelease({
  projectRoot,
  releaseRoot,
  revision,
  instanceId,
  nodePath,
  buildEnvironment,
  run = runCommand,
  archive = archiveGitRevision,
  makeDirectory = mkdir,
  removeRelease = removeReadOnlyWorkerRelease,
  assertExists = access,
  auditSymlinks = assertNoEscapingSymlinks,
  assertNoSecrets = assertArchivedReleaseHasNoSecrets,
}) {
  const releasesRoot = dirname(releaseRoot);
  const stagedRelease = stagedWorkerReleasePath(releaseRoot);
  await makeDirectory(releasesRoot, { recursive: true, mode: 0o700 });
  try {
    await assertExists(releaseRoot);
    throw new Error(`Worker release already exists at ${releaseRoot}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await removeRelease({ releasesRoot, target: stagedRelease });
  try {
    await archive(projectRoot, revision, stagedRelease);
    await assertNoSecrets(stagedRelease);
    await auditSymlinks(stagedRelease);
    await run('gitleaks', ['dir', '--redact', '--no-banner', stagedRelease], {
      cwd: stagedRelease,
      env: buildEnvironment,
    });
    await run('npm', [
      'ci',
      '--include=dev',
      '--workspace',
      '@alistore/api',
      '--include-workspace-root',
    ], { cwd: stagedRelease, env: buildEnvironment });
    await run('npm', ['run', 'prisma:generate', '-w', '@alistore/api'], {
      cwd: stagedRelease,
      env: buildEnvironment,
    });
    await run('npm', ['run', 'build', '-w', '@alistore/api'], {
      cwd: stagedRelease,
      env: buildEnvironment,
    });
    await assertNoSecrets(stagedRelease, { skipNodeModules: true });
    await assertExists(join(stagedRelease, 'apps', 'api', 'dist', 'worker.js'));
    await assertExists(join(stagedRelease, 'node_modules', '@prisma', 'client'));
    await assertExists(join(stagedRelease, 'node_modules', '.prisma', 'client'));
    await assertExists(join(stagedRelease, 'node_modules', '.bin', 'ts-node'));
    await assertExists(join(stagedRelease, 'node_modules', '.bin', 'prisma'));
    await auditSymlinks(stagedRelease);
  } catch (error) {
    await removeRelease({ releasesRoot, target: stagedRelease }).catch(() => undefined);
    throw error;
  }
  return stagedRelease;
}

export async function finalizeWorkerRelease({
  releaseRoot,
  stagedRelease,
  revision,
  instanceId,
  nodePath,
  buildEnvironment,
  run = runCommand,
  move = rename,
  removePath = rm,
  removeRelease = removeReadOnlyWorkerRelease,
  assertExists = access,
  assertMissing = async (path) => {
    try {
      await access(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    throw new Error(`Production worker release retained a development-only tool: ${path}`);
  },
  auditSymlinks = assertNoEscapingSymlinks,
  assertNoSecrets = assertArchivedReleaseHasNoSecrets,
  sealRelease = sealWorkerRelease,
}) {
  const releasesRoot = dirname(releaseRoot);
  if (stagedRelease !== stagedWorkerReleasePath(releaseRoot)) {
    throw new Error(`Refusing to finalize an unexpected worker release staging path: ${stagedRelease}`);
  }
  try {
    await run('npm', [
      'prune',
      '--omit=dev',
      '--workspace',
      '@alistore/api',
      '--include-workspace-root',
    ], { cwd: stagedRelease, env: buildEnvironment });
    await removePath(join(stagedRelease, 'node_modules', '.bin', 'prisma'), { force: true });
    await removePath(join(stagedRelease, 'node_modules', 'prisma'), { force: true, recursive: true });
    await assertMissing(join(stagedRelease, 'node_modules', '.bin', 'ts-node'));
    await assertMissing(join(stagedRelease, 'node_modules', '.bin', 'prisma'));
    await assertMissing(join(stagedRelease, 'node_modules', 'prisma'));
    await assertNoSecrets(stagedRelease, { skipNodeModules: true });
    await assertExists(join(stagedRelease, 'apps', 'api', 'dist', 'worker.js'));
    await assertExists(join(stagedRelease, 'node_modules', '@prisma', 'client'));
    await assertExists(join(stagedRelease, 'node_modules', '.prisma', 'client'));
    await auditSymlinks(stagedRelease);
    await sealRelease({ releaseRoot: stagedRelease, revision, instanceId, nodePath });
    await move(stagedRelease, releaseRoot);
  } catch (error) {
    await removeRelease({ releasesRoot, target: stagedRelease }).catch(() => undefined);
    throw error;
  }
  return releaseRoot;
}

export async function archiveGitRevision(projectRoot, revision, destination) {
  const tracked = (await execFile(
    'git',
    ['ls-tree', '-r', '--name-only', revision],
    { cwd: projectRoot },
  )).stdout.split('\n').filter(Boolean);
  for (const path of tracked) {
    const name = path.split('/').at(-1).toLowerCase();
    const forbidden = (name.startsWith('.env') && !name.endsWith('.example'))
      || ['.npmrc', 'id_rsa', 'id_ed25519', 'credentials'].includes(name)
      || /(?:^|[-_.])(?:service[-_.]?account|private[-_.]?key)(?:[-_.]|$)/u.test(name)
      || /\.(?:p8|pem|key)$/u.test(name);
    if (forbidden) throw new Error(`Git revision contains a forbidden secret path: ${path}`);
  }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await new Promise((resolvePromise, reject) => {
    const git = spawn('git', ['archive', '--format=tar', revision], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const tar = spawn('/usr/bin/tar', ['-xf', '-', '-C', destination], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    git.stdout.pipe(tar.stdin);
    let gitCode;
    let tarCode;
    const finish = () => {
      if (gitCode === undefined || tarCode === undefined) return;
      if (gitCode === 0 && tarCode === 0) resolvePromise();
      else reject(new Error(`git archive extraction failed (${gitCode}/${tarCode})`));
    };
    git.once('error', reject);
    tar.once('error', reject);
    git.once('exit', (code) => { gitCode = code; finish(); });
    tar.once('exit', (code) => { tarCode = code; finish(); });
  });
}

export async function assertArchivedReleaseHasNoSecrets(
  releaseRoot,
  { list = readdir, skipNodeModules = false } = {},
) {
  const visit = async (directory, relativeDirectory = '') => {
    for (const name of await list(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name.name}` : name.name;
      const lowerName = name.name.toLowerCase();
      if (skipNodeModules && lowerName === 'node_modules' && name.isDirectory()) continue;
      const forbidden = (lowerName.startsWith('.env') && !lowerName.endsWith('.example'))
        || ['.npmrc', 'id_rsa', 'id_ed25519', 'credentials'].includes(lowerName)
        || /(?:^|[-_.])(?:service[-_.]?account|private[-_.]?key)(?:[-_.]|$)/u.test(lowerName)
        || /\.(?:p8|pem|key)$/u.test(lowerName);
      if (forbidden) {
        throw new Error(`Archived release contains a forbidden secret path: ${relativePath}`);
      }
      if (name.isDirectory()) await visit(join(directory, name.name), relativePath);
    }
  };
  await visit(releaseRoot);
}

const workerReleaseManifestName = 'worker-release-manifest.json';

async function sha256File(path, read = readFile) {
  return createHash('sha256').update(await read(path)).digest('hex');
}

async function runtimeTreeIdentity(releaseRoot) {
  const aggregate = createHash('sha256');
  let count = 0;
  let bytes = 0;
  const roots = [
    join(releaseRoot, 'apps', 'api', 'dist'),
    join(releaseRoot, 'apps', 'api', 'node_modules'),
    join(releaseRoot, 'node_modules'),
    join(releaseRoot, 'package.json'),
    join(releaseRoot, 'package-lock.json'),
    join(releaseRoot, 'apps', 'api', 'package.json'),
  ];
  const visit = async (path, relativePath) => {
    const details = await lstat(path);
    if (details.isSymbolicLink()) {
      const target = await readlink(path);
      aggregate.update(`L\0${relativePath}\0${details.mode & 0o7777}\0${target}\n`);
      count += 1;
      bytes += Buffer.byteLength(target);
      return;
    }
    if (details.isDirectory()) {
      aggregate.update(`D\0${relativePath}\0${details.mode & 0o7777}\n`);
      for (const name of (await readdir(path)).sort()) {
        await visit(join(path, name), `${relativePath}/${name}`);
      }
      return;
    }
    if (details.isFile()) {
      const content = await readFile(path);
      aggregate.update(`F\0${relativePath}\0${details.mode & 0o7777}\0${content.length}\0`);
      aggregate.update(createHash('sha256').update(content).digest('hex'));
      aggregate.update('\n');
      count += 1;
      bytes += content.length;
    }
  };
  for (const root of roots) {
    await visit(root, relative(releaseRoot, root));
  }
  return { count, bytes, sha256: aggregate.digest('hex') };
}

async function installedDependencyIdentity(releaseRoot) {
  const packages = [];
  const collect = async (nodeModules) => {
    let entries;
    try {
      entries = await readdir(nodeModules, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.bin') continue;
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(join(nodeModules, entry.name), { withFileTypes: true })) {
          if (scoped.isDirectory() || scoped.isSymbolicLink()) {
            await record(join(nodeModules, entry.name, scoped.name));
          }
        }
      } else {
        await record(join(nodeModules, entry.name));
      }
    }
  };
  const record = async (packageDirectory) => {
    try {
      const parsed = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));
      if (typeof parsed.name === 'string' && typeof parsed.version === 'string') {
        packages.push(`${parsed.name}@${parsed.version}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  };
  await collect(join(releaseRoot, 'node_modules'));
  await collect(join(releaseRoot, 'apps', 'api', 'node_modules'));
  packages.sort();
  return {
    count: packages.length,
    sha256: createHash('sha256').update(JSON.stringify(packages)).digest('hex'),
  };
}

export async function buildWorkerReleaseManifest({ releaseRoot, revision, instanceId, nodePath }) {
  return {
    schemaVersion: 1,
    revision,
    instanceId,
    runtime: {
      nodePath,
      nodeSha256: await sha256File(nodePath),
      nodeVersion: process.version,
      modulesAbi: process.versions.modules,
      arch: process.arch,
      platform: process.platform,
    },
    files: {
      worker: await sha256File(join(releaseRoot, 'apps', 'api', 'dist', 'worker.js')),
      rootPackage: await sha256File(join(releaseRoot, 'package.json')),
      packageLock: await sha256File(join(releaseRoot, 'package-lock.json')),
      apiPackage: await sha256File(join(releaseRoot, 'apps', 'api', 'package.json')),
      prismaSchema: await sha256File(join(releaseRoot, 'apps', 'api', 'prisma', 'schema.prisma')),
    },
    dependencies: await installedDependencyIdentity(releaseRoot),
    runtimeTree: await runtimeTreeIdentity(releaseRoot),
  };
}

export async function writeWorkerReleaseManifest(options) {
  const manifest = await buildWorkerReleaseManifest(options);
  await writeFile(
    join(options.releaseRoot, workerReleaseManifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o444 },
  );
  return manifest;
}

export async function verifyWorkerRelease({ releaseRoot, revision, instanceId, nodePath }) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(releaseRoot, workerReleaseManifestName), 'utf8'));
  } catch {
    throw new Error(`Worker release manifest is missing or invalid at ${releaseRoot}`);
  }
  const expected = await buildWorkerReleaseManifest({ releaseRoot, revision, instanceId, nodePath });
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new Error(`Worker release integrity verification failed at ${releaseRoot}`);
  }
  return manifest;
}

export async function makeWorkerReleaseReadOnly(releaseRoot) {
  const visit = async (path) => {
    const details = await lstat(path);
    if (details.isSymbolicLink()) return;
    if (details.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
    }
    await chmod(path, details.mode & ~0o222);
  };
  await visit(releaseRoot);
}

export async function sealWorkerRelease(options) {
  await makeWorkerReleaseReadOnly(options.releaseRoot);
  const rootDetails = await lstat(options.releaseRoot);
  await chmod(options.releaseRoot, rootDetails.mode | 0o300);
  try {
    await writeWorkerReleaseManifest(options);
    const manifestPath = join(options.releaseRoot, workerReleaseManifestName);
    const manifestDetails = await lstat(manifestPath);
    await chmod(manifestPath, manifestDetails.mode & ~0o222);
    await verifyWorkerRelease(options);
  } finally {
    const writableRoot = await lstat(options.releaseRoot);
    await chmod(options.releaseRoot, writableRoot.mode & ~0o222);
  }
}

export async function durablyWriteFile({
  target,
  content,
  mode = 0o600,
  lint,
  openFile = open,
  move = rename,
  remove = rm,
}) {
  const temporary = `${target}.new-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await openFile(temporary, 'wx', mode);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (lint) await lint(temporary);
    await move(temporary, target);
    const directory = await openFile(dirname(target), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await remove(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function durablyReplacePlist({ target, content, run }) {
  await durablyWriteFile({
    target,
    content,
    lint: (path) => run('/usr/bin/plutil', ['-lint', path]),
  });
}

export async function assertNoEscapingSymlinks(
  releaseRoot,
  { list = readdir, inspect = lstat, readLink = readlink, assertExists = access } = {},
) {
  const visit = async (directory) => {
    for (const name of await list(directory)) {
      const path = join(directory, name);
      const details = await inspect(path);
      if (details.isSymbolicLink()) {
        const target = await readLink(path);
        const resolvedTarget = isAbsolute(target) ? resolve(target) : resolve(dirname(path), target);
        const fromRelease = relative(resolve(releaseRoot), resolvedTarget);
        if (fromRelease === '..' || fromRelease.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
          throw new Error(`Worker release contains an escaping symlink: ${path}`);
        }
        await assertExists(resolvedTarget);
      } else if (details.isDirectory()) {
        await visit(path);
      }
    }
  };
  await visit(releaseRoot);
}

export async function pruneWorkerReleases({
  releasesRoot,
  preserve = [],
  retain = 3,
  list = readdir,
  inspect = stat,
  removeRelease = removeReadOnlyWorkerRelease,
}) {
  const preserved = new Set(preserve);
  let names;
  try {
    names = await list(releasesRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const candidates = [];
  for (const name of names) {
    if (!/^[0-9a-f]{40}-[0-9a-f-]{16,128}$/iu.test(name)) continue;
    const path = join(releasesRoot, name);
    const details = await inspect(path);
    if (details.isDirectory()) candidates.push({ path, modified: details.mtimeMs });
  }
  candidates.sort((left, right) => right.modified - left.modified);
  const keep = new Set([...preserved, ...candidates.slice(0, retain).map(({ path }) => path)]);
  for (const { path } of candidates) {
    if (!keep.has(path)) await removeRelease({ releasesRoot, target: path });
  }
}

async function defaultIsLoaded(service, run) {
  try {
    await run('/bin/launchctl', ['print', service], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function defaultIsRunning(service) {
  try {
    const { stdout } = await execFile('/bin/launchctl', ['print', service]);
    return /^\s*state\s*=\s*running\s*$/mu.test(stdout);
  } catch {
    return false;
  }
}

export async function waitUntilWorkerReady({
  fetchImpl,
  revision,
  instanceId,
  service,
  isRunning,
  attempts = 30,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  let observedRevision = null;
  let observedInstanceId = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl('http://127.0.0.1:4000/api/health/worker', {
        signal: AbortSignal.timeout(5_000),
      });
      observedRevision = response.headers?.get('x-alistore-revision')?.trim() || null;
      observedInstanceId = response.headers?.get('x-alistore-worker-instance')?.trim() || null;
      const exactHeartbeat = response.status === 200
        && observedRevision === revision
        && observedInstanceId === instanceId;
      if (exactHeartbeat && await isRunning(service)) return;
    } catch {
      // The API may not have observed the new heartbeat, or the worker may have exited.
    }
    if (attempt < attempts) await sleep(1_000);
  }
  const observed = observedRevision || observedInstanceId
    ? `; observed ${observedRevision ?? 'missing-revision'}/${observedInstanceId ?? 'missing-instance'}`
    : '';
  throw new Error(
    `Production worker did not become ready at ${revision}/${instanceId}${observed}.`,
  );
}

export async function activateProductionWorker({
  projectRoot = rootDir,
  userHome = homedir(),
  uid = process.getuid(),
  nodePath = process.execPath,
  run = runCommand,
  inspectSource = inspectCleanSource,
  acquireActivationLock = acquireProductionWorkerActivationLock,
  loadEnvironment = loadLaunchdWorkerEnvironment,
  createInstanceId = randomUUID,
  prepareRelease = prepareWorkerRelease,
  finalizeRelease = finalizeWorkerRelease,
  verifyRelease = verifyWorkerRelease,
  pruneReleases = pruneWorkerReleases,
  pruneSnapshots = pruneWorkerEnvironmentSnapshots,
  replacePlist = durablyReplacePlist,
  writeDurable = durablyWriteFile,
  writeSnapshot = writeWorkerEnvironmentSnapshot,
  verifySnapshot = verifyWorkerEnvironmentSnapshot,
  isLoaded = defaultIsLoaded,
  isRunning = defaultIsRunning,
  makeDirectory = mkdir,
  makeTemporaryDirectory = mkdtemp,
  read = readFile,
  write = writeFile,
  move = rename,
  remove = rm,
  removeRelease = removeReadOnlyWorkerRelease,
  removeSnapshot = removeWorkerEnvironmentSnapshot,
  fetchImpl = fetch,
  readinessAttempts = 30,
  sleep,
  warn = console.warn,
  dryRun = false,
} = {}) {
  const releaseActivationLock = await acquireActivationLock();
  let environmentSnapshot;
  let runtimeConfigRoot;
  let preserveEnvironmentSnapshot = false;
  try {
    const { revision } = await inspectSource(projectRoot);
    const assertSourceUnchanged = async () => {
      const current = await inspectSource(projectRoot);
      if (current.revision !== revision) {
        throw new Error('Refusing activation because the git revision changed during preparation.');
      }
    };
    const instanceId = createInstanceId();
    if (!/^[0-9a-f-]{16,128}$/iu.test(instanceId)) {
      throw new Error('Refusing to activate an invalid worker instance ID.');
    }
    const releasesRoot = join(
      userHome,
      'Library',
      'Application Support',
      'AliStore',
      'worker-releases',
    );
    const releaseRoot = join(releasesRoot, `${revision}-${instanceId}`);
    runtimeConfigRoot = join(
      userHome,
      'Library',
      'Application Support',
      'AliStore',
      'runtime-config',
    );
    const modulePath = `${join(releaseRoot, 'apps', 'api', 'node_modules')}:${join(releaseRoot, 'node_modules')}`;
    const workerPath = [
      join(userHome, '.local', 'bin'),
      dirname(nodePath),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ].join(':');
    const contract = validateWorkerEnvironmentContract(JSON.parse(
      await read(join(projectRoot, workerEnvironmentContractPath), 'utf8'),
    ));
    const capturedEnvironment = await loadEnvironment({
      projectRoot,
      base: { ...process.env, HOME: userHome, PATH: workerPath },
      revision,
      instanceId,
      modulePath,
      contract,
    });
    environmentSnapshot = await writeSnapshot({
      runtimeConfigRoot,
      revision,
      instanceId,
      environment: capturedEnvironment,
      writeDurable,
    });
    const publicIdentity = {
      NODE_PATH: modulePath,
      RENDER_GIT_COMMIT: revision,
      ALISTORE_WORKER_INSTANCE_ID: instanceId,
      ALISTORE_WORKER_ENV_SNAPSHOT_PATH: environmentSnapshot.path,
      ALISTORE_WORKER_ENV_SNAPSHOT_SHA256: environmentSnapshot.sha256,
    };
    const loadVerifiedSnapshotEnvironment = async () => applyWorkerPublicControls({
      environment: { ...await verifySnapshot(environmentSnapshot) },
      contract,
      identity: publicIdentity,
    });
    let runtimeEnvironment = await loadVerifiedSnapshotEnvironment();
    const releaseBuildEnvironment = { CI: 'true' };
    for (const key of ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR', 'TZ']) {
      if (runtimeEnvironment[key] !== undefined) releaseBuildEnvironment[key] = runtimeEnvironment[key];
    }

    const sourcePlist = join(projectRoot, 'scripts', 'com.alistore.worker.plist');
    const template = await read(sourcePlist, 'utf8');
    const renderedPlist = renderProductionWorkerPlist(template, {
      nodePath,
      projectRoot,
      revision,
      instanceId,
      releaseRoot,
      modulePath,
      workerPath,
      environmentSnapshotPath: environmentSnapshot.path,
      environmentSnapshotSha256: environmentSnapshot.sha256,
    });
    const temporaryDirectory = await makeTemporaryDirectory(join(tmpdir(), 'alistore-worker-agent-'));
    const temporaryPlist = join(temporaryDirectory, 'com.alistore.worker.plist');
    let backupPlist;
    let noPreviousMarker;
    let removeBackupOnCleanup = false;
    let stagedReleaseRoot;
    let releaseCreated = false;
    let keepRelease = false;
    const cleanupWarnings = [];

    try {
      await write(temporaryPlist, renderedPlist, { mode: 0o600 });
      await run('/usr/bin/plutil', ['-lint', temporaryPlist]);
      await assertSourceUnchanged();
      stagedReleaseRoot = await prepareRelease({
        projectRoot,
        releaseRoot,
        revision,
        instanceId,
        nodePath,
        buildEnvironment: releaseBuildEnvironment,
      });
      await assertSourceUnchanged();
      runtimeEnvironment = await loadVerifiedSnapshotEnvironment();

      await run('npm', [
        'run',
        'preflight',
        '-w',
        '@alistore/api',
        '--',
        '--environment-snapshot',
        environmentSnapshot.path,
        environmentSnapshot.sha256,
        '--strict',
      ], { cwd: stagedReleaseRoot, env: runtimeEnvironment });
      await assertSourceUnchanged();
      if (dryRun) {
        return {
          activated: false,
          reason: 'dry-run',
          plist: renderedPlist,
          revision,
          instanceId,
          cleanupWarnings,
        };
      }

      // Migration now runs from the verified immutable release using the same
      // precedence-resolved environment as preflight and the launchd worker.
      runtimeEnvironment = await loadVerifiedSnapshotEnvironment();
      await run('npm', ['run', 'db:deploy', '-w', '@alistore/api'], {
        cwd: stagedReleaseRoot,
        env: runtimeEnvironment,
      });
      // Database migrations must remain forward-compatible with the previous
      // worker: they are necessarily committed before the pruned immutable
      // bundle can be finalized and launchd can be changed.
      await assertSourceUnchanged();
      await finalizeRelease({
        releaseRoot,
        stagedRelease: stagedReleaseRoot,
        revision,
        instanceId,
        nodePath,
        buildEnvironment: releaseBuildEnvironment,
      });
      stagedReleaseRoot = undefined;
      releaseCreated = true;
      await assertSourceUnchanged();
      // This bundle makes worker rollback code-identical. The API LaunchAgent
      // still uses its checkout dist and must be activated separately first;
      // a future joint activator should transact both services as one release.
      // Close the final source TOCTOU window immediately before LaunchAgents
      // state is inspected and the durable backup/replacement transaction starts.
      await verifyRelease({ releaseRoot, revision, instanceId, nodePath });

      const installedPlist = join(userHome, 'Library', 'LaunchAgents', 'com.alistore.worker.plist');
      backupPlist = `${installedPlist}.previous`;
      noPreviousMarker = `${installedPlist}.previous.none`;
      const domain = `gui/${uid}`;
      const service = `${domain}/com.alistore.worker`;
      const wasLoaded = await isLoaded(service, run);
      let previousPlist = null;
      try {
        previousPlist = await read(installedPlist);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      const previousIdentity = previousPlist === null
        ? null
        : parseProductionWorkerIdentity(previousPlist.toString('utf8'));

      try {
        await read(backupPlist);
        throw new Error(
          `Interrupted activation backup exists at ${backupPlist}; restore or remove it before retrying`,
        );
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      try {
        await read(noPreviousMarker);
        throw new Error(
          `Interrupted first activation marker exists at ${noPreviousMarker}; review it before retrying`,
        );
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }

      await makeDirectory(dirname(installedPlist), { recursive: true });
      if (previousPlist !== null) {
        await replacePlist({ target: backupPlist, content: previousPlist, run });
      } else {
        await writeDurable({
          target: noPreviousMarker,
          content: Buffer.from('ALISTORE_NO_PREVIOUS_PLIST\n'),
        });
      }
      await replacePlist({ target: installedPlist, content: renderedPlist, run });

      let replacementBootstrapped = false;
      try {
        if (wasLoaded) await run('/bin/launchctl', ['bootout', service]);
        await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
        replacementBootstrapped = true;
        await run('/bin/launchctl', ['kickstart', '-k', service]);
        await waitUntilWorkerReady({
          fetchImpl,
          revision,
          instanceId,
          service,
          isRunning,
          attempts: readinessAttempts,
          sleep,
        });
        removeBackupOnCleanup = true;
        keepRelease = true;
        preserveEnvironmentSnapshot = true;
      } catch (activationError) {
        const rollbackFailures = [];
        if (replacementBootstrapped) {
          await run('/bin/launchctl', ['bootout', service], { quiet: true })
            .catch((error) => rollbackFailures.push(error));
        }
        try {
          if (previousPlist !== null) {
            const durablePreviousPlist = await read(backupPlist);
            await replacePlist({ target: installedPlist, content: durablePreviousPlist, run });
            if (wasLoaded) {
              if (!previousIdentity) {
                throw new Error('previous worker plist has no verifiable revision and instance ID');
              }
              const expectedPreviousExecutable = join(
                releasesRoot,
                `${previousIdentity.revision}-${previousIdentity.instanceId}`,
                'apps',
                'api',
                'dist',
                'worker.js',
              );
              if (previousIdentity.executablePath !== expectedPreviousExecutable) {
                throw new Error('previous worker plist does not point to its immutable release');
              }
              const expectedPreviousSnapshot = join(
                runtimeConfigRoot,
                `${previousIdentity.revision}-${previousIdentity.instanceId}.json`,
              );
              if (previousIdentity.environmentSnapshotPath !== expectedPreviousSnapshot) {
                throw new Error('previous worker plist does not point to its runtime snapshot');
              }
              await verifyRelease({
                releaseRoot: dirname(dirname(dirname(dirname(previousIdentity.executablePath)))),
                revision: previousIdentity.revision,
                instanceId: previousIdentity.instanceId,
                nodePath: previousIdentity.nodePath,
              });
              await verifySnapshot({
                path: previousIdentity.environmentSnapshotPath,
                sha256: previousIdentity.environmentSnapshotSha256,
              });
              await run('/bin/launchctl', ['bootstrap', domain, installedPlist]);
              await run('/bin/launchctl', ['kickstart', '-k', service]);
              await waitUntilWorkerReady({
                fetchImpl,
                ...previousIdentity,
                service,
                isRunning,
                attempts: readinessAttempts,
                sleep,
              });
            }
          } else {
            await remove(installedPlist, { force: true });
          }
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
        }
        removeBackupOnCleanup = rollbackFailures.length === 0;
        keepRelease = rollbackFailures.length !== 0;
        preserveEnvironmentSnapshot = keepRelease;
        const rollback = rollbackFailures.length === 0
          ? previousPlist !== null
            ? wasLoaded ? 'previous agent restored and verified' : 'previous inactive plist restored'
            : 'new agent removed'
          : `rollback incomplete (${rollbackFailures.length} failure(s)); backup preserved`;
        throw new Error(`Production worker activation failed; ${rollback}`, { cause: activationError });
      }

      const previousReleaseRoot = previousIdentity?.executablePath
        ? dirname(dirname(dirname(dirname(previousIdentity.executablePath))))
        : null;
      await pruneReleases({
        releasesRoot,
        preserve: [releaseRoot, previousReleaseRoot].filter(Boolean),
      }).catch((error) => {
        cleanupWarnings.push(error);
        warn(`Production worker release retention warning: ${error.message}`);
      });
      await pruneSnapshots({
        runtimeConfigRoot,
        preserve: [
          environmentSnapshot.path,
          previousIdentity?.environmentSnapshotPath,
        ].filter(Boolean),
      }).catch((error) => {
        cleanupWarnings.push(error);
        warn(`Production worker environment retention warning: ${error.message}`);
      });
      return { activated: true, service, revision, instanceId, cleanupWarnings };
    } finally {
      const cleanup = async (path, options) => {
        try {
          await remove(path, options);
        } catch (error) {
          cleanupWarnings.push(error);
          warn(`Production worker activation cleanup warning for ${path}: ${error.message}`);
        }
      };
      if (backupPlist && removeBackupOnCleanup) await cleanup(backupPlist, { force: true });
      if (noPreviousMarker && removeBackupOnCleanup) await cleanup(noPreviousMarker, { force: true });
      if (releaseCreated && !keepRelease) {
        try {
          await removeRelease({ releasesRoot, target: releaseRoot });
        } catch (error) {
          cleanupWarnings.push(error);
          warn(`Production worker activation cleanup warning for ${releaseRoot}: ${error.message}`);
        }
      }
      if (stagedReleaseRoot) {
        try {
          await removeRelease({ releasesRoot, target: stagedReleaseRoot });
        } catch (error) {
          cleanupWarnings.push(error);
          warn(`Production worker activation cleanup warning for ${stagedReleaseRoot}: ${error.message}`);
        }
      }
      await cleanup(temporaryDirectory, { recursive: true, force: true });
    }
  } finally {
    if (environmentSnapshot && !preserveEnvironmentSnapshot) {
      await removeSnapshot({
        runtimeConfigRoot,
        target: environmentSnapshot.path,
      }).catch((error) => {
        warn(`Production worker environment cleanup warning for ${environmentSnapshot.path}: ${error.message}`);
      });
    }
    await releaseActivationLock();
  }
}

export function renderProductionWorkerPlist(
  template,
  {
    nodePath,
    projectRoot,
    revision,
    instanceId,
    releaseRoot,
    modulePath,
    workerPath,
    environmentSnapshotPath,
    environmentSnapshotSha256,
  },
) {
  return template
    .replaceAll('__NODE_PATH__', xmlEscape(nodePath))
    .replaceAll('__PROJECT_ROOT__', xmlEscape(projectRoot))
    .replaceAll('__GIT_REVISION__', xmlEscape(revision))
    .replaceAll('__WORKER_INSTANCE_ID__', xmlEscape(instanceId))
    .replaceAll('__WORKER_RELEASE_ROOT__', xmlEscape(releaseRoot))
    .replaceAll('__WORKER_MODULE_PATH__', xmlEscape(modulePath))
    .replaceAll('__WORKER_PATH__', xmlEscape(workerPath))
    .replaceAll('__WORKER_ENV_SNAPSHOT_PATH__', xmlEscape(environmentSnapshotPath))
    .replaceAll('__WORKER_ENV_SNAPSHOT_SHA256__', xmlEscape(environmentSnapshotSha256));
}

export function parseProductionWorkerIdentity(plist) {
  const revision = plistStringValue(plist, 'RENDER_GIT_COMMIT');
  const instanceId = plistStringValue(plist, 'ALISTORE_WORKER_INSTANCE_ID');
  const programArguments = plistProgramArguments(plist);
  const nodePath = programArguments?.[0] ?? null;
  const executablePath = programArguments?.[1] ?? null;
  const environmentSnapshotPath = plistStringValue(plist, 'ALISTORE_WORKER_ENV_SNAPSHOT_PATH');
  const environmentSnapshotSha256 = plistStringValue(plist, 'ALISTORE_WORKER_ENV_SNAPSHOT_SHA256');
  return revision && instanceId && nodePath && executablePath
    && environmentSnapshotPath && /^[0-9a-f]{64}$/iu.test(environmentSnapshotSha256 ?? '')
    ? {
      revision,
      instanceId,
      nodePath,
      executablePath,
      environmentSnapshotPath,
      environmentSnapshotSha256,
    }
    : null;
}

function plistStringValue(plist, key) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, 'u'));
  return match ? xmlUnescape(match[1]).trim() : null;
}

function plistProgramArguments(plist) {
  const array = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/u)?.[1];
  if (!array) return null;
  return [...array.matchAll(/<string>([^<]*)<\/string>/gu)].map((match) => (
    xmlUnescape(match[1]).trim()
  ));
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlUnescape(value) {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  activateProductionWorker({ dryRun })
    .then((result) => {
      if (result.activated) {
        console.log(`Production worker activated: ${result.service} (${result.revision})`);
      } else {
        console.log('Production worker activation gate passed (dry run); launchd was not changed.');
      }
    })
    .catch((error) => {
      console.error(`Production worker activation refused: ${error.message}`);
      process.exitCode = 1;
    });
}
