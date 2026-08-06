#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { FEATURE_FLAG_KEYS } from './feature-flag-cutover-gate.mjs';

const registry = Object.freeze(FEATURE_FLAG_KEYS.map((key) => ({ key })));
const registryByKey = new Map(registry.map((definition) => [definition.key, definition]));

if (JSON.stringify(registry.map(({ key }) => key)) !== JSON.stringify(FEATURE_FLAG_KEYS)) {
  throw new Error('feature-flag control registry differs from the cutover allowlist');
}

export function validateFeatureFlagControlTestDatabaseUrl(rawUrl, configuredUrls = []) {
  if (!rawUrl) throw new Error('TEST_DATABASE_URL is required');
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('TEST_DATABASE_URL must use PostgreSQL');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('TEST_DATABASE_URL must use loopback PostgreSQL');
  }
  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL has an invalid database path');
  }
  if (!databaseName || databaseName.includes('/') || !/(^|[_-])test($|[_-])/iu.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL must name an explicit test database');
  }
  for (const [name, value] of parsed.searchParams) {
    if (name === 'schema' && value === 'public') continue;
    if (name === 'connection_limit' && /^\d+$/u.test(value) && Number(value) >= 1 && Number(value) <= 20) {
      continue;
    }
    throw new Error(`TEST_DATABASE_URL parameter ${name} is not allowed`);
  }
  const target = normalizedDatabaseTarget(parsed);
  for (const configuredUrl of configuredUrls.filter(Boolean)) {
    let configured;
    try {
      configured = new URL(configuredUrl);
    } catch {
      throw new Error('configured database URL must be valid before destructive tests');
    }
    if (normalizedDatabaseTarget(configured) === target) {
      throw new Error('TEST_DATABASE_URL must differ from configured application databases');
    }
  }
  return rawUrl;
}

function normalizedDatabaseTarget(url) {
  const protocol = url.protocol === 'postgres:' ? 'postgresql:' : url.protocol;
  const hostname = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const normalizedHost = ['localhost', '127.0.0.1', '::1'].includes(hostname)
    ? 'loopback'
    : hostname;
  return `${protocol}//${normalizedHost}:${url.port || '5432'}${url.pathname}`;
}

export function parseFeatureFlagControlArgs(argv) {
  const [action, ...rest] = argv;
  if (!['list', 'set'].includes(action)) {
    throw new Error('usage: feature-flag-control.mjs list|set');
  }
  if (action === 'list') {
    if (rest.length > 0) throw new Error('list does not accept mutation arguments');
    return { action };
  }

  const values = {};
  let confirmed = false;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === '--confirm-current-image-control') {
      confirmed = true;
      continue;
    }
    if (!['--key', '--enabled', '--reason', '--actor', '--expected-revision'].includes(option)) {
      throw new Error(`unknown feature-flag control option: ${option}`);
    }
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`${option} requires a value`);
    values[option.slice(2)] = value;
    index += 1;
  }
  if (!registryByKey.has(values.key)) throw new Error('--key must name an allowlisted feature flag');
  const reason = values.reason?.trim();
  const actor = values.actor?.trim();
  if (!reason) throw new Error('--reason is required');
  if (!actor) throw new Error('--actor is required');
  if (!Object.hasOwn(values, 'expected-revision')) throw new Error('--expected-revision is required');
  const expectedRevision = values['expected-revision'] === 'none'
    ? null
    : parseRevision(values['expected-revision']);
  if (!confirmed) throw new Error('--confirm-current-image-control is required');
  if (!['true', 'false'].includes(values.enabled)) {
    throw new Error('set requires --enabled true|false');
  }
  return {
    action,
    key: values.key,
    enabled: values.enabled === 'true',
    reason,
    actor,
    expectedRevision,
    confirmed,
  };
}

