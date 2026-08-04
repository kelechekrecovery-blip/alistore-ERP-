#!/usr/bin/env node
/** Read-only local/managed Metabase health check. */
const baseUrl = (process.env.METABASE_URL || 'http://127.0.0.1:3001').replace(/\/$/u, '');
const url = `${baseUrl}/api/health`;
const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
const body = await readResponseBody(response);
if (!response.ok) throw new Error(`Metabase health failed: HTTP ${response.status} ${body}`.trim());
let parsed;
try { parsed = JSON.parse(body); } catch { throw new Error('Metabase health returned non-JSON'); }
if (parsed?.status !== 'ok') throw new Error(`Metabase is not ready: ${body}`);
console.log(`Metabase health: ok (${baseUrl})`);

async function readResponseBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 64 * 1024) throw new Error('Metabase health response exceeded 64 KiB');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}
