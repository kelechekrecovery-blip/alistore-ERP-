#!/usr/bin/env node
const base = (process.env.CLOUDFLARE_LOCAL_API_BASE ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

async function assertJson(path, expectedStatus, validate) {
  const response = await fetch(`${base}${path}`, {
    headers: { 'x-request-id': `local-smoke-${crypto.randomUUID()}` },
  });
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected ${expectedStatus}, received ${response.status}: ${JSON.stringify(body)}`);
  }
  validate(body);
  console.log(`✓ ${path} → ${response.status}`);
}

await assertJson('/api/health/live', 200, (body) => {
  if (body.status !== 'ok') throw new Error('Invalid liveness payload');
});
await assertJson('/api/health', 200, (body) => {
  if (body.status !== 'ok') throw new Error('Invalid health payload');
});
await assertJson('/api/health/ready', 200, (body) => {
  if (body.status !== 'ok') throw new Error('Invalid readiness payload');
});
await assertJson('/api/not-migrated', 501, (body) => {
  if (body.code !== 'ROUTE_NOT_MIGRATED') throw new Error('Unmigrated route did not fail closed');
});
