import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBaseline } from '../gate0-baseline.mjs';

const command = (stdout = '', options = {}) => ({
  status: 0,
  stdout,
  stderr: '',
  ...options,
});

test('collects a clean, serializable baseline with sorted changed paths', () => {
  const calls = [];
  const baseline = collectBaseline({
    capturedAt: '2026-08-06T00:00:00.000Z',
    cwd: '/repo',
    run: (file, args) => {
      calls.push([file, args]);
      if (file === 'git' && args[0] === 'rev-parse') return command('abc123\n');
      if (file === 'git' && args[0] === 'branch') return command('codex/gate-0\n');
      if (file === 'git' && args[0] === 'status') return command(' M zeta.txt\0?? alpha.txt\0');
      if (file === 'node') return command('v22.1.0\n');
      if (file === 'npm') return command('10.9.0\n');
      if (file === 'java') return command('', { stderr: 'openjdk version "21.0.1"\n' });
      return command('tool 1.0\n');
    },
  });

  assert.deepEqual(baseline.git, {
    sha: 'abc123',
    branch: 'codex/gate-0',
    changedPaths: ['alpha.txt', 'zeta.txt'],
  });
  assert.equal(baseline.capturedAt, '2026-08-06T00:00:00.000Z');
  assert.equal(baseline.runtime.node.status, 'available');
  assert.equal(baseline.runtime.npm.version, '10.9.0');
  assert.equal(baseline.tools.java.version, 'openjdk version "21.0.1"');
  assert.equal(baseline.tools.postgresServer.status, 'available');
  assert.ok(calls.every(([, args]) => Array.isArray(args)));
  assert.doesNotThrow(() => JSON.stringify(baseline));
});

test('reports unavailable optional tools without aborting collection', () => {
  const baseline = collectBaseline({
    capturedAt: '2026-08-06T00:00:00.000Z',
    cwd: '/repo',
    run: (file, args) => {
      if (file === 'git' && args[0] === 'rev-parse') return command('abc123\n');
      if (file === 'git' && args[0] === 'branch') return command('main\n');
      if (file === 'git' && args[0] === 'status') return command('');
      if (file === 'node' || file === 'npm') return command('1.0\n');
      return command('', { status: 127, error: new Error('not found') });
    },
  });

  assert.deepEqual(baseline.tools.xcode, { status: 'unavailable' });
  assert.deepEqual(baseline.tools.playwright, { status: 'unavailable' });
});

test('does not include environment values or command diagnostics in output', () => {
  const canary = 'BASELINE_SECRET_CANARY_123';
  const baseline = collectBaseline({
    capturedAt: '2026-08-06T00:00:00.000Z',
    cwd: '/repo',
    run: (file, args) => {
      if (file === 'git' && args[0] === 'rev-parse') return command('abc123\n');
      if (file === 'git' && args[0] === 'branch') return command('main\n');
      if (file === 'git' && args[0] === 'status') return command('');
      if (file === 'node' || file === 'npm') return command('1.0\n');
      return command(canary, { status: 1, stderr: canary });
    },
  });

  assert.doesNotMatch(JSON.stringify(baseline), new RegExp(canary, 'u'));
});
