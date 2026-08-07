import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const globalSetupUrl = pathToFileURL(path.join(projectRoot, 'e2e', 'global-setup.ts')).href;

const runPreparation = (t, exitCode) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'alistore-e2e-global-setup-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'apps', 'api'), { recursive: true });
  const prismaBin = path.join(fixture, 'node_modules', '.bin', 'prisma');
  fs.mkdirSync(path.dirname(prismaBin), { recursive: true });
  fs.writeFileSync(
    prismaBin,
    [
      '#!/bin/sh',
      "printf 'PRISMA_STDOUT_SENTINEL\\n'",
      "printf 'PRISMA_STDERR_SENTINEL\\n' >&2",
      `exit ${exitCode}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const setup = await import(${JSON.stringify(globalSetupUrl)}); setup.prepareIsolatedDatabase();`,
    ],
    {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        E2E_DATABASE_URL:
          'postgresql://alistore@127.0.0.1:5432/alistore_visual_runner_test?schema=public',
      },
    },
  );
};

test('keeps successful database preparation output off Playwright JSON stdout', (t) => {
  const result = runPreparation(t, 0);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /PRISMA_/u);
  assert.match(result.stderr, /PRISMA_STDOUT_SENTINEL/u);
  assert.match(result.stderr, /PRISMA_STDERR_SENTINEL/u);
});

test('preserves database preparation diagnostics on failure without polluting stdout', (t) => {
  const result = runPreparation(t, 7);

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /PRISMA_/u);
  assert.match(result.stderr, /PRISMA_STDOUT_SENTINEL/u);
  assert.match(result.stderr, /PRISMA_STDERR_SENTINEL/u);
});
