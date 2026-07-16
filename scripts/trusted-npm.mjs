import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const updateHashWithFile = (hash, filePath) => {
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
};
const sha256File = (filePath) => {
  const hash = crypto.createHash('sha256');
  updateHashWithFile(hash, filePath);
  return hash.digest('hex');
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const verifyTrustedBootstrap = (root) => {
  if (process.env.ALISTORE_TRUSTED_BOOTSTRAP_FD !== '3') {
    throw new Error('The trusted ecosystem bootstrap descriptor is missing.');
  }
  const manifestPath = path.join(root, 'scripts', 'node-runtime-manifest.sha256');
  const manifestStat = fs.statSync(manifestPath);
  let descriptorStat;
  try {
    descriptorStat = fs.fstatSync(3);
  } catch {
    throw new Error('The trusted ecosystem bootstrap descriptor is not open.');
  }
  if (
    descriptorStat.dev !== manifestStat.dev ||
    descriptorStat.ino !== manifestStat.ino ||
    descriptorStat.size !== manifestStat.size
  ) {
    throw new Error('The trusted ecosystem bootstrap descriptor is not the runtime manifest.');
  }
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts', 'ecosystem-toolchain-lock.json'), 'utf8'),
  );
  const digest = sha256File(manifestPath);
  if (lock.runtime?.nodeRuntimeManifestSha256 !== digest) {
    throw new Error('The runtime manifest does not match the ecosystem toolchain lock.');
  }
  return digest;
};

export const hashDependencyTree = (directory) => {
  const hash = crypto.createHash('sha256');
  const visit = (current, relative = '') => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.name !== '.cache')
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        hash.update('d\0').update(relativePath).update('\0');
        visit(entryPath, relativePath);
      } else if (entry.isSymbolicLink()) {
        hash.update('l\0').update(relativePath).update('\0').update(fs.readlinkSync(entryPath)).update('\0');
      } else if (entry.isFile()) {
        hash.update('f\0').update(relativePath).update('\0');
        updateHashWithFile(hash, entryPath);
        hash.update('\0');
      } else {
        throw new Error(`Unsupported dependency-tree entry: ${entryPath}`);
      }
    }
  };
  visit(directory);
  return hash.digest('hex');
};

