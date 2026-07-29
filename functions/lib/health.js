import { jsonResponse } from './http.js';

export function healthLive({ env }) {
  return jsonResponse({ status: 'ok' });
}

export async function healthReady({ env }) {
  const missingBindings = ['DB', 'MEDIA', 'OUTBOX_QUEUE', 'COMMAND_COORDINATOR']
    .filter((name) => !env[name]);
  if (missingBindings.length > 0) {
    return jsonResponse({ statusCode: 503, message: 'Service Unavailable' }, 503);
  }

  try {
    const result = await env.DB.prepare('SELECT 1 AS healthy').first();
    if (Number(result?.healthy) !== 1) throw new Error('Unexpected D1 readiness result');
    return jsonResponse({ status: 'ok' });
  } catch {
    return jsonResponse({ statusCode: 503, message: 'Service Unavailable' }, 503);
  }
}
