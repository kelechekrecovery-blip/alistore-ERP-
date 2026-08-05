import assert from 'node:assert/strict';
import test from 'node:test';
import { deployAndWait, serviceIdFromHook } from './render-deploy.mjs';

const ids = {
  api: 'srv-aaaaaaaaaaaaaaaaaaaa', web: 'srv-bbbbbbbbbbbbbbbbbbbb',
  worker: 'srv-cccccccccccccccccccc', backup: 'srv-dddddddddddddddddddd',
};
const hook = (id, key = 'secret') => `https://api.render.com/deploy/${id}?key=${key}`;
const identities = {
  [ids.api]: { id: ids.api, name: 'alistore-api-prod', type: 'web_service' },
  [ids.web]: { id: ids.web, name: 'alistore-web-prod', type: 'web_service' },
  [ids.worker]: { id: ids.worker, name: 'alistore-worker-prod', type: 'background_worker' },
  [ids.backup]: { id: ids.backup, name: 'alistore-backup-prod', type: 'cron_job' },
};
const identityResponse = (input) => {
  const serviceId = new URL(String(input)).pathname.split('/').at(-1);
  return new Response(JSON.stringify(identities[serviceId]), { status: identities[serviceId] ? 200 : 404 });
};

test('extracts the service id without exposing the hook key', () => {
  assert.equal(serviceIdFromHook(hook(ids.api)), ids.api);
  assert.throws(() => serviceIdFromHook(`https://example.test/deploy/${ids.api}?key=secret`), /api\.render\.com/);
  assert.throws(() => serviceIdFromHook(`https://api.render.com:444/deploy/${ids.api}?key=secret`), /api\.render\.com/);
  assert.throws(() => serviceIdFromHook(`https://api.render.com/not-deploy/${ids.api}?key=secret`), /malformed/);
});

test('binds every hook to the commit and waits for its exact deploy id', async () => {
  const calls = [];
  let verificationCount = 0;
  const fetchImpl = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).includes('/env-vars/')) {
      return new Response(JSON.stringify(init?.method === 'PUT' ? {} : { value: 'postgresql://previous' }), { status: 200 });
    }
    if (String(input).includes('/deploys?limit=1')) {
      return new Response(JSON.stringify([{ status: 'live' }]), { status: 200 });
    }
    if (new URL(String(input)).pathname === `/v1/services/${new URL(String(input)).pathname.split('/').at(-1)}`) {
      return identityResponse(input);
    }
    if (new URL(String(input)).pathname.startsWith('/deploy/')) {
      const serviceId = serviceIdFromHook(String(input));
      return new Response(JSON.stringify({ id: `dep-${serviceId}` }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: 'live' }), { status: 200 });
  };
  await deployAndWait({
    commit: 'abc123', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool',
    databaseBackupUrl: 'postgresql://backup',
    verifyCandidate: async () => { verificationCount += 1; },
    fetchImpl, pollDelayMs: 0, maxPolls: 1,
    services: [
      { name: 'api', hook: hook(ids.api, 'one') },
      { name: 'web', hook: hook(ids.web, 'two') },
      { name: 'worker', hook: hook(ids.worker, 'three') },
      { name: 'backup', hook: hook(ids.backup, 'four') },
    ],
  });
  assert.equal(calls.length, 24);
  const hooks = calls.filter(({ input }) => new URL(input).pathname.startsWith('/deploy/'));
  assert.ok(hooks.every(({ input }) => new URL(input).searchParams.get('ref') === 'abc123'));
  assert.equal(calls.filter(({ input }) => input.includes('/deploys/dep-srv-')).length, 4);
  const switches = calls.filter(({ input, init }) => input.includes('/env-vars/') && init?.method === 'PUT');
  assert.equal(switches.length, 4);
  assert.ok(switches.every(({ init }) => init.body && !String(init.body).includes('key=')));
  const apiSwitch = switches.find(({ input }) => input.includes(`/services/${ids.api}/`));
  const workerSwitch = switches.find(({ input }) => input.includes(`/services/${ids.worker}/`));
  assert.equal(JSON.parse(apiSwitch.init.body).value, 'postgresql://pool');
  assert.equal(JSON.parse(workerSwitch.init.body).value, 'postgresql://runtime');
  assert.equal(verificationCount, 13);
});

