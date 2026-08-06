import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../..', import.meta.url);

test('strict deployment smoke accepts a coherent production auth contract', async () => {
  const server = await startFixtureServer({ registrationAvailable: true });
  try {
    const result = await runSmoke(server.baseUrl);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /customer login and registration configuration is coherent/);
    assert.match(result.stdout, /official Apple SDK \+ authorization-code contract/);
  } finally {
    server.close();
  }
});

test('strict deployment smoke rejects a healthy site with disabled registration', async () => {
  const server = await startFixtureServer({ registrationAvailable: false });
  try {
    const result = await runSmoke(server.baseUrl);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /production auth configuration gate failed/);
    assert.match(result.stderr, /phone login\/registration/);
  } finally {
    server.close();
  }
});

test('production CD binds all Render deploys and health checks to the triggering SHA', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/cd-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /RENDER_DEPLOY_HOOK_API_PROD/u);
  assert.match(workflow, /RENDER_DEPLOY_HOOK_WEB_PROD/u);
  assert.match(workflow, /RENDER_DEPLOY_HOOK_WORKER_PROD/u);
  assert.match(workflow, /ref=\$\{GITHUB_SHA\}/u);
  assert.match(workflow, /x-alistore-revision/u);
  assert.match(workflow, /deployed_revision[\s\S]+GITHUB_SHA/u);
  assert.match(workflow, /api\/health\/worker/u);
  const missingHookGuard = workflow.indexOf('if [ -z "$url" ]');
  const firstDeployPost = workflow.indexOf('curl -fsS -X POST');
  assert.ok(missingHookGuard >= 0 && firstDeployPost > missingHookGuard);
  const validationLoopEnd = workflow.indexOf('\n          done', missingHookGuard);
  const triggerLoop = workflow.indexOf('for pair in "api:$API_HOOK"', validationLoopEnd + 1);
  assert.ok(validationLoopEnd > missingHookGuard && triggerLoop > validationLoopEnd && firstDeployPost > triggerLoop);
  assert.match(workflow, /previous-revision/u);
  assert.match(workflow, /github\.event\.before/u);
  assert.ok(
    workflow.indexOf('previous="$api_revision"') < workflow.indexOf('previous="$PUSH_BEFORE"'),
    'coherent live revisions must take precedence over the push predecessor',
  );
  assert.match(workflow, /worker_status" != "200"/u);
  assert.match(workflow, /worker_status" = "404"/u);
  assert.match(workflow, /previous-api-web-verifiable/u);
  assert.match(workflow, /Roll back failed production validation/u);
  assert.match(workflow, /ref=\$\{PREVIOUS_REVISION\}/u);
  assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/u);
  assert.match(workflow, /Rollback verified at revision/u);
  assert.match(workflow, /previous-worker-verifiable/u);
  assert.match(workflow, /timeout-minutes: 55/u);
});

async function startFixtureServer({ registrationAvailable }) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/checkout' || url.pathname === '/cart') {
      response.writeHead(200, { 'cache-control': 'no-store' }).end('ok');
      return;
    }
    if (url.pathname === '/api/catalog/products') {
      json(response, 200, { items: [{ id: 'product-1' }] });
      return;
    }
    if (url.pathname === '/api/auth/methods') {
      const enabled = registrationAvailable;
      json(response, 200, {
        phone: { enabled, registers: enabled },
        email: { enabled: true, registers: false },
        apple: {
          enabled: true,
          registers: enabled,
          clientId: 'kg.alistore.web',
          redirectUri: 'https://ali.kg/login',
        },
        google: { enabled: true, registers: enabled, clientId: 'google.apps.googleusercontent.com' },
        recovery: { enabled },
        registrationAvailable,
      }, { 'cache-control': 'no-store' });
      return;
    }
    if (url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html' })
        .end('<script src="/_next/static/login.js"></script>');
      return;
    }
    if (url.pathname === '/_next/static/login.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' }).end(
        'const sdk="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"; const authorizationCode="code";',
      );
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

async function runSmoke(baseUrl) {
  const child = spawn(process.execPath, ['scripts/deployment-smoke.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WEB_BASE_URL: baseUrl,
      API_BASE_URL: baseUrl,
      REQUIRE_CUSTOMER_AUTH_CONFIGURATION: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}
