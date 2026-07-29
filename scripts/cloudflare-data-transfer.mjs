#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { projectRoot } from './cloudflare-config.mjs';

const [action] = process.argv.slice(2);
const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function exportPostgres() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('DATABASE_URL is required for a PostgreSQL export.');
  const { Client } = requireFromApi('pg');
  const client = new Client({ connectionString, application_name: 'alistore-cloudflare-export' });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tablesResult = await client.query(`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `);
    const outputDir = path.join(
      projectRoot,
      'backups',
      'postgres-cloudflare',
      new Date().toISOString().replaceAll(':', '').replaceAll('.', ''),
    );
    fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(outputDir, 0o700);
    const manifest = { formatVersion: 1, exportedAt: new Date().toISOString(), tables: [] };

    for (const { tablename } of tablesResult.rows) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablename)) throw new Error(`Unsafe table name: ${tablename}`);
      const result = await client.query(`SELECT * FROM "${tablename}" ORDER BY 1`);
      const file = `${tablename}.ndjson`;
      const lines = result.rows.map((row) => JSON.stringify(row, (_, value) => (
        typeof value === 'bigint' ? value.toString() : value
      )));
      fs.writeFileSync(path.join(outputDir, file), `${lines.join('\n')}${lines.length ? '\n' : ''}`, {
        mode: 0o600,
      });
      manifest.tables.push({ name: tablename, rows: result.rowCount, file });
    }
    fs.writeFileSync(
      path.join(outputDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );
    await client.query('COMMIT');
    console.log(`✓ Consistent PostgreSQL export written to ${outputDir}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (action === 'export') {
  await exportPostgres();
} else if (action === 'import' || action === 'reconcile') {
  fail(
    `${action} is intentionally blocked until the complete PostgreSQL→D1 table mapping and financial invariant suite are committed.`,
  );
} else {
  fail('Expected export, import, or reconcile.');
}
