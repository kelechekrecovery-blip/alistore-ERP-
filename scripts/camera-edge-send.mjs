#!/usr/bin/env node
/**
 * Small edge-side sender for an EZVIZ/IP detection adapter.
 * It sends metadata only; raw frames/video never belong in this payload.
 *
 * Required environment: CAMERA_EDGE_SECRET
 * Example:
 *   CAMERA_EDGE_SECRET='...' node scripts/camera-edge-send.mjs \
 *     --api http://127.0.0.1:4000/api/camera-gateway/events \
 *     --device-id edge_123 --store-point-id alistore-bishkek-1 \
 *     --event-type queue_length_estimated --confidence 0.92 \
 *     --value '{"count":3}' --idempotency-key ezviz:queue:1
 */
import { createHmac, randomUUID } from 'node:crypto';

export const EVENT_TYPES = new Set([
  'queue_length_estimated',
  'shelf_empty_detected',
  'camera_offline',
  'camera_tamper_detected',
  'restricted_area_motion',
  'fall_or_safety_incident',
]);
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createSignedHeaders(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  if (!secret?.trim()) throw new Error('CAMERA_EDGE_SECRET is required');
  if (!Number.isSafeInteger(timestamp)) throw new Error('timestamp must be an integer');
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${canonicalJson(payload)}`)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-edge-device-secret': secret,
    'x-edge-device-timestamp': String(timestamp),
    'x-edge-device-signature': signature,
  };
}

export function buildPayload(args) {
  const confidence = Number(args.confidence);
  if (!args.deviceId || !args.storePointId || !args.eventType || !args.value) {
    throw new Error('--device-id, --store-point-id, --event-type and --value are required');
  }
  if (!EVENT_TYPES.has(args.eventType)) throw new Error(`unsupported --event-type: ${args.eventType}`);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('--confidence must be a number from 0 to 1');
  }
  let value;
  try {
    value = JSON.parse(args.value);
  } catch {
    throw new Error('--value must be valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('--value must be a JSON object');
  const retentionHours = args.retentionHours === undefined ? undefined : Number(args.retentionHours);
  if (retentionHours !== undefined && (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 720)) {
    throw new Error('--retention-hours must be an integer from 1 to 720');
  }
  return {
    idempotencyKey: args.idempotencyKey || `edge:${args.deviceId}:${randomUUID()}`,
    deviceId: args.deviceId,
    storePointId: args.storePointId,
    eventType: args.eventType,
    confidence,
    value,
    occurredAt: args.occurredAt || new Date().toISOString(),
    ...(retentionHours === undefined ? {} : { retentionHours }),
  };
}

export async function sendEdgeEvent(payload, options = {}) {
  const url = new URL(options.apiUrl || process.env.CAMERA_EDGE_API_URL || 'http://127.0.0.1:4000/api/camera-gateway/events');
  if (url.protocol !== 'https:' && !isLoopback(url.hostname) && process.env.CAMERA_EDGE_ALLOW_INSECURE !== '1') {
    throw new Error('Refusing non-HTTPS camera endpoint outside loopback; set CAMERA_EDGE_ALLOW_INSECURE=1 only for a private lab network');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: createSignedHeaders(payload, options.secret || process.env.CAMERA_EDGE_SECRET, options.timestamp),
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(`camera gateway rejected event: HTTP ${response.status} ${body}`.trim());
  return body ? JSON.parse(body) : undefined;
}

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
      if (total > MAX_RESPONSE_BYTES) throw new Error('camera gateway response exceeded 64 KiB');
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
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = argv[++i];
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = buildPayload(args);
    const result = await sendEdgeEvent(payload, { apiUrl: args.api, secret: process.env.CAMERA_EDGE_SECRET });
    console.log(JSON.stringify(result ?? { accepted: true }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