export async function controlFeatureFlag({ client, command }) {
  if (command.action === 'list') return listStates(client);
  if (command.action !== 'set') {
    throw new Error('current-image control accepts only list or explicit database set');
  }
  if (!command.confirmed) throw new Error('current-image control confirmation is required');
  const definition = registryByKey.get(command.key);
  if (!definition) throw new Error('feature flag is not allowlisted');

  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`feature-flag-override:${definition.key}`],
    );
    await client.query(
      "SELECT set_config('alistore.feature_flag_mutation_contract', 'generation-v2', true)",
    );
    const [overrideResult, generationResult] = await Promise.all([
      client.query(`
        SELECT "enabled" FROM "FeatureFlagOverride" WHERE "key" = $1
      `, [definition.key]),
      client.query(`
        SELECT "revision" FROM "FeatureFlagGeneration" WHERE "key" = $1
      `, [definition.key]),
    ]);
    const currentRevision = generationResult.rows[0]?.revision ?? null;
    if (currentRevision !== command.expectedRevision) {
      throw new Error(
        `feature flag revision conflict for ${definition.key}; list state and reconfirm`,
      );
    }
    const currentRow = overrideResult.rows[0];
    const before = currentRow
      ? { enabled: currentRow.enabled, source: 'database' }
      : { enabled: null, source: 'unverified-fallback' };
    const mutationId = randomUUID();
    let revision = (currentRevision ?? 0) + 1;
    const result = await client.query(`
      INSERT INTO "FeatureFlagOverride" (
        "key", "enabled", "reason", "updatedBy", "active",
        "evidenceEventId", "evidenceRevision", "evidenceVersion", "updatedAt"
      ) VALUES ($1, $2, $3, $4, true, $5, $6, 2, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE
      SET "enabled" = EXCLUDED."enabled",
          "reason" = EXCLUDED."reason",
          "updatedBy" = EXCLUDED."updatedBy",
          "active" = true,
          "evidenceEventId" = EXCLUDED."evidenceEventId",
          "evidenceRevision" = EXCLUDED."evidenceRevision",
          "evidenceVersion" = 2,
          "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "revision"
    `, [definition.key, command.enabled, command.reason, command.actor, mutationId, revision]);
    revision = result.rows[0].revision;
    const after = { enabled: command.enabled, source: 'database' };

    await client.query(`
      INSERT INTO "AuditEvent" (id, type, actor, payload, refs)
      VALUES ($1, 'feature_flag.changed', $2, $3::JSONB, ARRAY[$4]::TEXT[])
    `, [
      mutationId,
      command.actor,
      JSON.stringify({
        key: definition.key,
        reason: command.reason,
        mutationId,
        revision,
        before,
        after,
      }),
      definition.key,
    ]);
    await client.query('COMMIT');
    return state(definition.key, after, true, revision);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function listStates(client) {
  // One statement gives the operator an internally consistent OCC snapshot even
  // when a mutation commits while the list command is running.
  const result = await client.query(`
    SELECT
      requested."key",
      override."enabled",
      override."key" IS NOT NULL AS "overrideActive",
      generation."revision" AS "overrideRevision"
    FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested("key", ordinal)
    LEFT JOIN "FeatureFlagOverride" AS override USING ("key")
    LEFT JOIN "FeatureFlagGeneration" AS generation USING ("key")
    ORDER BY requested.ordinal
  `, [FEATURE_FLAG_KEYS]);
  const rows = new Map(result.rows.map((row) => [row.key, row]));
  return registry.map((definition) => {
    const row = rows.get(definition.key);
    const evaluated = row?.overrideActive
      ? { enabled: row.enabled, source: 'database' }
      : { enabled: null, source: 'unverified-fallback' };
    return state(
      definition.key,
      evaluated,
      row?.overrideActive === true,
      row?.overrideRevision ?? null,
    );
  });
}

function state(key, evaluated, overrideActive, overrideRevision) {
  return { key, ...evaluated, overrideActive, overrideRevision };
}

function parseRevision(value) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value ?? '')) {
    throw new Error('--expected-revision must be none or a non-negative integer');
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) throw new Error('--expected-revision is outside the safe range');
  return revision;
}

async function main() {
  const command = parseFeatureFlagControlArgs(process.argv.slice(2));
  const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    statement_timeout: 15_000,
  });
  await client.connect();
  try {
    const result = await controlFeatureFlag({ client, command });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[redacted database URL]'));
    process.exitCode = 1;
  });
}
