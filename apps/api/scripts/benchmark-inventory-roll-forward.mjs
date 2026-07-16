import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const sourceUrl = process.env.TEST_DATABASE_URL;
const historyMonths = positiveInteger('INVENTORY_ROLL_FORWARD_HISTORY_MONTHS', 36);
const batchesPerMonth = positiveInteger('INVENTORY_ROLL_FORWARD_BATCHES_PER_MONTH', 8);
const maxMilliseconds = positiveInteger('INVENTORY_ROLL_FORWARD_MAX_MS', 5000);
const maxRssDeltaMb = positiveInteger('INVENTORY_ROLL_FORWARD_MAX_RSS_DELTA_MB', 256);

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
const sourceDatabase = source.pathname.replace(/^\/+/, '');
if (!/(^|[_-])test($|[_-])/i.test(sourceDatabase)) {
  throw new Error(`Refusing benchmark against non-test database ${sourceDatabase}`);
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const databaseName = `alistore_test_inventory_perf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseUrl = new URL(source);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.delete('schema');

const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function applyMigration(db, name) {
  await db.query(await readFile(path.join(migrationsRoot, name, 'migration.sql'), 'utf8'));
}

async function insertRows(db, table, columns, rows, chunkSize = 500) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const rowPlaceholders = row.map((value, columnIndex) => {
        values.push(value);
        return `$${rowIndex * row.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    });
    await db.query(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${placeholders.join(', ')}`, values);
  }
}

function monthDate(monthIndex) {
  const date = new Date(Date.UTC(2023, monthIndex, 15, 12, 0, 0));
  return date.toISOString();
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const admin = new pg.Client({ connectionString: adminUrl.toString() });
let db;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  db = new pg.Client({ connectionString: databaseUrl.toString() });
  await db.connect();
  for (const migration of migrationNames) await applyMigration(db, migration);

  const products = [];
  const balances = [];
  const locations = ['PERF-A', 'PERF-B', 'PERF-C', 'PERF-D'];
  for (let productIndex = 0; productIndex < 12; productIndex += 1) {
    const productId = `perf-product-${productIndex}`;
    products.push({ id: productId, index: productIndex });
    for (let locationIndex = 0; locationIndex < locations.length; locationIndex += 1) {
      balances.push({
        id: `perf-balance-${productIndex}-${locationIndex}`,
        productId,
        location: locations[locationIndex],
      });
    }
  }

  await insertRows(db, 'Product', ['id', 'sku', 'name', 'price', 'cost', 'category', 'attrs', 'trackingMode'],
    products.map(({ id, index }) => [id, `PERF-${index}`, `Performance product ${index}`, 100000, 10000 + index, 'performance', '{}', 'quantity']));
  await insertRows(db, 'InventoryBalance', ['id', 'productId', 'location', 'onHand', 'reserved', 'inventoryValue'],
    balances.map(({ id, productId, location }) => [id, productId, location, 0, 0, 0]));

  const layers = [];
  const issues = [];
  for (let month = 0; month < historyMonths; month += 1) {
    const createdAt = monthDate(month);
    for (const product of products) {
      for (const [locationIndex, location] of locations.entries()) {
        const balanceId = `perf-balance-${product.index}-${locationIndex}`;
        const unitCost = 10000 + product.index * 100 + locationIndex * 10;
        for (let batch = 0; batch < batchesPerMonth; batch += 1) {
          const suffix = `${product.index}-${locationIndex}-${month}-${batch}`;
          const layerId = `perf-layer-${suffix}`;
          layers.push([layerId, product.id, balanceId, location, 'perf.receipt', `perf-receipt-${suffix}`, unitCost, 10, 0, createdAt]);
          issues.push([`perf-issue-${suffix}`, product.id, layerId, 'perf.issue', `perf-issue-ref-${suffix}`, location, 10, 0, unitCost, unitCost * 10, createdAt]);
        }
      }
    }
  }

  await insertRows(db, 'InventoryValuationLayer',
    ['id', 'productId', 'balanceId', 'location', 'sourceType', 'sourceRef', 'unitCost', 'quantityReceived', 'quantityRemaining', 'createdAt'],
    layers);
  await insertRows(db, 'InventoryValuationIssue',
    ['id', 'productId', 'layerId', 'sourceType', 'sourceRef', 'location', 'quantity', 'reversedQty', 'unitCost', 'totalCost', 'createdAt'],
    issues);

  const rowCount = layers.length + issues.length;
  const from = '2025-07-01T00:00:00.000Z';
  const to = '2026-07-01T00:00:00.000Z';
  process.env.DATABASE_URL = databaseUrl.toString();
  const { PrismaClient } = await import('@prisma/client');
  const { inventoryValuationRollForward } = await import('../dist/inventory/inventory-roll-forward.js');
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    const rssBefore = process.memoryUsage().rss;
    const startedAt = performance.now();
    const first = await prisma.$transaction(
      (tx) => inventoryValuationRollForward(tx, from, to),
      { isolationLevel: 'RepeatableRead' },
    );
    const elapsedMilliseconds = Math.round(performance.now() - startedAt);
    const second = await prisma.$transaction(
      (tx) => inventoryValuationRollForward(tx, from, to),
      { isolationLevel: 'RepeatableRead' },
    );
    const rssDeltaMb = Math.round((process.memoryUsage().rss - rssBefore) / 1024 / 1024);
    const firstComparable = JSON.stringify({ summary: first.summary, rows: first.rows });
    const secondComparable = JSON.stringify({ summary: second.summary, rows: second.rows });
    if (firstComparable !== secondComparable) throw new Error('Repeatable-read benchmark totals changed between identical runs');
    if (!first.summary.complete || !first.summary.consistent) {
      throw new Error(`Synthetic valuation history did not reconcile: ${JSON.stringify(first.summary)}`);
    }
    const report = {
      historyMonths,
      batchesPerMonth,
      valuationRows: rowCount,
      reportRows: first.rows.length,
      elapsedMilliseconds,
      rssDeltaMb,
      maxMilliseconds,
      maxRssDeltaMb,
      repeatableReadStable: true,
      complete: first.summary.complete,
      consistent: first.summary.consistent,
    };
    console.log(`Inventory roll-forward performance benchmark: ${JSON.stringify(report)}`);
    if (elapsedMilliseconds > maxMilliseconds) throw new Error(`Roll-forward exceeded ${maxMilliseconds}ms budget`);
    if (rssDeltaMb > maxRssDeltaMb) throw new Error(`Roll-forward exceeded ${maxRssDeltaMb}MB RSS delta budget`);
  } finally {
    await prisma.$disconnect();
  }
} finally {
  if (db) await db.end().catch(() => undefined);
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]).catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