test('fails closed when a hook is missing or Render queues an overlapping deploy', async () => {
  await assert.rejects(
    deployAndWait({ services: [{ name: 'api', hook: '' }], commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime' }),
    /All Render service deploy hooks/,
  );
  await assert.rejects(
    deployAndWait({
      services: [{ name: 'api', hook: hook(ids.api, 'x') }],
      commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
      databaseRuntimePoolUrl: 'postgresql://pool',
      fetchImpl: async (input, init) => String(input).includes('/env-vars/')
        ? new Response(JSON.stringify(init?.method === 'PUT' ? {} : { value: 'postgresql://previous' }), { status: 200 })
        : new URL(String(input)).pathname.match(/^\/v1\/services\/srv-[^/]+$/)
          ? identityResponse(input)
        : String(input).includes('?limit=1')
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
    if (url.includes('/env-vars/')) return new Response(JSON.stringify({ value: 'postgresql://previous' }), { status: 200 });
    if (url.includes('?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
    if (new URL(url).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
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
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool', fetchImpl,
    services: [
      { name: 'api', hook: hook(ids.api, 'x') },
      { name: 'web', hook: hook(ids.web, 'y') },
    ],
  }), /HTTP 202/);
  assert.ok(calls.some((url) => url.endsWith(`/services/${ids.api}/deploys/dep-api/cancel`)));
});

test('cancels accepted hooks when the release is superseded during multi-service handoff', async () => {
  const calls = [];
  let verificationCount = 0;
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool',
    services: [
      { name: 'api', hook: hook(ids.api, 'x') },
      { name: 'web', hook: hook(ids.web, 'y') },
    ],
    verifyCandidate: async () => {
      verificationCount += 1;
      if (verificationCount === 3) throw new Error('release superseded');
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/env-vars/')) {
        return new Response(JSON.stringify(init?.method === 'PUT' ? {} : { value: 'postgresql://previous' }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
      if (new URL(url).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
      if (url.endsWith('/cancel')) return new Response('{}', { status: 200 });
      if (new URL(url).pathname.startsWith('/deploy/')) return new Response('{"id":"dep-api"}', { status: 200 });
      throw new Error(`unexpected call ${url}`);
    },
  }), /release superseded/);
  assert.equal(calls.filter((url) => new URL(url).pathname.startsWith('/deploy/')).length, 1);
  assert.ok(calls.some((url) => url.endsWith(`/services/${ids.api}/deploys/dep-api/cancel`)));
});

test('cancels an accepted deploy when the release is superseded during Render polling', async () => {
  const calls = [];
  let verificationCount = 0;
  let statusLookups = 0;
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool', pollDelayMs: 0, maxPolls: 2,
    services: [{ name: 'api', hook: hook(ids.api, 'x') }],
    verifyCandidate: async () => {
      verificationCount += 1;
      if (verificationCount === 4) throw new Error('release superseded while building');
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/env-vars/')) {
        return new Response(JSON.stringify(init?.method === 'PUT' ? {} : { value: 'postgresql://previous' }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
      if (new URL(url).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
      if (url.endsWith('/cancel')) return new Response('{}', { status: 200 });
      if (new URL(url).pathname.startsWith('/deploy/')) return new Response('{"id":"dep-api"}', { status: 200 });
      if (url.includes('/deploys/dep-api')) {
        statusLookups += 1;
        return new Response('{"status":"build_in_progress"}', { status: 200 });
      }
      throw new Error(`unexpected call ${url}`);
    },
  }), /superseded while building/);
  assert.equal(statusLookups, 1);
  assert.ok(calls.some((url) => url.endsWith(`/services/${ids.api}/deploys/dep-api/cancel`)));
});

test('rechecks the release immediately before accepting a live Render status', async () => {
  const calls = [];
  let verificationCount = 0;
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool', pollDelayMs: 0, maxPolls: 1,
    services: [{ name: 'api', hook: hook(ids.api, 'x') }],
    verifyCandidate: async () => {
      verificationCount += 1;
      if (verificationCount === 4) throw new Error('release superseded before live acceptance');
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/env-vars/')) {
        return new Response(JSON.stringify(init?.method === 'PUT' ? {} : { value: 'postgresql://previous' }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
      if (new URL(url).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
      if (url.endsWith('/cancel')) return new Response('{}', { status: 200 });
      if (new URL(url).pathname.startsWith('/deploy/')) return new Response('{"id":"dep-api"}', { status: 200 });
      if (url.includes('/deploys/dep-api')) return new Response('{"status":"live"}', { status: 200 });
      throw new Error(`unexpected call ${url}`);
    },
  }), /superseded before live acceptance/);
  assert.ok(calls.some((url) => url.endsWith(`/services/${ids.api}/deploys/dep-api/cancel`)));
});

test('fails loudly when Render does not accept cancellation of a stale deploy', async () => {
  let verificationCount = 0;
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool',
    services: [
      { name: 'api', hook: hook(ids.api, 'x') },
      { name: 'web', hook: hook(ids.web, 'y') },
    ],
    verifyCandidate: async () => {
      verificationCount += 1;
      if (verificationCount === 3) throw new Error('release superseded');
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.includes('/env-vars/')) {
        return new Response(JSON.stringify(init?.method === 'PUT' ? {} : { value: 'postgresql://previous' }), { status: 200 });
      }
      if (url.includes('/deploys?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
      if (new URL(url).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
      if (url.endsWith('/cancel')) return new Response('{}', { status: 409 });
      if (new URL(url).pathname.startsWith('/deploy/')) return new Response('{"id":"dep-api"}', { status: 200 });
      throw new Error(`unexpected call ${url}`);
    },
  }), /cancellation was incomplete/);
});

test('does not switch credentials while any target has an active deploy', async () => {
  const calls = [];
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool',
    services: [{ name: 'api', hook: hook(ids.api, 'x') }],
    fetchImpl: async (input) => {
      calls.push(String(input));
      if (new URL(String(input)).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
      return new Response('[{"status":"build_in_progress"}]', { status: 200 });
    },
  }), /active deploy/);
  assert.equal(calls.filter((url) => url.includes('/env-vars/')).length, 0);
});

test('rejects duplicate service ids before reading or writing credentials', async () => {
  let calls = 0;
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    services: [
      { name: 'api', hook: hook(ids.api, 'x') },
      { name: 'backup', hook: hook(ids.api, 'y') },
    ],
    fetchImpl: async () => { calls += 1; return new Response('{}'); },
  }), /unique/);
  assert.equal(calls, 0);
});

