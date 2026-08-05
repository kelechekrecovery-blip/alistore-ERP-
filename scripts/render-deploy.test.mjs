import assert from 'node:assert/strict';
import test from 'node:test';
import { deployAndWait, serviceIdFromHook } from './render-deploy.mjs';

test('extracts the service id without exposing the hook key', () => {
  assert.equal(serviceIdFromHook('https://api.render.com/deploy/srv-api?key=secret'), 'srv-api');
  assert.throws(() => serviceIdFromHook('https://example.test/deploy/srv-api?key=secret'), /api\.render\.com/);
});

test('binds every hook to the commit and waits for its exact deploy id', async () => {
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).includes('/deploys?limit=1')) {
      return new Response(JSON.stringify([{ status: 'live' }]), { status: 200 });
    }
    if (new URL(String(input)).pathname.startsWith('/deploy/')) {
      const serviceId = serviceIdFromHook(String(input));
      return new Response(JSON.stringify({ id: `dep-${serviceId}` }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: 'live' }), { status: 200 });
  };
  await deployAndWait({
    commit: 'abc123', apiKey: 'token', fetchImpl, pollDelayMs: 0, maxPolls: 1,
    services: [
      { name: 'api', hook: 'https://api.render.com/deploy/srv-api?key=one' },
      { name: 'web', hook: 'https://api.render.com/deploy/srv-web?key=two' },
      { name: 'worker', hook: 'https://api.render.com/deploy/srv-worker?key=three' },
    ],
  });
  assert.equal(calls.length, 9);
  const hooks = calls.filter(({ input }) => new URL(input).pathname.startsWith('/deploy/'));
  assert.ok(hooks.every(({ input }) => new URL(input).searchParams.get('ref') === 'abc123'));
  assert.equal(calls.filter(({ input }) => input.includes('/deploys/dep-srv-')).length, 3);
});

test('fails closed when a hook is missing or Render queues an overlapping deploy', async () => {
  await assert.rejects(
    deployAndWait({ services: [{ name: 'api', hook: '' }], commit: 'abc', apiKey: 'token' }),
    /All Render service deploy hooks/,
  );
  await assert.rejects(
    deployAndWait({
      services: [{ name: 'api', hook: 'https://api.render.com/deploy/srv-api?key=x' }],
      commit: 'abc', apiKey: 'token', fetchImpl: async (input) => String(input).includes('?limit=1')
        ? new Response('[{"status":"live"}]', { status: 200 })
        : new Response('{}', { status: 202 }),
    }),
    /HTTP 202/,
  );
});

test('cancels an accepted deploy if a later hook fails', async () => {
  const calls = [];
  let hookCount = 0;
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
    if (url.endsWith('/cancel')) return new Response('{}', { status: 200 });
    if (new URL(url).pathname.startsWith('/deploy/')) {
      hookCount += 1;
      return hookCount === 1
        ? new Response('{"id":"dep-api"}', { status: 200 })
        : new Response('{}', { status: 202 });
    }
    throw new Error('unexpected call');
  };
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', fetchImpl,
    services: [
      { name: 'api', hook: 'https://api.render.com/deploy/srv-api?key=x' },
      { name: 'web', hook: 'https://api.render.com/deploy/srv-web?key=y' },
    ],
  }), /HTTP 202/);
  assert.ok(calls.some((url) => url.endsWith('/services/srv-api/deploys/dep-api/cancel')));
});
