import { createRequestContext } from '../functions/lib/request-context.js';
import { errorResponse, jsonResponse } from '../functions/lib/http.js';
import { healthLive, healthReady } from '../functions/lib/health.js';

const routes = new Map([
  ['GET /api/health', healthReady],
  ['GET /api/health/live', healthLive],
  ['GET /api/health/ready', healthReady],
]);

export class CommandCoordinator {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'Only POST is supported', 405);
    }

    return this.state.blockConcurrencyWhile(async () => {
      const command = await request.json().catch(() => null);
      if (!command?.key || typeof command.key !== 'string') {
        return errorResponse('INVALID_COMMAND', 'A stable command key is required', 400);
      }

      const requestHash = await sha256(JSON.stringify(command));
      const existing = await this.state.storage.get(`command:${command.key}`);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          return errorResponse(
            'IDEMPOTENCY_CONFLICT',
            'The command key was already used with a different payload',
            409,
          );
        }
        return jsonResponse(existing.response, 200, { 'Idempotency-Replayed': 'true' });
      }

      const accepted = {
        accepted: true,
        key: command.key,
        acceptedAt: new Date().toISOString(),
      };
      await this.state.storage.put(`command:${command.key}`, {
        requestHash,
        response: accepted,
      });
      return jsonResponse(accepted, 202);
    });
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function handleRequest(request, env, requestId) {
  const url = new URL(request.url);
  const handler = routes.get(`${request.method} ${url.pathname}`);
  if (!handler) {
    return errorResponse(
      'ROUTE_NOT_MIGRATED',
      'This API route has not been migrated to the Cloudflare runtime',
      501,
      undefined,
      requestId,
    );
  }

  return handler({ request, env, requestId });
}

export default {
  async fetch(request, env) {
    const context = createRequestContext(request);
    try {
      const response = await handleRequest(request, env, context.requestId);
      response.headers.set('x-request-id', context.requestId);
      response.headers.set('cache-control', 'no-store');
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        requestId: context.requestId,
        code: 'UNHANDLED_ERROR',
        message: error instanceof Error ? error.message : String(error),
      }));
      const response = errorResponse(
        'INTERNAL_ERROR',
        'An unexpected server error occurred',
        500,
        undefined,
        context.requestId,
      );
      response.headers.set('x-request-id', context.requestId);
      response.headers.set('cache-control', 'no-store');
      return response;
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await env.DB.prepare(
          'INSERT INTO worker_events (id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)',
        ).bind(
          crypto.randomUUID(),
          'outbox',
          JSON.stringify(message.body ?? null),
          new Date().toISOString(),
        ).run();
        message.ack();
      } catch (error) {
        console.error('queue message failed', error);
        message.retry();
      }
    }
  },

  async scheduled(controller, env) {
    await env.DB.prepare(
      `INSERT INTO worker_heartbeats (worker_name, last_seen_at, metadata_json)
       VALUES (?, ?, ?)
       ON CONFLICT(worker_name) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         metadata_json = excluded.metadata_json`,
    ).bind(
      'alistore-api-cron',
      new Date().toISOString(),
      JSON.stringify({ cron: controller.cron }),
    ).run();
  },
};
