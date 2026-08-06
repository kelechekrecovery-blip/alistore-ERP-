import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FEATURE_FLAG_CUTOVER_ACK,
  FEATURE_FLAG_LOCK_NAMES,
  deployWithFeatureFlagCutoverGate,
  validateFeatureFlagCutoverAcknowledgement,
} from './feature-flag-cutover-gate.mjs';
import { runBoundedCommand } from './run-bounded-command.mjs';

const releaseSha = 'a'.repeat(40);

test('production pending cutover requires an exact release-bound operator acknowledgement', () => {
  const base = {
    production: true,
    cutoverPending: true,
    registryExists: true,
    releaseSha,
  };
  assert.throws(
    () => validateFeatureFlagCutoverAcknowledgement(base),
    /FEATURE_FLAG_CUTOVER_ACK/,
  );
  assert.throws(
    () => validateFeatureFlagCutoverAcknowledgement({
      ...base,
      acknowledgement: FEATURE_FLAG_CUTOVER_ACK,
      acknowledgedSha: 'b'.repeat(40),
    }),
    /FEATURE_FLAG_CUTOVER_ACK_SHA/,
  );
  assert.doesNotThrow(() => validateFeatureFlagCutoverAcknowledgement({
    ...base,
    acknowledgement: FEATURE_FLAG_CUTOVER_ACK,
    acknowledgedSha: releaseSha,
  }));
});

test('already completed and fresh-schema deploys do not demand a cutover acknowledgement', () => {
  assert.doesNotThrow(() => validateFeatureFlagCutoverAcknowledgement({
    production: true,
    cutoverPending: false,
    registryExists: true,
  }));
  assert.doesNotThrow(() => validateFeatureFlagCutoverAcknowledgement({
    production: true,
    cutoverPending: true,
    registryExists: false,
  }));
});

test('production and production-mode staging blueprints declare the one-release acknowledgement', () => {
  for (const relativeUrl of ['../../../render.yaml', '../../../infra/render.staging.yaml']) {
    const blueprint = readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
    assert.match(blueprint, /key:\s*FEATURE_FLAG_CUTOVER_ACK(?:\n|\s)/u);
    assert.match(blueprint, /key:\s*FEATURE_FLAG_CUTOVER_ACK_SHA(?:\n|\s)/u);
  }
});

test('pending deploy drains every cooperative mutator lock until migration verification completes', async () => {
  const events = [];
  const client = fakeClient(events, { registryExists: true, cutoverComplete: false });
  let deployObservedLocks = false;
  await deployWithFeatureFlagCutoverGate({
    client,
    production: true,
    releaseSha,
    acknowledgement: FEATURE_FLAG_CUTOVER_ACK,
    acknowledgedSha: releaseSha,
    deploy: async () => {
      deployObservedLocks = FEATURE_FLAG_LOCK_NAMES.every((name) => events.includes(`lock:${name}`));
      events.push('deploy');
      client.cutoverComplete = true;
    },
  });
  assert.equal(deployObservedLocks, true);
  assert.ok(events.indexOf('deploy') < events.indexOf('verify'));
  assert.ok(events.indexOf('verify') < events.indexOf('rollback'));
  assert.equal(events.at(-1), 'end');
});

test('a migration failure releases the freeze and never includes the database URL in diagnostics', async () => {
  const events = [];
  const client = fakeClient(events, { registryExists: true, cutoverComplete: false });
  const secretUrl = 'postgresql://secret-user:secret-password@db.internal/alistore';
  await assert.rejects(deployWithFeatureFlagCutoverGate({
    client,
    production: false,
    deploy: async () => {
      throw new Error('prisma deploy failed');
    },
    diagnosticContext: secretUrl,
  }), (error) => {
    assert.match(error.message, /prisma deploy failed/);
    assert.doesNotMatch(error.message, /secret-user|secret-password|db\.internal/);
    return true;
  });
  assert.ok(events.includes('rollback'));
  assert.equal(events.at(-1), 'end');
});

test('a hung deploy reaches a hard deadline, releases the freeze, and terminates child processes', async () => {
  const events = [];
  const client = fakeClient(events, { registryExists: true, cutoverComplete: false });
  await assert.rejects(deployWithFeatureFlagCutoverGate({
    client,
    production: false,
    deployTimeoutMs: 20,
    deploy: () => new Promise(() => {}),
  }), /Prisma deploy exceeded the 20ms cutover deadline/);
  assert.ok(events.includes('idle-timeout:30020ms'));
  assert.ok(events.includes('rollback'));
  assert.equal(events.at(-1), 'end');

  await assert.rejects(runBoundedCommand(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1_000)'],
    { timeoutMs: 25 },
  ), /exceeded its 25ms deadline/);
});

