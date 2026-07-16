import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sha256File = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

export const resolveTrustedGit = (root) => {
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts', 'ecosystem-toolchain-lock.json'), 'utf8'),
  );
  const executablePath = fs.realpathSync('/usr/bin/git');
  const executableSha256 = sha256File(executablePath);
  const gitPath = path.join(root, '.git');
  const gitPathStat = fs.lstatSync(gitPath);
  const gitDirectory = fs.realpathSync(gitPath);
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
    lock.runtime?.gitPath !== executablePath ||
    lock.runtime?.gitSha256 !== executableSha256 ||
    gitPathStat.isSymbolicLink() ||
    !gitPathStat.isDirectory() ||
    !fs.lstatSync(gitDirectory).isDirectory()
  ) {
    throw new Error('Git does not match the tracked ecosystem toolchain lock.');
  }
  const replaceRefs = execFileSync(
    executablePath,
    [`--git-dir=${gitDirectory}`, `--work-tree=${root}`, '--no-replace-objects', 'for-each-ref', '--format=%(refname)', 'refs/replace'],
    { cwd: root, encoding: 'utf8', env: environment },
  ).trim();
  if (replaceRefs) throw new Error('Git replacement refs are not allowed for ecosystem evidence.');

  return {
    executablePath,
    executableSha256,
    gitDirectory,
    environment,
  };
};

export const trustedGitArgs = (git, root, args) => [
  `--git-dir=${git.gitDirectory}`,
  `--work-tree=${root}`,
  '--no-replace-objects',
  ...args,
];

export const runTrustedGit = (git, root, args, options = {}) => execFileSync(
  git.executablePath,
  trustedGitArgs(git, root, args),
  { cwd: root, env: git.environment, ...options },
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
