import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const targetMigration = '20260716100000_refund_aggregate';
const validationMigration = '20260716101000_validate_refund_giftcard_fk';
const alignmentMigration = '20260716102000_align_schema_history';
const sourceUrl = process.env.TEST_DATABASE_URL;

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
if (!/(^|[_-])test($|[_-])/i.test(source.pathname.replace(/^\/+/, ''))) {
  throw new Error(`Refusing migration upgrade test against non-test database ${source.pathname}`);
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const run = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function databaseUrl(name) {
  const url = new URL(source);
  url.pathname = `/${name}`;
  url.searchParams.delete('schema');
  return url.toString();
}

async function withDatabase(label, callback) {
  const name = `alistore_test_refund_upgrade_${label}_${run}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const db = new Client({ connectionString: databaseUrl(name) });
    await db.connect();
    try {
      await callback(db);
    } finally {
      await db.end();
    }
  } finally {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [name]);
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
}

const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function applyMigration(db, name) {
  const sql = await readFile(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
  await db.query(sql);
}

async function applyLegacySchema(db) {
  for (const name of migrationNames.filter((migration) => migration < targetMigration)) {
    await applyMigration(db, name);
  }
}

async function seedCustomerAndOrder(db, suffix) {
  await db.query(`
    INSERT INTO "Customer" ("id", "phone", "name", "segments")
    VALUES ('customer-${suffix}', '+996700${suffix}', 'Upgrade test', '{}');
    INSERT INTO "Order" ("id", "customerId", "status", "channel", "total")
    VALUES ('order-${suffix}', 'customer-${suffix}', 'paid', 'pos', 10000);
  `);
}

await withDatabase('backfill', async (db) => {
  await applyLegacySchema(db);
  await seedCustomerAndOrder(db, 'backfill');
  await db.query(`
    INSERT INTO "GiftCard" (
      "id", "code", "initialBalance", "balance", "status", "issuedBy", "updatedAt"
    ) VALUES (
      'card-backfill', 'UPGRADE-BACKFILL', 50000, 40000, 'active', 'migration-test', CURRENT_TIMESTAMP
    );
    INSERT INTO "Payment" (
      "id", "orderId", "amount", "method", "status", "txnId", "createdAt"
    ) VALUES (
      'payment-backfill', 'order-backfill', 10000, 'gift_card', 'received',
      'giftcard:UPGRADE-BACKFILL:order-backfill', CURRENT_TIMESTAMP
    );
  `);
  await applyMigration(db, targetMigration);
  await applyMigration(db, validationMigration);
  const result = await db.query(`
    SELECT payment."giftCardId", transaction."type", transaction."amount",
           transaction."balanceAfter", card."balance"
    FROM "Payment" payment
    JOIN "GiftCardTransaction" transaction ON transaction."paymentId" = payment."id"
    JOIN "GiftCard" card ON card."id" = transaction."giftCardId"
    WHERE payment."id" = 'payment-backfill'
  `);
  const row = result.rows[0];
  if (!row || row.giftCardId !== 'card-backfill' || row.type !== 'redemption'
      || row.amount !== -10000 || row.balanceAfter !== 40000 || row.balance !== 40000) {
    throw new Error(`Legacy gift-card backfill mismatch: ${JSON.stringify(row)}`);
  }
  await db.query(`
    INSERT INTO "Payment" (
      "id", "orderId", "originalPaymentId", "amount", "method", "status", "txnId", "createdAt"
    ) VALUES (
      'payment-backfill-refund', 'order-backfill', 'payment-backfill', -4000,
      'gift_card', 'refunded', 'legacy-refund-after-expand', CURRENT_TIMESTAMP
    );
  `);
  const rollingRefund = await db.query(`
    SELECT payment."giftCardId", transaction."type", transaction."amount",
           transaction."balanceAfter", card."balance"
    FROM "Payment" payment
    JOIN "GiftCardTransaction" transaction ON transaction."paymentId" = payment."id"
    JOIN "GiftCard" card ON card."id" = transaction."giftCardId"
    WHERE payment."id" = 'payment-backfill-refund'
  `);
  const refundRow = rollingRefund.rows[0];
  if (!refundRow || refundRow.giftCardId !== 'card-backfill' || refundRow.type !== 'refund'
      || refundRow.amount !== 4000 || refundRow.balanceAfter !== 44000 || refundRow.balance !== 44000) {
    throw new Error(`Rolling legacy gift-card refund mismatch: ${JSON.stringify(refundRow)}`);
  }
});

await withDatabase('ambiguous', async (db) => {
  await applyLegacySchema(db);
  await seedCustomerAndOrder(db, 'ambiguous');
  await db.query(`
    INSERT INTO "GiftCard" (
      "id", "code", "initialBalance", "balance", "status", "issuedBy", "updatedAt"
    ) VALUES
      ('card-ambiguous-a', 'UPGRADE-AMBIGUOUS-A', 50000, 50000, 'active', 'migration-test', CURRENT_TIMESTAMP),
      ('card-ambiguous-b', 'UPGRADE-AMBIGUOUS-B', 50000, 50000, 'active', 'migration-test', CURRENT_TIMESTAMP);
    INSERT INTO "Payment" ("id", "orderId", "amount", "method", "status", "txnId", "createdAt")
    VALUES
      ('payment-ambiguous', 'order-ambiguous', 10000, 'gift_card', 'received', 'custom-provider-reference', CURRENT_TIMESTAMP),
      ('payment-dangling', 'order-ambiguous', 7000, 'gift_card', 'received', 'dangling-provider-reference', CURRENT_TIMESTAMP);
    INSERT INTO "AuditEvent" ("id", "type", "actor", "payload", "refs") VALUES
      ('event-ambiguous-a', 'giftcard.redeemed', 'migration-test',
       '{"orderId":"order-ambiguous","amount":10000,"giftCardId":"card-ambiguous-a"}', '{}'),
      ('event-ambiguous-b', 'giftcard.redeemed', 'migration-test',
       '{"orderId":"order-ambiguous","amount":10000,"giftCardId":"card-ambiguous-b"}', '{}'),
      ('event-dangling', 'giftcard.redeemed', 'migration-test',
       '{"orderId":"order-ambiguous","amount":7000,"giftCardId":"missing-card"}', '{}');
  `);
  try {
    await applyMigration(db, targetMigration);
    throw new Error('Ambiguous legacy gift-card provenance was accepted');
  } catch (error) {
    await db.query('ROLLBACK');
    if (!String(error).includes('gift-card reconciliation required for 2 legacy payment(s)')) throw error;
  }
  const partial = await db.query(`
    SELECT to_regtype('"RefundStatus"') IS NULL AS "noType",
           to_regclass('"Refund"') IS NULL AS "noRefund",
           to_regclass('"GiftCardTransaction"') IS NULL AS "noJournal",
           NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Payment' AND column_name = 'giftCardId'
           ) AS "noPaymentColumn"
  `);
  if (!Object.values(partial.rows[0]).every(Boolean)) {
    throw new Error(`Failed refund migration left partial schema: ${JSON.stringify(partial.rows[0])}`);
  }
  await db.query(`
    DELETE FROM "AuditEvent" WHERE "id" = 'event-ambiguous-b';
    DELETE FROM "AuditEvent" WHERE "id" = 'event-dangling';
    DELETE FROM "Payment" WHERE "id" = 'payment-dangling';
    UPDATE "GiftCard" SET "balance" = 40000 WHERE "id" = 'card-ambiguous-a';
  `);
  await applyMigration(db, targetMigration);
  await applyMigration(db, validationMigration);
  const repaired = await db.query(`
    SELECT payment."giftCardId", transaction."giftCardId" AS "journalGiftCardId"
    FROM "Payment" payment
    JOIN "GiftCardTransaction" transaction ON transaction."paymentId" = payment."id"
    WHERE payment."id" = 'payment-ambiguous'
  `);
  if (repaired.rows[0]?.giftCardId !== 'card-ambiguous-a'
      || repaired.rows[0]?.journalGiftCardId !== 'card-ambiguous-a') {
    throw new Error(`Reconciled migration retry mismatch: ${JSON.stringify(repaired.rows[0])}`);
  }
});

await withDatabase('alignment_rollback', async (db) => {
  for (const name of migrationNames.filter((migration) => migration < alignmentMigration)) {
    await applyMigration(db, name);
  }
  await db.query(`
    ALTER INDEX "QuantityConsignmentAllocation_orderQuantityAllocationId_lotId_k"
      RENAME TO "QuantityConsignmentAllocation_alignment_test_sabotage";
  `);
  try {
    await applyMigration(db, alignmentMigration);
    throw new Error('Alignment migration unexpectedly accepted a missing source index');
  } catch (error) {
    await db.query('ROLLBACK');
    if (!String(error).includes('QuantityConsignmentAllocation_orderQuantityAllocationId_lotId_k')) throw error;
  }
  const rollback = await db.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_attrdef defaults
        JOIN pg_attribute attribute
          ON attribute.attrelid = defaults.adrelid AND attribute.attnum = defaults.adnum
        WHERE defaults.adrelid = '"Campaign"'::regclass AND attribute.attname = 'updatedAt'
      ) AS "campaignDefaultRestored",
      to_regclass('"DebtPlan_orderId_idx"') IS NOT NULL AS "debtIndexRestored",
      to_regclass('"InventoryValuationLayer_balanceId_quantityRemaining_createdAt_i"') IS NOT NULL
        AS "valuationIndexRestored"
  `);
  if (!Object.values(rollback.rows[0]).every(Boolean)) {
    throw new Error(`Alignment migration was not atomic: ${JSON.stringify(rollback.rows[0])}`);
  }
});

console.log('Refund migration upgrade test passed: backfill, rolling refund, blockers and DDL rollback verified.');