export const resolveNodeRuntimeLibraries = (nodePath, nodeRoot) => {
  const pending = [fs.realpathSync(nodePath)];
  const visited = new Set();
  const resolveLibrary = (library, loaderPath) => {
    if (library.startsWith('/usr/lib/') || library.startsWith('/System/Library/')) return null;
    const suffix = library.replace(/^@(?:rpath|loader_path|executable_path)\/?/u, '');
    const candidates = library.startsWith('@rpath/')
      ? [path.join(nodeRoot, 'lib', suffix), path.join(path.dirname(loaderPath), suffix)]
      : library.startsWith('@loader_path/')
        ? [path.join(path.dirname(loaderPath), suffix)]
        : library.startsWith('@executable_path/')
          ? [path.join(path.dirname(nodePath), suffix)]
          : [library];
    const candidate = candidates.find((entry) => fs.existsSync(entry));
    if (!candidate) throw new Error(`Could not resolve Node runtime library: ${library}`);
    return fs.realpathSync(candidate);
  };

  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const output = execFileSync('/usr/bin/otool', ['-L', current], {
      encoding: 'utf8',
      env: { LANG: 'C', PATH: '/usr/bin:/bin' },
    });
    for (const line of output.split('\n').slice(1)) {
      const library = /^\s+(.+?)\s+\(compatibility version/u.exec(line)?.[1];
      if (!library) continue;
      const resolved = resolveLibrary(library, current);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }

  return [...visited].sort();
};

export const hashNodeRuntimeLibraries = (nodePath, nodeRoot) => {
  const hash = crypto.createHash('sha256');
  for (const filePath of resolveNodeRuntimeLibraries(nodePath, nodeRoot)) {
    hash.update(filePath).update('\0');
    updateHashWithFile(hash, filePath);
    hash.update('\0');
  }
  return hash.digest('hex');
};

const resolveBoundShim = (root, name, expectedTarget) => {
  const shimPath = path.join(root, 'node_modules', '.bin', name);
  const stat = fs.lstatSync(shimPath);
  const link = fs.readlinkSync(shimPath);
  const target = fs.realpathSync(shimPath);
  if (!stat.isSymbolicLink() || target !== expectedTarget) {
    throw new Error(`${name} shim does not resolve to its trusted CLI.`);
  }
  return {
    path: shimPath,
    target,
    linkSha256: sha256(link),
  };
};

const assertNoLifecycleShadowing = (root) => {
  const binDirectories = new Set();
  for (const start of [root, path.join(root, 'apps', 'api')]) {
    let cursor = start;
    while (true) {
      binDirectories.add(path.join(cursor, 'node_modules', '.bin'));
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }
  for (const directory of binDirectories) {
    for (const executable of ['node', 'npm']) {
      const candidate = path.join(directory, executable);
      if (fs.existsSync(candidate)) {
        throw new Error(`Refusing lifecycle executable shadow: ${candidate}`);
      }
    }
  }
};

const assertNoNextEnvironmentFiles = (root) => {
  const webRoot = path.join(root, 'apps', 'web');
  const environmentFiles = fs.readdirSync(webRoot)
    .filter((name) => (name === '.env' || name.startsWith('.env.')) && name !== '.env.example');
  if (environmentFiles.length > 0) {
    throw new Error(`Ignored Next.js environment files are not allowed for evidence: ${environmentFiles.join(', ')}`);
  }
};

export const resolveTrustedNpm = (root = process.cwd()) => {
  assertNoLifecycleShadowing(root);
  assertNoNextEnvironmentFiles(root);
  const toolchainLock = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts', 'ecosystem-toolchain-lock.json'), 'utf8'),
  );
  const packageLockSha256 = sha256File(path.join(root, 'package-lock.json'));
  const nodeModulesTreeSha256 = hashDependencyTree(path.join(root, 'node_modules'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const nodePath = fs.realpathSync(process.execPath);
  const nodeRoot = path.dirname(path.dirname(nodePath));
  const nodeSha256 = sha256File(nodePath);
  const nodeKegSha256 = hashDependencyTree(nodeRoot);
  const nodeRuntimeLibrariesSha256 = hashNodeRuntimeLibraries(nodePath, nodeRoot);
  const browserPath = toolchainLock.runtime?.browserPath;
  const browserAppRoot = path.dirname(path.dirname(path.dirname(browserPath)));
  const browserAppTreeSha256 = hashDependencyTree(browserAppRoot);
  const acceptanceDatabaseIdentity = toolchainLock.acceptance?.databaseIdentity;
  if (
    toolchainLock.schemaVersion !== 1 ||
    toolchainLock.packageLockSha256 !== packageLockSha256 ||
    toolchainLock.nodeModulesTreeSha256 !== nodeModulesTreeSha256 ||
    toolchainLock.runtime?.platform !== process.platform ||
    toolchainLock.runtime?.architecture !== process.arch ||
    toolchainLock.runtime?.nodeSha256 !== nodeSha256 ||
    toolchainLock.runtime?.nodeKegSha256 !== nodeKegSha256 ||
    toolchainLock.runtime?.nodeRuntimeLibrariesSha256 !== nodeRuntimeLibrariesSha256 ||
    acceptanceDatabaseIdentity !== 'postgresql://127.0.0.1:5432/alistore_test' ||
    typeof browserPath !== 'string' ||
    !path.isAbsolute(browserPath) ||
    toolchainLock.runtime?.browserSha256 !== sha256File(browserPath) ||
    toolchainLock.runtime?.browserAppTreeSha256 !== browserAppTreeSha256 ||
    packageLock.packages?.['node_modules/@playwright/test']?.version !== toolchainLock.playwright?.version ||
    packageLock.packages?.['node_modules/jest']?.version !== toolchainLock.jest?.version
  ) {
    throw new Error('The ecosystem test toolchain lock does not match package-lock.json.');
  }
  const npmCandidate = path.join(path.dirname(process.execPath), 'npm');
  const scriptShellPath = fs.realpathSync('/bin/sh');
  const scriptShellStat = fs.lstatSync(scriptShellPath);
  if (!scriptShellStat.isFile()) {
    throw new Error('The system script shell is not a regular file.');
  }

  const cliPath = fs.realpathSync(npmCandidate);
  const npmRoot = path.dirname(path.dirname(cliPath));
  const stat = fs.lstatSync(cliPath);
  const cliSha256 = sha256File(cliPath);
  const npmTreeSha256 = hashDependencyTree(npmRoot);
  if (
    !stat.isFile() ||
    path.basename(cliPath) !== 'npm-cli.js' ||
    toolchainLock.runtime.npmCliPath !== cliPath ||
    toolchainLock.runtime.npmCliSha256 !== cliSha256 ||
    toolchainLock.runtime.npmTreeSha256 !== npmTreeSha256
  ) {
    throw new Error('Could not resolve npm-cli.js from the active Node installation.');
  }
  const playwrightCliPath = fs.realpathSync(path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'));
  const jestCliPath = fs.realpathSync(path.join(root, 'node_modules', 'jest', 'bin', 'jest.js'));
  const playwrightShim = resolveBoundShim(root, 'playwright', playwrightCliPath);
  const jestShim = resolveBoundShim(root, 'jest', jestCliPath);
  const playwrightCliSha256 = sha256File(playwrightCliPath);
  const jestCliSha256 = sha256File(jestCliPath);
  if (
    playwrightCliSha256 !== toolchainLock.playwright.cliSha256 ||
    jestCliSha256 !== toolchainLock.jest.cliSha256
  ) {
    throw new Error('Installed ecosystem test CLIs do not match the tracked toolchain lock.');
  }
  return {
    cliPath,
    cliSha256,
    npmTreeSha256,
    scriptShellPath,
    scriptShellSha256: sha256File(scriptShellPath),
    nodePath,
    nodeSha256,
    nodeKegSha256,
    nodeRuntimeLibrariesSha256,
    browserPath,
    browserSha256: toolchainLock.runtime.browserSha256,
    browserAppTreeSha256,
    packageLockSha256,
    nodeModulesTreeSha256,
    playwrightCliPath,
    playwrightCliSha256,
    playwrightShim,
    jestCliPath,
    jestCliSha256,
    jestShim,
    acceptanceDatabaseIdentity,
  };
};

export const trustedNpmEnvironment = (npm) => {
  const environment = {};
  const allowedKeys = new Set([
    'FORCE_COLOR',
    'HOME',
    'LANG',
    'LC_ALL',
    'NO_COLOR',
    'TERM',
    'TMP',
    'TMPDIR',
    'TEMP',
    'TZ',
  ]);
  for (const [key, value] of Object.entries(process.env)) {
    if (allowedKeys.has(key) && value !== undefined) environment[key] = value;
  }
  return {
    ...environment,
    npm_execpath: npm.cliPath,
    npm_node_execpath: process.execPath,
    npm_config_node_options: '',
    npm_config_script_shell: npm.scriptShellPath,
    npm_config_userconfig: '/dev/null',
    ALISTORE_EVIDENCE_MODE: '1',
    TEST_DATABASE_URL: 'postgresql://alistore@127.0.0.1:5432/alistore_test?schema=public',
    E2E_DATABASE_URL: 'postgresql://alistore@127.0.0.1:5432/alistore_test?schema=public',
    E2E_REUSE_EXISTING_SERVER: 'false',
    PATH: [path.dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
  };
};