test('restores prior values when a credential PUT fails halfway', async () => {
  const puts = [];
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool',
    services: [
      { name: 'api', hook: hook(ids.api, 'x') },
      { name: 'worker', hook: hook(ids.worker, 'y') },
    ],
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (new URL(url).pathname.match(/^\/v1\/services\/srv-[^/]+$/)) return identityResponse(input);
      if (url.includes('/deploys?limit=1')) return new Response('[{"status":"live"}]', { status: 200 });
      if (url.includes('/env-vars/') && init?.method !== 'PUT') {
        return new Response('{"value":"postgresql://previous"}', { status: 200 });
      }
      if (url.includes('/env-vars/') && init?.method === 'PUT') {
        const value = JSON.parse(init.body).value;
        puts.push({ url, value });
        if (url.includes(`/services/${ids.worker}/`) && value === 'postgresql://runtime') {
          return new Response('{}', { status: 500 });
        }
        return new Response('{}', { status: 200 });
      }
      throw new Error('unexpected call');
    },
  }), /HTTP 500/);
  assert.deepEqual(puts.filter(({ url }) => url.includes(`/services/${ids.api}/`)).map(({ value }) => value),
    ['postgresql://pool', 'postgresql://previous']);
});

test('requires a dedicated pool URL for the production API before network access', async () => {
  let calls = 0;
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    services: [{ name: 'api', hook: hook(ids.api, 'x') }],
    fetchImpl: async () => { calls += 1; return new Response('{}'); },
  }), /DATABASE_RUNTIME_POOL_URL/);
  assert.equal(calls, 0);
});

test('rejects swapped valid hooks before reading or writing credentials', async () => {
  const calls = [];
  await assert.rejects(deployAndWait({
    commit: 'abc', apiKey: 'token', deploymentEnvironment: 'production', databaseRuntimeUrl: 'postgresql://runtime',
    databaseRuntimePoolUrl: 'postgresql://pool',
    services: [
      { name: 'api', hook: hook(ids.worker, 'x') },
      { name: 'worker', hook: hook(ids.api, 'y') },
    ],
    fetchImpl: async (input) => {
      calls.push(String(input));
      return identityResponse(input);
    },
  }), /identity mismatch/);
  assert.equal(calls.filter((url) => url.includes('/env-vars/')).length, 0);
  assert.equal(calls.filter((url) => url.includes('/deploys?')).length, 0);
});
