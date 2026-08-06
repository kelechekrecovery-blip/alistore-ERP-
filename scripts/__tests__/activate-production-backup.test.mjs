import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { activateProductionBackup, parseLaunchctlRunningState } from '../activate-production-backup.mjs';

const projectRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

test('dry run validates config and plist without touching LaunchAgents or launchctl state', async () => {
  const calls = [];
  const result = await activateProductionBackup({
    projectRoot,
    userHome: '/Users/test',
    nodePath: '/opt/homebrew/bin/node',
    run: async (command, args) => calls.push([command, ...args]),
    makeDirectory: async () => assert.fail('dry run must not create LaunchAgents'),
    move: async () => assert.fail('dry run must not install a plist'),
    inspectService: async () => assert.fail('dry run must not inspect launchd state'),
  });
  assert.equal(result.activated, false);
  assert.deepEqual(calls.map((call) => call[0]), ['/opt/homebrew/bin/node', '/usr/bin/plutil']);
  assert.match(result.plist, /production-postgres-backup\.mjs/u);
  assert.match(result.plist, /<key>ExitTimeOut<\/key>\s*<integer>120<\/integer>/u);
  assert.doesNotMatch(result.plist, /alistore_dev|MINIO_ROOT_PASSWORD|AWS_SECRET_ACCESS_KEY/u);
});

test('apply atomically reloads an idle agent without automatically running a backup', async (t) => {
  const userHome = await temporaryHome(t);
  const calls = [];
  const result = await activateProductionBackup({
    projectRoot,
    userHome,
    uid: 501,
    nodePath: '/opt/homebrew/bin/node',
    apply: true,
    allowEphemeralRoot: true,
    acquireCoordinationLock: inertCoordinationLock,
    run: async (command, args) => calls.push([command, ...args]),
    inspectService: async () => ({ loaded: true, running: false }),
  });
  assert.equal(result.activated, true);
  assert.deepEqual(calls.slice(-2), [
    ['/bin/launchctl', 'bootout', 'gui/501/kg.alistore.backup'],
    ['/bin/launchctl', 'bootstrap', 'gui/501', join(userHome, 'Library', 'LaunchAgents', 'kg.alistore.backup.plist')],
  ]);
  assert.equal(calls.some((call) => call.includes('kickstart')), false);
  const installed = await readFile(result.installedPlist, 'utf8');
  assert.match(installed, /production-postgres-backup\.mjs/u);
  assert.doesNotMatch(installed, /DATABASE_URL|SECRET|PASSWORD/u);
});

test('activation refuses to interrupt a running backup', async (t) => {
  const userHome = await temporaryHome(t);
  const calls = [];
  await assert.rejects(
    activateProductionBackup({
      projectRoot,
      userHome,
      apply: true,
      allowEphemeralRoot: true,
      acquireCoordinationLock: inertCoordinationLock,
      run: async (command, args) => calls.push([command, ...args]),
      inspectService: async () => ({ loaded: true, running: true }),
    }),
    /while it is running/u,
  );
  assert.equal(calls.some((call) => call[0] === '/bin/launchctl'), false);
});

test('coordination lock plus immediate re-check closes idle-to-running activation race', async (t) => {
  const userHome = await temporaryHome(t);
  const calls = [];
  let inspections = 0;
  let releases = 0;
  await assert.rejects(
    activateProductionBackup({
      projectRoot,
      userHome,
      apply: true,
      allowEphemeralRoot: true,
      acquireCoordinationLock: async () => async () => { releases += 1; },
      inspectService: async () => inspections++ === 0
        ? { loaded: true, running: false }
        : { loaded: true, running: true },
      run: async (command, args) => calls.push([command, ...args]),
    }),
    /started during activation preparation/u,
  );
  assert.equal(releases, 1);
  assert.equal(calls.some((call) => call[0] === '/bin/launchctl'), false);
});

test('launchctl parser ignores active resource coalitions for an otherwise stopped job', () => {
  assert.equal(parseLaunchctlRunningState('active count = 0\nstate = not running\nresource coalition = {\n active count = 1\n}'), false);
  assert.equal(parseLaunchctlRunningState('active count = 1\nstate = running\n'), true);
});

test('failed bootstrap restores the previous plist and re-bootstraps it', async (t) => {
  const userHome = await temporaryHome(t);
  const launchAgents = join(userHome, 'Library', 'LaunchAgents');
  const installed = join(launchAgents, 'kg.alistore.backup.plist');
  await mkdir(launchAgents, { recursive: true });
  await writeFile(installed, '<plist>previous-safe-agent</plist>', { mode: 0o600 });
  const launchCalls = [];
  let bootstrapCount = 0;
  const run = async (command, args) => {
    if (command !== '/bin/launchctl') return '';
    launchCalls.push([command, ...args]);
    if (args[0] === 'bootstrap' && bootstrapCount++ === 0) throw new Error('new plist rejected');
    return '';
  };

  await assert.rejects(
    activateProductionBackup({
      projectRoot,
      userHome,
      uid: 501,
      apply: true,
      allowEphemeralRoot: true,
      acquireCoordinationLock: inertCoordinationLock,
      run,
      inspectService: async () => ({ loaded: true, running: false }),
    }),
    /previous LaunchAgent restored/u,
  );
  assert.equal(await readFile(installed, 'utf8'), '<plist>previous-safe-agent</plist>');
  assert.deepEqual(launchCalls.map((call) => call[1]), ['bootout', 'bootstrap', 'bootout', 'bootstrap']);
});

test('failed first installation removes the rejected plist', async (t) => {
  const userHome = await temporaryHome(t);
  const installed = join(userHome, 'Library', 'LaunchAgents', 'kg.alistore.backup.plist');
  await assert.rejects(
    activateProductionBackup({
      projectRoot,
      userHome,
      apply: true,
      allowEphemeralRoot: true,
      acquireCoordinationLock: inertCoordinationLock,
      inspectService: async () => ({ loaded: false, running: false }),
      run: async (command, args) => {
        if (command === '/bin/launchctl' && args[0] === 'bootstrap') throw new Error('rejected');
        return '';
      },
    }),
    /rejected LaunchAgent removed/u,
  );
  await assert.rejects(readFile(installed), { code: 'ENOENT' });
});

test('explicit run-now releases activation lock before kickstart', async (t) => {
  const userHome = await temporaryHome(t);
  const events = [];
  const result = await activateProductionBackup({
    projectRoot,
    userHome,
    apply: true,
    runNow: true,
    allowEphemeralRoot: true,
    acquireCoordinationLock: async () => async () => { events.push('lock-released'); },
    inspectService: async () => ({ loaded: false, running: false }),
    run: async (command, args) => {
      if (command === '/bin/launchctl') events.push(args[0]);
      return '';
    },
  });
  assert.equal(result.activated, true);
  assert.ok(events.indexOf('lock-released') < events.indexOf('kickstart'));
  assert.deepEqual(events, ['bootstrap', 'lock-released', 'kickstart']);
});

test('run-now requires apply and apply refuses an ephemeral checkout', async () => {
  await assert.rejects(activateProductionBackup({ runNow: true }), /--run-now requires --apply/u);
  await assert.rejects(
    activateProductionBackup({ projectRoot: '/Users/test/.codex/worktrees/abcd/alistore-erp', apply: true }),
    /temporary worktree/u,
  );
});

async function temporaryHome(t) {
  const root = await mkdtemp(join(tmpdir(), 'alistore-backup-agent-home-'));
  t.after(async () => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  return root;
}

async function inertCoordinationLock() {
  return async () => {};
}
