import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const targetMigration = '20260716120000_inventory_valuation_roll_forward';
const locationContractMigration = '20260717120000_inventory_valuation_location_contract';
const sourceUrl = process.env.TEST_DATABASE_URL;

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
if (!/(^|[_-])test($|[_-])/i.test(source.pathname.replace(/^\/+/, ''))) {
  throw new Error(`Refusing migration upgrade test against non-test database ${source.pathname}`);
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const databaseName = `alistore_test_inventory_roll_forward_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      VALUES ('roll-customer', '+996700009901', 'Roll upgrade', '{}');
      INSERT INTO "Product" (id, sku, name, price, cost, category, attrs, "trackingMode")
      VALUES ('roll-product', 'ROLL-UPGRADE', 'Roll upgrade product', 200, 100, 'test', '{}', 'quantity');
      INSERT INTO "Order" (id, "customerId", status, channel, total, "fulfillmentLocation")
      VALUES ('roll-order', 'roll-customer', 'completed', 'pos', 400, 'ROLL-A');
      INSERT INTO "Return" (id, "orderId", reason, status, "restockLocation") VALUES
        ('roll-return-1', 'roll-order', 'partial one', 'reconciled', 'ROLL-A'),
        ('roll-return-2', 'roll-order', 'partial two', 'reconciled', 'ROLL-A');
      INSERT INTO "InventoryValuationIssue" (
        id, "productId", "orderId", "sourceType", "sourceRef", quantity,
        "reversedQty", "unitCost", "totalCost", "createdAt"
      ) VALUES (
        'roll-issue', 'roll-product', 'roll-order', 'sale', 'roll-sale', 4,
        2, 100, 400, '2026-07-01T10:00:00Z'
      );
      INSERT INTO "InventoryMovement" (
        id, "productId", qty, type, "from", "to", "totalValue", "createdAt"
      ) VALUES
      (
        'roll-transfer', 'roll-product', 3, 'moved', 'ROLL-A', 'ROLL-B', 100,
        '2026-07-01T11:00:00Z'
      ), (
        'roll-write-off', 'roll-product', -1, 'write_off', 'ROLL-A', NULL, 100,
        '2026-07-01T12:00:00Z'
      );
      INSERT INTO "AccountingJournalEntry" (
        id, "idempotencyKey", "sourceType", "sourceRef", description, "occurredAt", "createdBy"
      ) VALUES
        ('roll-entry-1', 'roll-entry-1', 'inventory.return', 'roll-return-1:roll-issue:1', 'partial one', '2026-07-02T10:00:00Z', 'test'),
        ('roll-entry-2', 'roll-entry-2', 'inventory.return', 'roll-return-2:roll-issue:2', 'partial two', '2026-07-03T10:00:00Z', 'test');
      INSERT INTO "AccountingJournalLine" (id, "entryId", "accountCode", debit, credit) VALUES
        ('roll-line-1a', 'roll-entry-1', '1200', 100, 0),
        ('roll-line-1b', 'roll-entry-1', '5000', 0, 100),
        ('roll-line-2a', 'roll-entry-2', '1200', 100, 0),
        ('roll-line-2b', 'roll-entry-2', '5000', 0, 100);
    `);

    await applyMigration(db, targetMigration);
    const reversals = await db.query(`
      SELECT "sourceRef", quantity, "unitCost", "totalCost", location
      FROM "InventoryValuationReversal"
      ORDER BY "sourceRef"
    `);
    if (reversals.rowCount !== 2
        || reversals.rows.some((row) => row.quantity !== 1 || row.unitCost !== 100 || row.totalCost !== 100 || row.location !== 'ROLL-A')) {
      throw new Error(`Partial-return reversal backfill mismatch: ${JSON.stringify(reversals.rows)}`);
    }
    const ambiguousMovements = await db.query(`
      SELECT id, "valuationQty" FROM "InventoryMovement"
      WHERE id IN ('roll-transfer', 'roll-write-off') ORDER BY id
    `);
    if (ambiguousMovements.rows.length !== 2 || ambiguousMovements.rows.some((row) => row.valuationQty !== null)) {
      throw new Error(`Historical ambiguous movements were incorrectly marked complete: ${JSON.stringify(ambiguousMovements.rows)}`);
    }
    await db.query('BEGIN');
    try {
      await db.query(`UPDATE "InventoryValuationIssue" SET "reversedQty" = 3 WHERE id = 'roll-issue'`);
      await db.query('COMMIT');
      throw new Error('Uncovered legacy reversal update unexpectedly committed');
    } catch (error) {
      await db.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Uncovered legacy reversal update unexpectedly committed') throw error;
    }
    await db.query('BEGIN');
    try {
      await db.query(`UPDATE "InventoryValuationReversal" SET location = 'ROLL-B' WHERE id = 'backfill-roll-entry-1'`);
      await db.query('COMMIT');
      throw new Error('Immutable reversal update unexpectedly committed');
    } catch (error) {
      await db.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Immutable reversal update unexpectedly committed') throw error;
    }

    await db.query(`UPDATE "InventoryValuationIssue" SET location = 'UNKNOWN' WHERE id = 'roll-issue'`);
    let blocked = false;
    try {
      await applyMigration(db, locationContractMigration);
    } catch (error) {
      blocked = error instanceof Error && error.message.includes('inventory valuation location contract blocked');
    }
    if (!blocked) throw new Error('Location contract migration did not fail closed on UNKNOWN issue location');

    await db.query(`UPDATE "InventoryValuationIssue" SET location = 'ROLL-A' WHERE id = 'roll-issue'`);
    await applyMigration(db, locationContractMigration);

    const contract = await db.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'InventoryValuationIssue' AND column_name = 'location';
    `);
    if (contract.rows.length !== 1 || contract.rows[0].is_nullable !== 'NO') {
      throw new Error(`Inventory valuation issue location is still nullable: ${JSON.stringify(contract.rows)}`);
    }

    let issueConstraintBlocked = false;
    try {
      await db.query(`UPDATE "InventoryValuationIssue" SET location = 'UNKNOWN' WHERE id = 'roll-issue'`);
    } catch (error) {
      issueConstraintBlocked = error instanceof Error && error.message.includes('InventoryValuationIssue_location_contract');
    }
    if (!issueConstraintBlocked) throw new Error('Issue location CHECK did not reject UNKNOWN');

    let reversalConstraintBlocked = false;
    try {
      await db.query(`
        INSERT INTO "InventoryValuationReversal" (
          id, "issueId", "productId", "returnId", "sourceType", "sourceRef",
          location, quantity, "unitCost", "totalCost"
        ) VALUES (
          'unknown-location-reversal', 'roll-issue', 'roll-product', 'roll-return-2',
          'inventory.return', 'roll-return-2:roll-issue:unknown', 'UNKNOWN', 1, 100, 100
        );
      `);
    } catch (error) {
      reversalConstraintBlocked = error instanceof Error && error.message.includes('InventoryValuationReversal_location_contract');
    }
    if (!reversalConstraintBlocked) throw new Error('Reversal location CHECK did not reject UNKNOWN');
  } finally {
    await db.end();
  }
} finally {
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
}

console.log('Inventory roll-forward migration upgrade test passed.');
