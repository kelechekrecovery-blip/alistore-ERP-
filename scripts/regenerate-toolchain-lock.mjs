#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  hashDependencyTree,
  hashNodeRuntimeLibraries,
  resolveNodeRuntimeLibraries,
  sha256File,
  trustedNodeKegSymlinkOptions,
  trustedWorkspaceSymlinkOptions,
} from './toolchain-hashes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');
const acceptanceDatabaseIdentity = 'postgresql://127.0.0.1:5432/alistore_test';
const canonicalBrowserPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sha256Pattern = /^[a-f0-9]{64}$/u;

const assertRegularFile = (filePath, label) => {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
};

const assertCanonicalDirectory = (directory, label) => {
  const absolute = path.resolve(directory);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be a canonical directory`);
  }
  return absolute;
};

const readBootstrapHardPin = (source, name) => {
  const assignments = source
    .split('\n')
    .filter((line) => new RegExp(`^[\\t ]*(?:export[\\t ]+)?${name}=`, 'u').test(line));
  const match = assignments.length === 1
    ? new RegExp(`^${name}='([^'\\r\\n]+)'$`, 'u').exec(assignments[0])
    : null;
  if (!match) throw new Error(`Trusted ecosystem bootstrap must contain one literal ${name} hard pin`);
  return match[1];
};

const readBootstrapRuntimePins = (bootstrapPath) => {
  assertRegularFile(bootstrapPath, 'Trusted ecosystem bootstrap');
  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const pins = {
    nodePath: readBootstrapHardPin(source, 'NODE'),
    nodeSha256: readBootstrapHardPin(source, 'NODE_SHA256'),
    manifestSha256: readBootstrapHardPin(source, 'MANIFEST_SHA256'),
  };
  if (!path.isAbsolute(pins.nodePath)) throw new Error('Bootstrap NODE pin must be absolute');
  if (!sha256Pattern.test(pins.nodeSha256)) {
    throw new Error('Bootstrap NODE_SHA256 pin must be a lowercase SHA-256 digest');
  }
  if (!sha256Pattern.test(pins.manifestSha256)) {
    throw new Error('Bootstrap MANIFEST_SHA256 pin must be a lowercase SHA-256 digest');
  }
  return pins;
};

export const assertTrustedNodeRuntimePins = ({
  bootstrapPath,
  manifestPath,
  execPath = process.execPath,
} = {}) => {
  if (typeof bootstrapPath !== 'string' || typeof manifestPath !== 'string') {
    throw new Error('Trusted bootstrap and manifest paths are required');
  }
  const pins = readBootstrapRuntimePins(bootstrapPath);
  assertRegularFile(manifestPath, 'Node runtime manifest');

  const ambientNodePath = fs.realpathSync(execPath);
  assertRegularFile(ambientNodePath, 'Ambient Node executable');
  const pinnedNodePath = fs.realpathSync(pins.nodePath);
  assertRegularFile(pinnedNodePath, 'Bootstrap Node executable');
  if (pinnedNodePath !== pins.nodePath) {
    throw new Error('Bootstrap NODE pin must name a canonical executable');
  }
  if (ambientNodePath !== pinnedNodePath) {
    throw new Error('Ambient Node executable does not match the bootstrap NODE pin');
  }

  const nodeSha256 = sha256File(ambientNodePath);
  if (nodeSha256 !== pins.nodeSha256) {
    throw new Error('Ambient Node executable does not match the bootstrap NODE_SHA256 pin');
  }
  const manifestSha256 = sha256File(manifestPath);
  if (manifestSha256 !== pins.manifestSha256) {
    throw new Error('Node runtime manifest does not match the bootstrap MANIFEST_SHA256 pin');
  }

  const nodeRoot = assertCanonicalDirectory(
    path.dirname(path.dirname(ambientNodePath)),
    'Node installation',
  );
  const runtimeLibraries = resolveNodeRuntimeLibraries(ambientNodePath, nodeRoot);
  const expectedManifest = `${runtimeLibraries.map((libraryPath) => {
    if (fs.realpathSync(libraryPath) !== libraryPath) {
      throw new Error(`Node runtime closure entry must be canonical: ${libraryPath}`);
    }
    assertRegularFile(libraryPath, 'Node runtime closure entry');
    return `${sha256File(libraryPath)}  ${libraryPath}`;
  }).join('\n')}\n`;
  if (fs.readFileSync(manifestPath, 'utf8') !== expectedManifest) {
    throw new Error('Node runtime manifest must exactly match the ambient Node runtime closure');
  }

  return {
    manifestSha256,
    nodePath: ambientNodePath,
    nodeRoot,
    nodeSha256,
  };
};

