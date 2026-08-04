import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const targetMigration = '20260716141000_enforce_exchange_approval';
const expiryMigration = '20260716142000_expire_exchange_requests';
const sourceUrl = process.env.TEST_DATABASE_URL;

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
if (!/(^|[_-])test($|[_-])/i.test(source.pathname.replace(/^\/+/, ''))) {
  throw new Error(`Refusing migration upgrade test against non-test database ${source.pathname}`);
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const databaseName = `alistore_test_exchange_upgrade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseUrl = new URL(source);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.delete('schema');
const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function applyMigration(db, name) {
  const sql = await readFile(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
  await db.query(sql);
}

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const db = new Client({ connectionString: databaseUrl.toString() });
  await db.connect();
  try {
    for (const name of migrationNames.filter((migration) => migration < targetMigration)) {
      await applyMigration(db, name);
    }
    await db.query(`
      INSERT INTO "Customer" (id, phone, name, segments)
      VALUES ('exchange-customer', '+996700009902', 'Exchange upgrade', '{}');
      INSERT INTO "Product" (id, sku, name, price, cost, category, attrs)
      VALUES
        ('exchange-old-product', 'EX-UP-OLD', 'Old', 100, 80, 'test', '{}'),
        ('exchange-new-product', 'EX-UP-NEW', 'New', 120, 90, 'test', '{}');
      INSERT INTO "Order" (id, "customerId", status, channel, total)
      VALUES ('exchange-order', 'exchange-customer', 'paid', 'pos', 100);
      INSERT INTO "DeviceUnit" (id, imei, "productId", status, location, "orderId") VALUES
        ('exchange-old-unit', 'EX-UP-OLD-IMEI', 'exchange-old-product', 'sold', 'BISHKEK-1', 'exchange-order'),
        ('exchange-new-unit', 'EX-UP-NEW-IMEI', 'exchange-new-product', 'reserved', 'BISHKEK-1', NULL);
      INSERT INTO "Approval" (id, action, requester, status, reason)
      VALUES ('exchange-approval', 'exchange', 'exchange-requester', 'requested', 'upgrade');
      INSERT INTO "ExchangeRequest" (
        id, "idempotencyKey", "approvalId", requester, "originalOrderId", "oldImei",
        "newProductId", "newImei", "creditAmount", "surchargeAmount", method,
        "updatedAt"
      ) VALUES (
        'exchange-request', 'exchange-request:upgrade', 'exchange-approval', 'exchange-requester',
        'exchange-order', 'EX-UP-OLD-IMEI', 'exchange-new-product', 'EX-UP-NEW-IMEI',
        100, 20, 'cash', NOW()
      );
    `);

    await applyMigration(db, targetMigration);
    const request = await db.query(`
      SELECT "newUnitId" FROM "ExchangeRequest" WHERE id = 'exchange-request'
    `);
    if (request.rows[0]?.newUnitId !== 'exchange-new-unit') {
      throw new Error(`Exchange request backfill mismatch: ${JSON.stringify(request.rows)}`);
    }
    await applyMigration(db, expiryMigration);
    await db.query(`
      UPDATE "ExchangeRequest"
      SET status = 'expired', "expiredAt" = NOW()
      WHERE id = 'exchange-request'
    `);
    await db.query('BEGIN');
    try {
      await db.query(`UPDATE "ExchangeRequest" SET "newImei" = 'TAMPERED' WHERE id = 'exchange-request'`);
      await db.query('COMMIT');
      throw new Error('Immutable upgraded exchange snapshot unexpectedly changed');
    } catch (error) {
      await db.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Immutable upgraded exchange snapshot unexpectedly changed') throw error;
    }
  } finally {
    await db.end();
  }
} finally {
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
}

console.log('Exchange migration upgrade test passed: populated backfill and lifecycle guards verified.');
