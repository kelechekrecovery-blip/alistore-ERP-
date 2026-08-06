import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  activateProductionApi,
  renderProductionApiPlist,
} from '../activate-production-api.mjs';

const projectRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

test('launchd template always enables production guards', async () => {
  const plist = await readFile(`${projectRoot}/scripts/com.alistore.api.plist`, 'utf8');
  assert.match(plist, /<key>NODE_ENV<\/key>\s*<string>production<\/string>/u);
});

test('launchd template configures the public Sign in with Apple audiences without secrets', async () => {
  const plist = await readFile(`${projectRoot}/scripts/com.alistore.api.plist`, 'utf8');
  assert.match(
    plist,
    /<key>APPLE_CLIENT_ID<\/key>\s*<string>kg\.alistore\.web,kg\.alistore\.client<\/string>/u,
  );
  assert.doesNotMatch(
    plist,
    /<key>(?:APPLE_PRIVATE_KEY|APPLE_KEY_ID|AUTH_REVIEW_OTP|DATABASE_URL|JWT_SECRET)<\/key>/u,
  );
});

test('launchd template is rendered for the selected stable release checkout', async () => {
  const template = await readFile(`${projectRoot}/scripts/com.alistore.api.plist`, 'utf8');
  const plist = renderProductionApiPlist(template, {
    nodePath: '/opt/node & tools/bin/node',
    projectRoot: '/srv/AliStore & Production',
  });

  assert.match(plist, /<string>\/opt\/node &amp; tools\/bin\/node<\/string>/u);
  assert.match(plist, /<string>\/srv\/AliStore &amp; Production\/apps\/api\/dist\/main\.js<\/string>/u);
  assert.doesNotMatch(plist, /__NODE_PATH__|__PROJECT_ROOT__|Desktop\/alistore-erp/u);
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
      write: async () => assert.fail('plist must not be written'),
      makeDirectory: async () => assert.fail('directory must not be created'),
      isLoaded: async () => assert.fail('launchd must not be queried'),
    }),
    /readiness blocked/u,
  );

  assert.deepEqual(calls, [['npm', 'run', 'launch:check']]);
});

test('green gate installs and restarts the production launch agent', async () => {
  const calls = [];
  const writes = [];
  const moves = [];
  const run = async (command, args) => calls.push([command, ...args]);

  const result = await activateProductionApi({
    projectRoot,
    userHome: '/tmp/alistore-test-home',
    uid: 501,
    nodePath: '/opt/alistore/node',
    run,
    isLoaded: async () => true,
    write: async (...args) => writes.push(args),
    move: async (...args) => moves.push(args),
    remove: async () => {},
    makeDirectory: async () => {},
    makeTemporaryDirectory: async () => '/tmp/alistore-api-agent-test',
    fetchImpl: async () => ({ status: 200 }),
  });

  assert.equal(result.activated, true);
  assert.equal(writes.length, 3);
  assert.match(writes[0][1], /<string>\/opt\/alistore\/node<\/string>/u);
  assert.match(writes[0][1], new RegExp(`<string>${projectRoot}/apps/api/dist/main\\.js</string>`, 'u'));
  assert.equal(String(writes[1][1]), 'ALISTORE_NO_PREVIOUS_PLIST\n');
  assert.deepEqual(moves, [[
    '/tmp/alistore-test-home/Library/LaunchAgents/com.alistore.api.plist.new',
    '/tmp/alistore-test-home/Library/LaunchAgents/com.alistore.api.plist',
  ]]);
  assert.deepEqual(calls, [
    ['npm', 'run', 'launch:check'],
    ['npm', 'run', 'api:build'],
    ['/usr/bin/plutil', '-lint', '/tmp/alistore-api-agent-test/com.alistore.api.plist'],
    ['/bin/launchctl', 'bootout', 'gui/501/com.alistore.api'],
    ['/bin/launchctl', 'bootstrap', 'gui/501', '/tmp/alistore-test-home/Library/LaunchAgents/com.alistore.api.plist'],
    ['/bin/launchctl', 'kickstart', '-k', 'gui/501/com.alistore.api'],
  ]);
});