test('termination signals kill and await the detached deploy group before propagating', async () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'feature-flag-cutover-signal-'));
  const readyFile = path.join(fixtureDir, 'ready');
  const survivorFile = path.join(fixtureDir, 'survivor');
  const runnerUrl = new URL('./run-bounded-command.mjs', import.meta.url).href;
  const descendant = [
    "const { writeFileSync } = require('node:fs');",
    "setTimeout(() => writeFileSync(process.env.SURVIVOR_FILE, 'survived'), 250);",
  ].join(' ');
  const deployChild = [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { env: process.env, stdio: 'ignore' });`,
    "writeFileSync(process.env.READY_FILE, 'ready');",
    'setInterval(() => {}, 1_000);',
  ].join(' ');
  const wrapper = [
    `const { runBoundedCommand } = await import(${JSON.stringify(runnerUrl)});`,
    `await runBoundedCommand(process.execPath, ['-e', ${JSON.stringify(deployChild)}], { timeoutMs: 5_000 });`,
  ].join(' ');

  const processUnderTest = spawn(process.execPath, ['--input-type=module', '-e', wrapper], {
    env: { ...process.env, READY_FILE: readyFile, SURVIVOR_FILE: survivorFile },
    stdio: 'ignore',
  });
  try {
    await waitFor(() => existsSync(readyFile), 1_000);
    const closed = new Promise((resolve) => {
      processUnderTest.once('close', (code, signal) => resolve({ code, signal }));
    });
    processUnderTest.kill('SIGTERM');
    assert.deepEqual(await closed, { code: null, signal: 'SIGTERM' });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(existsSync(survivorFile), false);
  } finally {
    if (processUnderTest.exitCode === null && processUnderTest.signalCode === null) {
      processUnderTest.kill('SIGKILL');
    }
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});

test('an uncaught wrapper failure synchronously kills its detached deploy descendants', async () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'feature-flag-cutover-exit-'));
  const readyFile = path.join(fixtureDir, 'ready');
  const survivorFile = path.join(fixtureDir, 'survivor');
  const runnerUrl = new URL('./run-bounded-command.mjs', import.meta.url).href;
  const descendant = [
    "const { writeFileSync } = require('node:fs');",
    "setTimeout(() => writeFileSync(process.env.SURVIVOR_FILE, 'survived'), 250);",
  ].join(' ');
  const deployChild = [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { env: process.env, stdio: 'ignore' });`,
    "writeFileSync(process.env.READY_FILE, 'ready');",
    'setInterval(() => {}, 1_000);',
  ].join(' ');
  const wrapper = [
    "const { existsSync } = await import('node:fs');",
    `const { runBoundedCommand } = await import(${JSON.stringify(runnerUrl)});`,
    `void runBoundedCommand(process.execPath, ['-e', ${JSON.stringify(deployChild)}], { timeoutMs: 5_000 });`,
    "const crash = setInterval(() => { if (existsSync(process.env.READY_FILE)) { clearInterval(crash); throw new Error('uncaught wrapper failure'); } }, 10);",
  ].join(' ');

  const processUnderTest = spawn(process.execPath, ['--input-type=module', '-e', wrapper], {
    env: { ...process.env, READY_FILE: readyFile, SURVIVOR_FILE: survivorFile },
    stdio: 'ignore',
  });
  const closed = new Promise((resolve) => {
    processUnderTest.once('close', (code, signal) => resolve({ code, signal }));
  });
  try {
    await waitFor(() => existsSync(readyFile), 1_000);
    assert.deepEqual(await closed, { code: 1, signal: null });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(existsSync(survivorFile), false);
  } finally {
    if (processUnderTest.exitCode === null && processUnderTest.signalCode === null) {
      processUnderTest.kill('SIGKILL');
    }
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});

function fakeClient(events, initial) {
  return {
    ...initial,
    async connect() { events.push('connect'); },
    async end() { events.push('end'); },
    async query(sql, values = []) {
      if (sql === 'BEGIN') {
        events.push('begin');
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        events.push('rollback');
        return { rows: [] };
      }
      if (sql.includes('to_regclass')) {
        events.push('inspect');
        return { rows: [{ registry_exists: this.registryExists, migrations_exists: true }] };
      }
      if (sql.includes('migration_name')) {
        if (events.includes('deploy')) events.push('verify');
        return { rows: [{ complete: this.cutoverComplete }] };
      }
      if (sql.includes('lock_timeout')) {
        events.push('timeout');
        return { rows: [] };
      }
      if (sql.includes('idle_in_transaction_session_timeout')) {
        events.push(`idle-timeout:${values[0]}`);
        return { rows: [{ timeout: values[0] }] };
      }
      if (sql.includes('pg_advisory_xact_lock')) {
        events.push(`lock:${values[0]}`);
        return { rows: [{ locked: true }] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    },
  };
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for child fixture');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
