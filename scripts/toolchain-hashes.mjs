import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

export const sha256File = (filePath) => {
  const hash = crypto.createHash('sha256');
  updateHashWithFile(hash, filePath);
  return hash.digest('hex');
};

const sha256Bytes = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const updateFrame = (hash, recordType, fields) => {
  hash.update(Buffer.from([recordType]));
  for (const value of fields) {
    const bytes = Buffer.from(value);
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(length).update(bytes);
  }
};

const isWithin = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const canonicalDirectory = (directory, label) => {
  const absolute = path.resolve(directory);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be a canonical directory`);
  }
  return absolute;
};

const generatedWorkspaceNames = new Set(['.artifacts', '.cache', '.next', 'coverage']);
const generatedWorkspacePrefixes = ['.next-e2e-'];
const nonReproducibleNativeOutputPaths = [
  path.join('node_modules', 'cpu-features', 'build'),
  path.join('node_modules', 'ssh2', 'lib', 'protocol', 'crypto', 'build'),
];
const normalizedPrismaClientPaths = new Set([
  path.join('.prisma', 'client', 'edge.js'),
  path.join('.prisma', 'client', 'index.js'),
]);

const countBufferOccurrences = (source, needle) => {
  let count = 0;
  let offset = 0;
  while (offset <= source.length - needle.length) {
    const index = source.indexOf(needle, offset);
    if (index === -1) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
};

const replacePrismaMetadataValue = (
  source,
  {
    expectedValue,
    fieldMarker,
    label,
    prefix,
    suffix,
    token,
  },
) => {
  const markerBytes = Buffer.from(fieldMarker);
  const prefixBytes = Buffer.from(prefix);
  const suffixBytes = Buffer.from(suffix);
  if (
    countBufferOccurrences(source, markerBytes) !== 1
    || countBufferOccurrences(source, prefixBytes) !== 1
  ) {
    throw new Error(`Prisma generated metadata must contain exactly one ${label}`);
  }

  const prefixIndex = source.indexOf(prefixBytes);
  const valueStart = prefixIndex + prefixBytes.length;
  const expectedBytes = Buffer.from(JSON.stringify(expectedValue));
  const valueEnd = valueStart + expectedBytes.length;
  if (
    !source.subarray(valueStart, valueEnd).equals(expectedBytes)
    || !source.subarray(valueEnd, valueEnd + suffixBytes.length).equals(suffixBytes)
  ) {
    throw new Error(`Prisma generated metadata has an unexpected ${label}`);
  }

  return Buffer.concat([
    source.subarray(0, valueStart),
    Buffer.from(JSON.stringify(token)),
    source.subarray(valueEnd),
  ]);
};

const normalizePrismaGeneratedMetadata = (filePath, repositoryRoot) => {
  const outputPath = path.join(repositoryRoot, 'node_modules', '@prisma', 'client');
  const schemaPath = path.join(repositoryRoot, 'apps', 'api', 'prisma', 'schema.prisma');
  const encodedRoot = Buffer.from(JSON.stringify(repositoryRoot).slice(1, -1));
  let source = fs.readFileSync(filePath);
  if (countBufferOccurrences(source, encodedRoot) !== 2) {
    throw new Error('Prisma generated metadata must contain exactly two canonical repository roots');
  }
  source = replacePrismaMetadataValue(source, {
    expectedValue: outputPath,
    fieldMarker: '"output":',
    label: 'client output field',
    prefix: '"output": {\n      "value": ',
    suffix: ',\n      "fromEnvVar": null\n    },',
    token: '<ALISTORE_PRISMA_CLIENT_OUTPUT>',
  });
  source = replacePrismaMetadataValue(source, {
    expectedValue: schemaPath,
    fieldMarker: '"sourceFilePath":',
    label: 'schema source field',
    prefix: '"previewFeatures": [],\n    "sourceFilePath": ',
    suffix: '\n  },',
    token: '<ALISTORE_PRISMA_SCHEMA_SOURCE>',
  });
  if (countBufferOccurrences(source, encodedRoot) !== 0) {
    throw new Error('Prisma generated metadata contains an unapproved canonical repository root');
  }
  return source;
};

const assertNoNativeLifecycleOutputs = (repositoryRoot) => {
  for (const relativePath of nonReproducibleNativeOutputPaths) {
    const outputPath = path.join(repositoryRoot, relativePath);
    try {
      fs.lstatSync(outputPath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(
      `Native dependency lifecycle output must be absent before trust verification: ${outputPath}`,
    );
  }
};

const assertNoWorkspaceGeneratedOutputs = (repositoryRoot) => {
  for (const workspace of ['apps/api', 'apps/web']) {
    const workspaceRoot = path.join(repositoryRoot, workspace);
    for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (
        generatedWorkspaceNames.has(entry.name)
        || generatedWorkspacePrefixes.some((prefix) => entry.name.startsWith(prefix))
      ) {
        throw new Error(`Generated workspace output must be absent before trust verification: ${path.join(workspaceRoot, entry.name)}`);
      }
    }
  }
};

export const trustedWorkspaceSymlinkOptions = (
  repositoryRoot,
  { allowGeneratedOutputs = false } = {},
) => {
  const canonicalRoot = canonicalDirectory(repositoryRoot, 'Repository root');
  if (!allowGeneratedOutputs) assertNoWorkspaceGeneratedOutputs(canonicalRoot);
  assertNoNativeLifecycleOutputs(canonicalRoot);
  const ignoredPaths = allowGeneratedOutputs ? [...generatedWorkspaceNames] : [];
  const ignoredPathPrefixes = allowGeneratedOutputs ? generatedWorkspacePrefixes : [];
  return {
    externalSymlinks: new Map([
      ['@alistore/api', {
        expectedPath: path.join(canonicalRoot, 'apps', 'api'),
        identity: 'workspace:apps/api',
        ignoredPaths,
        ignoredPathPrefixes,
      }],
      ['@alistore/web', {
        expectedPath: path.join(canonicalRoot, 'apps', 'web'),
        identity: 'workspace:apps/web',
        ignoredPaths,
        ignoredPathPrefixes,
      }],
    ]),
    normalizeFileContent: (filePath, relativePath) => (
      normalizedPrismaClientPaths.has(relativePath)
        ? normalizePrismaGeneratedMetadata(filePath, canonicalRoot)
        : undefined
    ),
  };
};

export const trustedNodeKegSymlinkOptions = (npmRoot) => ({
  externalSymlinks: new Map([
    ['bin/npm', {
      expectedPath: path.join(npmRoot, 'bin', 'npm-cli.js'),
      identity: 'trusted-npm:npm-cli.js',
    }],
    ['bin/npx', {
      expectedPath: path.join(npmRoot, 'bin', 'npx-cli.js'),
      identity: 'trusted-npm:npx-cli.js',
    }],
  ]),
});

export const hashDependencyTree = (directory, options = {}) => {
  const root = canonicalDirectory(directory, 'Dependency tree');
  const ignoredPaths = new Set(options.ignoredPaths ?? []);
  const ignoredPathPrefixes = options.ignoredPathPrefixes ?? [];
  const externalSymlinks = options.externalSymlinks ?? new Map();
  const normalizeFileContent = options.normalizeFileContent;
  const hash = crypto.createHash('sha256');
  hash.update('alistore-dependency-tree-v3\0');

  const isIgnoredRelativePath = (relativePath) => {
    const parts = relativePath.split(path.sep);
    for (let count = 1; count <= parts.length; count += 1) {
      const candidate = path.join(...parts.slice(0, count));
      if (
        ignoredPaths.has(candidate)
        || ignoredPathPrefixes.some((prefix) => candidate.startsWith(prefix))
      ) return true;
    }
    return false;
  };

  const canonicalPolicyTarget = (policy) => {
    const expected = path.resolve(policy.expectedPath);
    const stat = fs.lstatSync(expected);
    if (
      stat.isSymbolicLink()
      || (!stat.isFile() && !stat.isDirectory())
      || fs.realpathSync(expected) !== expected
    ) {
      throw new Error(`External symlink policy target must be canonical: ${policy.expectedPath}`);
    }
    return { expected, stat };
  };

  const hashExternalTarget = (policy, expected, stat) => {
    if (stat.isFile()) return `file:${sha256File(expected)}`;
    if (stat.isDirectory()) {
      return `tree:${hashDependencyTree(expected, {
        ignoredPaths: policy.ignoredPaths ?? [],
        ignoredPathPrefixes: policy.ignoredPathPrefixes ?? [],
        externalSymlinks: policy.externalSymlinks ?? new Map(),
      })}`;
    }
    throw new Error(`Unsupported external symlink target: ${policy.expectedPath}`);
  };

  const visit = (current, relative = '') => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.join(relative, entry.name);
      if (isIgnoredRelativePath(relativePath)) continue;
      if (entry.isSymbolicLink()) {
        const link = fs.readlinkSync(entryPath);
        let resolved;
        try {
          resolved = fs.realpathSync(entryPath);
        } catch {
          throw new Error(`Dangling dependency-tree symlink: ${entryPath}`);
        }
        if (isWithin(root, resolved)) {
          if (isIgnoredRelativePath(path.relative(root, resolved))) {
            throw new Error(`Dependency-tree symlink targets an ignored subtree: ${entryPath}`);
          }
          updateFrame(hash, 3, [relativePath, link, `internal:${path.relative(root, resolved)}`]);
          continue;
        }
        const policy = externalSymlinks.get(relativePath);
        if (!policy) {
          throw new Error(`Dependency-tree symlink escapes its trusted root: ${entryPath}`);
        }
        const { expected, stat } = canonicalPolicyTarget(policy);
        if (expected !== resolved) {
          throw new Error(`Dependency-tree symlink escapes its trusted root: ${entryPath}`);
        }
        updateFrame(hash, 3, [relativePath, link, policy.identity, hashExternalTarget(policy, expected, stat)]);
      } else if (entry.isDirectory()) {
        updateFrame(hash, 2, [relativePath]);
        visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        const normalized = normalizeFileContent?.(entryPath, relativePath);
        if (normalized !== undefined && !Buffer.isBuffer(normalized)) {
          throw new Error('Dependency-tree file normalizer must return a Buffer or undefined');
        }
        updateFrame(hash, 1, [
          relativePath,
          normalized === undefined ? sha256File(entryPath) : sha256Bytes(normalized),
        ]);
      } else {
        throw new Error(`Unsupported dependency-tree entry: ${entryPath}`);
      }
    }
  };
  visit(root);
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
  hash.update('alistore-node-runtime-libraries-v2\0');
  for (const filePath of resolveNodeRuntimeLibraries(nodePath, nodeRoot)) {
    updateFrame(hash, 1, [filePath, sha256File(filePath)]);
  }
  return hash.digest('hex');
};
