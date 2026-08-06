import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const unavailable = Object.freeze({ status: 'unavailable' });

function runCommand(file, args, cwd) {
  try {
    return spawnSync(file, args, {
      cwd,
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return { status: 1, stdout: '', stderr: '', error };
  }
}

function outputOf(result) {
  if (result?.error || result?.status !== 0) return null;
  const output = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`
    .split(/\r?\n/u)
    .find((line) => line.trim());
  return output?.trim() || null;
}

function versionOf(run, cwd, file, args) {
  const version = outputOf(run(file, args, cwd));
  return version ? { status: 'available', version } : unavailable;
}

function gitValue(run, cwd, args) {
  return outputOf(run('git', args, cwd));
}

export function parseChangedPaths(statusOutput) {
  const entries = String(statusOutput ?? '').split('\0');
  const paths = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (path) paths.add(path);
    if (status.includes('R') || status.includes('C')) index += 1;
  }

  return [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function collectBaseline({ cwd = process.cwd(), capturedAt = new Date().toISOString(), run = runCommand } = {}) {
  const changed = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd);
  const gradleWrapper = join(cwd, 'apps/android/gradlew');
  const playwright = join(cwd, 'node_modules/.bin/playwright');

  return {
    capturedAt,
    git: {
      sha: gitValue(run, cwd, ['rev-parse', 'HEAD']),
      branch: gitValue(run, cwd, ['branch', '--show-current']),
      changedPaths: parseChangedPaths(changed.stdout),
    },
    runtime: {
      node: versionOf(run, cwd, 'node', ['--version']),
      npm: versionOf(run, cwd, 'npm', ['--version']),
    },
    tools: {
      postgresClient: versionOf(run, cwd, 'psql', ['--version']),
      postgresServer: versionOf(run, cwd, 'psql', ['-Atqc', 'SHOW server_version']),
      java: versionOf(run, cwd, 'java', ['-version']),
      gradleWrapper: versionOf(run, cwd, gradleWrapper, ['--version']),
      xcode: versionOf(run, cwd, 'xcodebuild', ['-version']),
      swift: versionOf(run, cwd, 'swift', ['--version']),
      xcodegen: versionOf(run, cwd, 'xcodegen', ['--version']),
      playwright: versionOf(run, cwd, playwright, ['--version']),
    },
  };
}

export function writeBaseline(baseline, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

const invokedPath = process.argv[1] && fileURLToPath(import.meta.url);
if (invokedPath === process.argv[1]) {
  const outputPath = join(process.cwd(), '.artifacts/gate-0/baseline.json');
  writeBaseline(collectBaseline(), outputPath);
  console.log(`Gate 0 baseline written to ${outputPath}`);
}