test('failed activation restores the previous launch agent', async () => {
  const calls = [];
  const writes = [];
  const moves = [];
  const installed = '/tmp/alistore-test-home/Library/LaunchAgents/com.alistore.api.plist';
  const backup = `${installed}.previous`;
  const previousBytes = Buffer.from([0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x00, 0xff]);
  const files = new Map([[installed, previousBytes]]);
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === '/bin/launchctl' && args[0] === 'kickstart' && calls.filter((call) => call[1] === 'kickstart').length === 1) {
      throw new Error('new process failed');
    }
  };
  const read = async (path, encoding) => {
    if (files.has(path)) {
      const value = files.get(path);
      return encoding ? value.toString(encoding) : value;
    }
    return readFile(path, encoding);
  };
  const write = async (path, value, options) => {
    writes.push([path, value, options]);
    files.set(path, Buffer.isBuffer(value) ? value : Buffer.from(value));
  };
  const move = async (from, to) => {
    moves.push([from, to]);
    files.set(to, files.get(from));
    files.delete(from);
  };
  const remove = async (path) => { files.delete(path); };

  await assert.rejects(
    activateProductionApi({
      projectRoot,
      userHome: '/tmp/alistore-test-home',
      uid: 501,
      nodePath: '/opt/alistore/node',
      run,
      read,
      write,
      move,
      remove,
      makeDirectory: async () => {},
      makeTemporaryDirectory: async () => '/tmp/alistore-api-agent-test',
      isLoaded: async () => true,
      fetchImpl: async () => ({ status: 200 }),
    }),
    /Production API activation failed; previous agent restored/u,
  );

  assert.deepEqual(writes.at(-1)[1], previousBytes);
  assert.deepEqual(moves.at(-1), [`${installed}.new`, installed]);
  assert.equal(calls.filter((call) => call[1] === 'bootstrap').length, 2);
  assert.equal(files.has(backup), false);
});

test('bootstrap failure restores the old agent without a spurious bootout failure', async () => {
  const calls = [];
  const installed = '/tmp/alistore-test-home/Library/LaunchAgents/com.alistore.api.plist';
  const files = new Map([[installed, Buffer.from('<plist>previous</plist>')]]);
  let replacementBootstrap = true;
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === '/bin/launchctl' && args[0] === 'bootstrap' && replacementBootstrap) {
      replacementBootstrap = false;
      throw new Error('bootstrap rejected replacement');
    }
  };
  const read = async (path, encoding) => {
    if (files.has(path)) {
      const value = files.get(path);
      return encoding ? value.toString(encoding) : value;
    }
    return readFile(path, encoding);
  };

  await assert.rejects(
    activateProductionApi({
      projectRoot,
      userHome: '/tmp/alistore-test-home',
      uid: 501,
      run,
      read,
      write: async (path, value) => files.set(path, Buffer.isBuffer(value) ? value : Buffer.from(value)),
      move: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
      remove: async (path) => { files.delete(path); },
      makeDirectory: async () => {},
      makeTemporaryDirectory: async () => '/tmp/alistore-api-agent-test',
      isLoaded: async () => true,
      fetchImpl: async () => ({ status: 200 }),
    }),
    /Production API activation failed; previous agent restored/u,
  );

  assert.equal(calls.filter((call) => call[1] === 'bootout').length, 1);
  assert.equal(calls.filter((call) => call[1] === 'bootstrap').length, 2);
});

test('cleanup failure does not turn a healthy activation into a failed deployment', async () => {
  const warnings = [];
  let removeCalls = 0;
  const result = await activateProductionApi({
    projectRoot,
    userHome: '/tmp/alistore-test-home',
    uid: 501,
    run: async () => {},
    read: async (path, encoding) => path.includes('/scripts/')
      ? readFile(path, encoding)
      : Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    write: async () => {},
    move: async () => {},
    remove: async () => {
      removeCalls += 1;
      if (removeCalls > 1) throw new Error('cleanup denied');
    },
    warn: (message) => warnings.push(message),
    makeDirectory: async () => {},
    makeTemporaryDirectory: async () => '/tmp/alistore-api-agent-test',
    isLoaded: async () => false,
    fetchImpl: async () => ({ status: 200 }),
  });

  assert.equal(result.activated, true);
  assert.equal(result.cleanupWarnings.length, 3);
  assert.equal(warnings.length, 3);
});