const snapshotCanonicalWriteTarget = (destinationPath) => {
  const absolutePath = path.resolve(destinationPath);
  const parentPath = assertCanonicalDirectory(path.dirname(absolutePath), 'Toolchain lock parent');
  const destinationStat = fs.lstatSync(absolutePath, { bigint: true });
  if (
    destinationStat.isSymbolicLink()
    || !destinationStat.isFile()
    || fs.realpathSync(absolutePath) !== absolutePath
  ) {
    throw new Error('Toolchain lock must remain a canonical regular file');
  }
  const parentStat = fs.lstatSync(parentPath, { bigint: true });
  return {
    absolutePath,
    parentPath,
    destinationDevice: destinationStat.dev,
    destinationInode: destinationStat.ino,
    destinationMode: Number(destinationStat.mode & 0o777n),
    parentDevice: parentStat.dev,
    parentInode: parentStat.ino,
  };
};

const revalidateCanonicalWriteTarget = (snapshot) => {
  let current;
  try {
    current = snapshotCanonicalWriteTarget(snapshot.absolutePath);
  } catch (error) {
    throw new Error('Toolchain lock must remain a canonical regular file', { cause: error });
  }
  if (
    current.parentPath !== snapshot.parentPath
    || current.parentDevice !== snapshot.parentDevice
    || current.parentInode !== snapshot.parentInode
    || current.destinationDevice !== snapshot.destinationDevice
    || current.destinationInode !== snapshot.destinationInode
  ) {
    throw new Error('Toolchain lock destination or parent changed before atomic rename');
  }
};

