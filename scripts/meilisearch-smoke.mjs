#!/usr/bin/env node

/**
 * Live, non-destructive Meilisearch smoke test.
 *
 * It creates a uniquely named temporary index, waits for indexing, verifies a
 * search result, and removes the index even when the assertion fails. This is
 * intentionally separate from catalog reindexing: the catalog remains the
 * PostgreSQL source of truth. Non-loopback targets require an explicit
 * operator opt-in because this smoke mutates a temporary index.
 */

const baseUrl = (process.env.MEILI_HOST || 'http://127.0.0.1:7700').replace(/\/$/u, '');
const apiKey = process.env.MEILI_API_KEY?.trim();
const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
const indexUid = `alistore-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const requestHeaders = { ...headers, 'content-type': 'application/json' };
const target = new URL(baseUrl);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!localHosts.has(target.hostname) && process.env.MEILI_SMOKE_ALLOW_MUTATION !== '1') {
  throw new Error('Refusing to mutate a non-loopback Meilisearch host; set MEILI_SMOKE_ALLOW_MUTATION=1 only for an explicitly approved disposable cluster');
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: { ...headers, ...init.headers },
  });
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }
  if (!response.ok) throw new Error(`Meilisearch ${init.method || 'GET'} ${path} → ${response.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  return parsed;
}

async function waitForTask(taskUid) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const task = await request(`/tasks/${taskUid}`);
    if (task.status === 'succeeded') return;
    if (task.status === 'failed' || task.status === 'canceled') throw new Error(`Meilisearch task ${taskUid} ended with ${task.status}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Meilisearch task ${taskUid} did not finish within 20 seconds`);
}

let cleanupError;
try {
  const health = await request('/health');
  if (health?.status !== 'available') throw new Error(`Meilisearch health is not available: ${JSON.stringify(health)}`);
  const task = await request(`/indexes/${indexUid}/documents?primaryKey=id`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify([{ id: 'proof-1', sku: 'LIVE-PROOF', name: 'AliStore live search proof' }]),
  });
  await waitForTask(task.taskUid);
  const result = await request(`/indexes/${indexUid}/search`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({ q: 'live search' }),
  });
  if (result?.hits?.[0]?.sku !== 'LIVE-PROOF') throw new Error('Meilisearch returned an unexpected smoke document');
  console.log(`Meilisearch smoke passed (${baseUrl})`);
} finally {
  try { await request(`/indexes/${indexUid}`, { method: 'DELETE' }); } catch (error) { cleanupError = error; }
  if (cleanupError) throw cleanupError;
}
