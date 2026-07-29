import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { activateProductionApi } from '../activate-production-api.mjs';

const projectRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

test('launchd template always enables production guards', async () => {
  const plist = await readFile(`${projectRoot}/scripts/com.alistore.api.plist`, 'utf8');
  assert.match(plist, /<key>NODE_ENV<\/key>\s*<string>production<\/string>/u);
});

test('failed readiness gate makes no filesystem or launchctl changes', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    throw new Error('readiness blocked');
  };

  await assert.rejects(
    activateProductionApi({
      projectRoot,
      run,
      copy: async () => assert.fail('plist must not be copied'),
      makeDirectory: async () => assert.fail('directory must not be created'),
      isLoaded: async () => assert.fail('launchd must not be queried'),
    }),
    /readiness blocked/u,
  );

  assert.deepEqual(calls, [['npm', 'run', 'launch:check']]);
});

test('green gate installs and restarts the production launch agent', async () => {
  const calls = [];
  const copies = [];
  const run = async (command, args) => calls.push([command, ...args]);

  const result = await activateProductionApi({
    projectRoot,
    userHome: '/tmp/alistore-test-home',
    uid: 501,
    run,
    isLoaded: async () => true,
    copy: async (...args) => copies.push(args),
    makeDirectory: async () => {},
    fetchImpl: async () => ({ status: 200 }),
  });

  assert.equal(result.activated, true);
  assert.equal(copies.length, 1);
  assert.deepEqual(calls, [
    ['npm', 'run', 'launch:check'],
    ['npm', 'run', 'api:build'],
    ['/usr/bin/plutil', '-lint', `${projectRoot}/scripts/com.alistore.api.plist`],
    ['/bin/launchctl', 'bootout', 'gui/501/com.alistore.api'],
    ['/bin/launchctl', 'bootstrap', 'gui/501', '/tmp/alistore-test-home/Library/LaunchAgents/com.alistore.api.plist'],
    ['/bin/launchctl', 'kickstart', '-k', 'gui/501/com.alistore.api'],
  ]);
});