const openExclusiveTemporary = (snapshot) => {
  const { O_CLOEXEC, O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR } = fs.constants;
  if (typeof O_NOFOLLOW !== 'number') {
    throw new Error('This platform cannot create a no-follow toolchain lock temporary');
  }
  const flags = O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | (O_CLOEXEC ?? 0);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const temporaryPath = path.join(
      snapshot.parentPath,
      `.${path.basename(snapshot.absolutePath)}.${process.pid}.${crypto.randomBytes(16).toString('hex')}.tmp`,
    );
    try {
      const descriptor = fs.openSync(temporaryPath, flags, snapshot.destinationMode);
      const stat = fs.fstatSync(descriptor, { bigint: true });
      if (!stat.isFile()) {
        fs.closeSync(descriptor);
        fs.unlinkSync(temporaryPath);
        throw new Error('Exclusive toolchain lock temporary must be a regular file');
      }
      return {
        descriptor,
        temporaryDevice: stat.dev,
        temporaryInode: stat.ino,
        temporaryPath,
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not allocate an exclusive toolchain lock temporary');
};

const sha256Descriptor = (descriptor) => {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  let bytesRead;
  do {
    bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
    if (bytesRead > 0) {
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
  } while (bytesRead > 0);
  return hash.digest('hex');
};

const unlinkMatchingInode = (filePath, device, inode) => {
  try {
    const stat = fs.lstatSync(filePath, { bigint: true });
    if (!stat.isSymbolicLink() && stat.dev === device && stat.ino === inode) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
};

const fsyncDirectory = (snapshot) => {
  const { O_CLOEXEC, O_DIRECTORY, O_NOFOLLOW, O_RDONLY } = fs.constants;
  if (typeof O_DIRECTORY !== 'number' || typeof O_NOFOLLOW !== 'number') {
    throw new Error('This platform cannot securely fsync the toolchain lock parent');
  }
  const descriptor = fs.openSync(
    snapshot.parentPath,
    O_RDONLY | O_DIRECTORY | O_NOFOLLOW | (O_CLOEXEC ?? 0),
  );
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (stat.dev !== snapshot.parentDevice || stat.ino !== snapshot.parentInode) {
      throw new Error('Toolchain lock parent changed during atomic rename');
    }
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

export const writeToolchainLockAtomically = (
  destinationPath,
  contents,
  {
    beforeRename = () => {},
    afterTemporaryRevalidation = () => {},
  } = {},
) => {
  const snapshot = snapshotCanonicalWriteTarget(destinationPath);
  const originalContents = fs.readFileSync(snapshot.absolutePath);
  const expectedDigest = crypto.createHash('sha256').update(contents).digest('hex');
  let descriptor;
  let temporaryDevice;
  let temporaryInode;
  let temporaryPath;
  let renamed = false;
  try {
    ({
      descriptor,
      temporaryDevice,
      temporaryInode,
      temporaryPath,
    } = openExclusiveTemporary(snapshot));
    fs.fchmodSync(descriptor, snapshot.destinationMode);
    fs.writeFileSync(descriptor, contents, { encoding: 'utf8' });
    fs.fsyncSync(descriptor);

    beforeRename({ destinationPath: snapshot.absolutePath, temporaryPath });
    revalidateCanonicalWriteTarget(snapshot);
    const temporaryStat = fs.lstatSync(temporaryPath, { bigint: true });
    if (
      temporaryStat.isSymbolicLink()
      || !temporaryStat.isFile()
      || temporaryStat.dev !== temporaryDevice
      || temporaryStat.ino !== temporaryInode
    ) {
      throw new Error('Toolchain lock temporary changed before atomic rename');
    }
    afterTemporaryRevalidation({ destinationPath: snapshot.absolutePath, temporaryPath });
    fs.renameSync(temporaryPath, snapshot.absolutePath);
    renamed = true;
    temporaryPath = undefined;
    const destinationStat = fs.lstatSync(snapshot.absolutePath, { bigint: true });
    const descriptorStat = fs.fstatSync(descriptor, { bigint: true });
    if (
      destinationStat.isSymbolicLink()
      || !destinationStat.isFile()
      || destinationStat.dev !== temporaryDevice
      || destinationStat.ino !== temporaryInode
      || descriptorStat.dev !== temporaryDevice
      || descriptorStat.ino !== temporaryInode
      || sha256Descriptor(descriptor) !== expectedDigest
    ) {
      throw new Error('Atomic toolchain lock destination does not match the fsynced temporary');
    }
    fsyncDirectory(snapshot);
  } catch (error) {
    if (renamed) {
      try {
        const recovery = openExclusiveTemporary(snapshot);
        try {
          fs.fchmodSync(recovery.descriptor, snapshot.destinationMode);
          fs.writeFileSync(recovery.descriptor, originalContents);
          fs.fsyncSync(recovery.descriptor);
          fs.renameSync(recovery.temporaryPath, snapshot.absolutePath);
          const restored = fs.lstatSync(snapshot.absolutePath, { bigint: true });
          if (
            restored.isSymbolicLink()
            || restored.dev !== recovery.temporaryDevice
            || restored.ino !== recovery.temporaryInode
            || fs.fstatSync(recovery.descriptor, { bigint: true }).ino !== recovery.temporaryInode
            || sha256Descriptor(recovery.descriptor) !== crypto.createHash('sha256').update(originalContents).digest('hex')
          ) {
            throw new Error('Could not verify the restored toolchain lock');
          }
          fs.fsyncSync(recovery.descriptor);
          fsyncDirectory(snapshot);
        } finally {
          fs.closeSync(recovery.descriptor);
          unlinkMatchingInode(
            recovery.temporaryPath,
            recovery.temporaryDevice,
            recovery.temporaryInode,
          );
        }
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'Atomic toolchain lock write failed and the original could not be restored',
        );
      }
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (temporaryPath !== undefined) {
      unlinkMatchingInode(temporaryPath, temporaryDevice, temporaryInode);
    }
  }
};

export const diffToolchainLocks = (tracked, generated, prefix = '') => {
  const trackedRecord = tracked !== null && typeof tracked === 'object' && !Array.isArray(tracked);
  const generatedRecord = generated !== null && typeof generated === 'object' && !Array.isArray(generated);
  if (trackedRecord && generatedRecord) {
    const keys = [...new Set([...Object.keys(tracked), ...Object.keys(generated)])].sort();
    return keys.flatMap((key) => diffToolchainLocks(
      tracked[key],
      generated[key],
      prefix ? `${prefix}.${key}` : key,
    ));
  }
  return JSON.stringify(tracked) === JSON.stringify(generated)
    ? []
    : [{ path: prefix, tracked, generated }];
};

export const parseToolchainLockMode = (args) => {
  if (args.length === 1 && (args[0] === '--check' || args[0] === '--write')) return args[0];
  throw new Error('Usage: node scripts/regenerate-toolchain-lock.mjs --check|--write');
};

export const assertSupportedToolchainLockPolicy = (tracked) => {
  if (
    ![1, 2, 3].includes(tracked?.schemaVersion)
    || tracked.acceptance?.databaseIdentity !== acceptanceDatabaseIdentity
  ) {
    throw new Error('Existing toolchain lock has an unsupported trust policy');
  }
  if (tracked.runtime?.browserPath !== canonicalBrowserPath) {
    throw new Error(`Existing toolchain lock must pin ${canonicalBrowserPath}`);
  }
};

export const generateToolchainLock = (root = defaultRoot) => {
  const canonicalRoot = assertCanonicalDirectory(root, 'Repository root');
  const lockPath = path.join(canonicalRoot, 'scripts', 'ecosystem-toolchain-lock.json');
  const packageLockPath = path.join(canonicalRoot, 'package-lock.json');
  const manifestPath = path.join(canonicalRoot, 'scripts', 'node-runtime-manifest.sha256');
  const bootstrapPath = path.join(canonicalRoot, 'scripts', 'run-trusted-ecosystem-node.sh');
  const nodeModulesPath = path.join(canonicalRoot, 'node_modules');
  for (const [filePath, label] of [
    [lockPath, 'Toolchain lock'],
    [packageLockPath, 'Package lock'],
    [manifestPath, 'Node runtime manifest'],
    [bootstrapPath, 'Trusted ecosystem bootstrap'],
  ]) assertRegularFile(filePath, label);
  assertCanonicalDirectory(nodeModulesPath, 'node_modules');

  const tracked = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assertSupportedToolchainLockPolicy(tracked);

  const {
    manifestSha256,
    nodePath,
    nodeRoot,
    nodeSha256,
  } = assertTrustedNodeRuntimePins({ bootstrapPath, manifestPath });

  const browserPath = canonicalBrowserPath;
  assertRegularFile(browserPath, 'Browser executable');
  const browserAppRoot = assertCanonicalDirectory(
    path.dirname(path.dirname(path.dirname(browserPath))),
    'Browser application',
  );
  if (!browserAppRoot.startsWith('/Applications/') || !browserAppRoot.endsWith('.app')) {
    throw new Error('Browser executable must belong to a canonical /Applications app bundle');
  }

  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  const playwrightVersion = packageLock.packages?.['node_modules/@playwright/test']?.version;
  const jestVersion = packageLock.packages?.['node_modules/jest']?.version;
  if (typeof playwrightVersion !== 'string' || typeof jestVersion !== 'string') {
    throw new Error('Package lock must contain the pinned Playwright and Jest packages');
  }

  const npmCliPath = fs.realpathSync(path.join(path.dirname(nodePath), 'npm'));
  assertRegularFile(npmCliPath, 'npm CLI');
  if (path.basename(npmCliPath) !== 'npm-cli.js') throw new Error('npm CLI must resolve to npm-cli.js');
  const npmRoot = assertCanonicalDirectory(path.dirname(path.dirname(npmCliPath)), 'npm installation');
  const gitPath = fs.realpathSync('/usr/bin/git');
  assertRegularFile(gitPath, 'System Git');

  const playwrightCliPath = fs.realpathSync(
    path.join(nodeModulesPath, '@playwright', 'test', 'cli.js'),
  );
  const jestCliPath = fs.realpathSync(path.join(nodeModulesPath, 'jest', 'bin', 'jest.js'));
  assertRegularFile(playwrightCliPath, 'Playwright CLI');
  assertRegularFile(jestCliPath, 'Jest CLI');

  return {
    schemaVersion: 3,
    packageLockSha256: sha256File(packageLockPath),
    nodeModulesTreeSha256: hashDependencyTree(
      nodeModulesPath,
      trustedWorkspaceSymlinkOptions(canonicalRoot),
    ),
    runtime: {
      platform: process.platform,
      architecture: process.arch,
      nodeSha256,
      nodeKegSha256: hashDependencyTree(nodeRoot, trustedNodeKegSymlinkOptions(npmRoot)),
      nodeRuntimeLibrariesSha256: hashNodeRuntimeLibraries(nodePath, nodeRoot),
      nodeRuntimeManifestSha256: manifestSha256,
      gitPath,
      gitSha256: sha256File(gitPath),
      npmCliPath,
      npmCliSha256: sha256File(npmCliPath),
      npmTreeSha256: hashDependencyTree(npmRoot),
      browserPath,
      browserSha256: sha256File(browserPath),
      browserAppTreeSha256: hashDependencyTree(browserAppRoot),
    },
    playwright: {
      version: playwrightVersion,
      cliSha256: sha256File(playwrightCliPath),
    },
    jest: {
      version: jestVersion,
      cliSha256: sha256File(jestCliPath),
    },
    acceptance: { databaseIdentity: acceptanceDatabaseIdentity },
  };
};

const describe = (value) => value === undefined ? '<missing>' : JSON.stringify(value);

export const runToolchainLockGenerator = ({
  mode,
  root = defaultRoot,
  output = console,
}) => {
  const canonicalRoot = assertCanonicalDirectory(root, 'Repository root');
  const lockPath = path.join(canonicalRoot, 'scripts', 'ecosystem-toolchain-lock.json');
  const tracked = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const generated = generateToolchainLock(canonicalRoot);
  const differences = diffToolchainLocks(tracked, generated);
  if (mode === '--check') {
    if (differences.length === 0) {
      output.log('Trusted ecosystem toolchain lock matches the installed toolchain.');
      return 0;
    }
    output.error('Trusted ecosystem toolchain lock differs from the installed toolchain:');
    for (const difference of differences) {
      output.error(
        `- ${difference.path}: tracked=${describe(difference.tracked)} generated=${describe(difference.generated)}`,
      );
    }
    return 1;
  }
  if (mode !== '--write') throw new Error('Unsupported toolchain lock mode');
  if (differences.length > 0) {
    writeToolchainLockAtomically(lockPath, `${JSON.stringify(generated, null, 2)}\n`);
  }
  output.log(
    differences.length === 0
      ? 'Trusted ecosystem toolchain lock was already current.'
      : `Updated trusted ecosystem toolchain lock (${differences.map((item) => item.path).join(', ')}).`,
  );
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runToolchainLockGenerator({
      mode: parseToolchainLockMode(process.argv.slice(2)),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
