import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const targetMigration = '20260716120000_inventory_valuation_roll_forward';
const sourceUrl = process.env.TEST_DATABASE_URL;
const lockTimeoutMs = positiveInteger('INVENTORY_MIGRATION_LOCK_TIMEOUT_MS', 250);
const maxMigrationMs = positiveInteger('INVENTORY_MIGRATION_MAX_MS', 5000);
const rowCount = positiveInteger('INVENTORY_MIGRATION_ROWS', 1000);

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
const sourceDatabase = source.pathname.replace(/^\/+/, '');
if (!/(^|[_-])test($|[_-])/i.test(sourceDatabase)) {
  throw new Error(`Refusing migration preflight against non-test database ${sourceDatabase}`);
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const databaseName = `alistore_test_inventory_migration_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseUrl = new URL(source);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.delete('schema');

const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function applyMigration(db, name, options = {}) {
  const sql = await readFile(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
  if (options.lockTimeoutMs !== undefined) await db.query(`SET lock_timeout = '${options.lockTimeoutMs}ms'`);
  await db.query(sql);
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

async function seedPreMigrationRows(db) {
  await db.query(`
    INSERT INTO "Customer" (id, phone, name, segments)
    VALUES ('migration-customer', '+996700009902', 'Migration preflight', '{}');
    INSERT INTO "Product" (id, sku, name, price, cost, category, attrs, "trackingMode")
    VALUES ('migration-product', 'MIGRATION-PREFLIGHT', 'Migration preflight product', 100000, 10000, 'test', '{}', 'quantity');
    INSERT INTO "Order" (id, "customerId", status, channel, total, "fulfillmentLocation")
    VALUES ('migration-order', 'migration-customer', 'completed', 'pos', 100000, 'MIGRATION-A');
  `);

  const values = [];
  const placeholders = [];
  for (let index = 0; index < rowCount; index += 1) {
    const issueId = `migration-issue-${index}`;
    const movementId = `migration-movement-${index}`;
    const base = values.length;
    values.push(issueId, 'migration-product', 'migration-order', 'sale', `migration-sale-${index}`, 1, 0, 10000, 10000, new Date(Date.UTC(2024, index % 12, 1)).toISOString());
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`);
  }
  await db.query(`
    INSERT INTO "InventoryValuationIssue"
      (id, "productId", "orderId", "sourceType", "sourceRef", quantity, "reversedQty", "unitCost", "totalCost", "createdAt")
    VALUES ${placeholders.join(', ')}
  `, values);

  const movementValues = [];
  const movementPlaceholders = [];
  for (let index = 0; index < rowCount; index += 1) {
    const base = movementValues.length;
    movementValues.push(`migration-movement-${index}`, 'migration-product', 1, 'received', null, 'MIGRATION-A', 10000, new Date(Date.UTC(2024, index % 12, 1)).toISOString());
    movementPlaceholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
  }
  await db.query(`
    INSERT INTO "InventoryMovement" (id, "productId", qty, type, "from", "to", "totalValue", "createdAt")
    VALUES ${movementPlaceholders.join(', ')}
  `, movementValues);
}

const admin = new pg.Client({ connectionString: adminUrl.toString() });
let db;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  db = new pg.Client({ connectionString: databaseUrl.toString() });
  await db.connect();
  for (const name of migrationNames.filter((migration) => migration < targetMigration)) await applyMigration(db, name);
  await seedPreMigrationRows(db);

  const blocker = new pg.Client({ connectionString: databaseUrl.toString() });
  await blocker.connect();
  let blockedFailClosed = false;
  const blockedStartedAt = performance.now();
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT COUNT(*) FROM "InventoryValuationIssue"');
    try {
      await applyMigration(db, targetMigration, { lockTimeoutMs });
    } catch (error) {
      blockedFailClosed = error?.code === '55P03';
    }
  } finally {
    await blocker.query('ROLLBACK').catch(() => undefined);
    await blocker.end();
  }
  const blockedElapsedMs = Math.round(performance.now() - blockedStartedAt);
  if (!blockedFailClosed) throw new Error('Valuation migration did not fail closed on a held application lock');

  const migrationStartedAt = performance.now();
  await applyMigration(db, targetMigration, { lockTimeoutMs: 0 });
  const migrationElapsedMs = Math.round(performance.now() - migrationStartedAt);
  const columns = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'InventoryValuationIssue' AND column_name = 'location';
  `);
  const index = await db.query(`
    SELECT 1 FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    WHERE index_class.relname = 'InventoryValuationReversal_productId_location_createdAt_idx'
      AND index.indisvalid AND index.indisready AND index.indislive;
  `);
  const report = {
    targetMigration,
    seededRows: rowCount,
    lockTimeoutMs,
    blockedElapsedMs,
    blockedFailClosed,
    migrationElapsedMs,
    schemaVerified: columns.rowCount === 1 && index.rowCount === 1,
    maxMigrationMs,
  };
  console.log(`Inventory valuation migration preflight: ${JSON.stringify(report)}`);
  if (!report.schemaVerified) throw new Error('Valuation migration schema/index verification failed');
  if (migrationElapsedMs > maxMigrationMs) throw new Error(`Valuation migration exceeded ${maxMigrationMs}ms budget`);
} finally {
  if (db) await db.end().catch(() => undefined);
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]).catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
