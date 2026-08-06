import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TRUSTED_COMMON_GIT_DIRECTORY = '/Users/alistore/Desktop/alistore-erp/.git';

const sha256File = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const trustError = () => new Error('Git does not match the tracked ecosystem toolchain lock.');

const readMetadataLine = (filePath) => {
  const stat = fs.lstatSync(filePath);
  const contents = fs.readFileSync(filePath, 'utf8');
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    !/^[^\0\r\n]+\n?$/u.test(contents)
  ) throw trustError();
  return contents.endsWith('\n') ? contents.slice(0, -1) : contents;
};

const resolveCanonicalDirectory = (candidate) => {
  const absolute = path.resolve(candidate);
  const resolved = fs.realpathSync(absolute);
  const stat = fs.lstatSync(absolute);
  if (resolved !== absolute || stat.isSymbolicLink() || !stat.isDirectory()) throw trustError();
  return resolved;
};

const resolveRepositoryLayout = (root) => {
  const workTree = resolveCanonicalDirectory(root);
  const markerPath = path.join(workTree, '.git');
  const markerStat = fs.lstatSync(markerPath);

  if (markerStat.isSymbolicLink()) throw trustError();
  if (markerStat.isDirectory()) {
    const gitDirectory = resolveCanonicalDirectory(markerPath);
    return { commonDirectory: gitDirectory, gitDirectory, workTree };
  }
  if (!markerStat.isFile()) throw trustError();

  const marker = readMetadataLine(markerPath);
  if (!marker.startsWith('gitdir: ') || marker.length === 'gitdir: '.length) throw trustError();
  const gitDirectoryReference = marker.slice('gitdir: '.length);
  const gitDirectory = resolveCanonicalDirectory(
    path.isAbsolute(gitDirectoryReference)
      ? gitDirectoryReference
      : path.join(workTree, gitDirectoryReference),
  );
  const commonReference = readMetadataLine(path.join(gitDirectory, 'commondir'));
  const commonDirectory = resolveCanonicalDirectory(
    path.isAbsolute(commonReference)
      ? commonReference
      : path.join(gitDirectory, commonReference),
  );
  const worktreesDirectory = path.dirname(gitDirectory);
  if (
    path.basename(worktreesDirectory) !== 'worktrees' ||
    path.dirname(worktreesDirectory) !== commonDirectory
  ) throw trustError();

  const backpointer = readMetadataLine(path.join(gitDirectory, 'gitdir'));
  const backpointerPath = path.resolve(gitDirectory, backpointer);
  if (backpointerPath !== markerPath) throw trustError();

  return { commonDirectory, gitDirectory, workTree };
};

export const resolveTrustedGit = (root) => {
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts', 'ecosystem-toolchain-lock.json'), 'utf8'),
  );
  const executablePath = fs.realpathSync('/usr/bin/git');
  const executableSha256 = sha256File(executablePath);
  let repositoryLayout;
  let trustedCommonDirectory;
  try {
    repositoryLayout = resolveRepositoryLayout(root);
    trustedCommonDirectory = resolveCanonicalDirectory(TRUSTED_COMMON_GIT_DIRECTORY);
  } catch {
    throw trustError();
  }
  const { commonDirectory, gitDirectory, workTree } = repositoryLayout;
  const environment = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    HOME: process.env.HOME ?? root,
    LANG: process.env.LANG ?? 'C',
    PATH: '/usr/bin:/bin',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
  };

  if (
    lock.schemaVersion !== 3 ||
    lock.runtime?.gitPath !== executablePath ||
    lock.runtime?.gitSha256 !== executableSha256 ||
    commonDirectory !== trustedCommonDirectory
  ) {
    throw trustError();
  }
  const repositoryFacts = execFileSync(
    executablePath,
    [
      `--git-dir=${gitDirectory}`,
      `--work-tree=${workTree}`,
      '--no-replace-objects',
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--absolute-git-dir',
      '--git-common-dir',
      '--is-inside-work-tree',
    ],
    { cwd: workTree, encoding: 'utf8', env: environment },
  ).trim().split('\n');
  if (
    repositoryFacts.length !== 4 ||
    repositoryFacts[0] !== workTree ||
    repositoryFacts[1] !== gitDirectory ||
    repositoryFacts[2] !== commonDirectory ||
    repositoryFacts[3] !== 'true'
  ) throw trustError();
  const replaceRefs = execFileSync(
    executablePath,
    [`--git-dir=${gitDirectory}`, `--work-tree=${workTree}`, '--no-replace-objects', 'for-each-ref', '--format=%(refname)', 'refs/replace'],
    { cwd: workTree, encoding: 'utf8', env: environment },
  ).trim();
  if (replaceRefs) throw new Error('Git replacement refs are not allowed for ecosystem evidence.');

  return {
    executablePath,
    executableSha256,
    commonDirectory,
    gitDirectory,
    environment,
    workTree,
  };
};

export const trustedGitArgs = (git, root, args) => {
  const workTree = resolveCanonicalDirectory(root);
  if (git.workTree !== workTree) throw trustError();
  return [
    `--git-dir=${git.gitDirectory}`,
    `--work-tree=${workTree}`,
    '--no-replace-objects',
    ...args,
  ];
};

export const runTrustedGit = (git, root, args, options = {}) => execFileSync(
  git.executablePath,
  trustedGitArgs(git, root, args),
  { ...options, cwd: git.workTree, env: git.environment },
);

export const inspectHeadWorktree = (git, root, paths) => {
  const records = runTrustedGit(git, root, ['ls-tree', '-r', '-z', 'HEAD', '--', ...paths], {
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const files = [];
  const mismatches = [];

  for (const record of records) {
    const match = /^(\d+)\s+(\w+)\s+([a-f0-9]+)\t(.+)$/u.exec(record);
    if (!match) throw new Error(`Unexpected Git tree record: ${record}`);
    const [, mode, type, objectId, relativePath] = match;
    files.push(relativePath);
    const absolutePath = path.join(root, relativePath);
    const relativeCheck = path.relative(root, absolutePath);
    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck) || !fs.existsSync(absolutePath)) {
      mismatches.push(relativePath);
      continue;
    }
    const stat = fs.lstatSync(absolutePath);
    let actual;
    if (mode === '120000') {
      if (!stat.isSymbolicLink()) {
        mismatches.push(relativePath);
        continue;
      }
      actual = Buffer.from(fs.readlinkSync(absolutePath));
    } else if (type === 'blob' && /^100\d{3}$/u.test(mode)) {
      if (!stat.isFile() || stat.isSymbolicLink()) {
        mismatches.push(relativePath);
        continue;
      }
      actual = fs.readFileSync(absolutePath);
    } else {
      throw new Error(`Unsupported Git tree entry for evidence: ${relativePath}`);
    }
    const expected = runTrustedGit(git, root, ['cat-file', 'blob', objectId], { encoding: null });
    if (!actual.equals(expected)) mismatches.push(relativePath);
  }

  const specialIndexEntries = runTrustedGit(
    git,
    root,
    ['ls-files', '-v', '-z', '--', ...paths],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry[0] !== 'H')
    .map((entry) => entry.slice(2));

  return {
    files: files.sort(),
    matches: mismatches.length === 0 && specialIndexEntries.length === 0,
    mismatches,
    specialIndexEntries,
  };
};
