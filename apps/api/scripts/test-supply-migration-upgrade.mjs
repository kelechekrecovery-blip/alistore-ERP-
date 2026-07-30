import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const firstSupplyMigration = '20260728120000_product_supply_mode';
const sourceUrl = process.env.TEST_DATABASE_URL;

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
const sourceDatabase = source.pathname.replace(/^\/+/, '');
if (!/(^|[_-])test($|[_-])/i.test(sourceDatabase)) {
  throw new Error(`Refusing supply migration upgrade test against non-test database ${source.pathname}`);
}
if (!new Set(['localhost', '127.0.0.1', '::1']).has(source.hostname.replace(/^\[|\]$/g, ''))) {
  throw new Error('Supply migration upgrade test requires a loopback PostgreSQL host');
}
if (source.searchParams.has('host') || source.searchParams.has('hostaddr')) {
  throw new Error('Supply migration upgrade test refuses PostgreSQL host overrides');
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const databaseName = `alistore_test_supply_upgrade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseUrl = new URL(source);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.delete('schema');
const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (!migrationNames.includes(firstSupplyMigration)) {
  throw new Error('Pre-supply fixture boundary is missing from prisma/migrations');
}

const appliedMigrationNames = [];
async function applyMigration(db, name) {
  const sql = await readFile(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
  await db.query(sql);
  appliedMigrationNames.push(name);
}

async function expectDatabaseReject(db, sql, label) {
  await db.query('BEGIN');
  let accepted = false;
  try {
    await db.query(sql);
    accepted = true;
  } catch {
    // Expected: the database invariant, not application validation, rejects it.
  } finally {
    await db.query('ROLLBACK');
  }
  if (accepted) throw new Error(`${label} was accepted by the current migration head`);
}

const admin = new Client({ connectionString: adminUrl.toString() });
let db;
let databaseCreated = false;
let primaryError;
const cleanupErrors = [];
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  db = new Client({ connectionString: databaseUrl.toString() });
  await db.connect();
  for (const name of migrationNames.filter((migration) => migration < firstSupplyMigration)) {
    await applyMigration(db, name);
  }

  await db.query(`
      INSERT INTO "Customer" (id, phone, name, segments)
      VALUES ('supply-upgrade-customer', '+996700009928', 'Supply upgrade customer', '{}');
      INSERT INTO "Product" (id, sku, name, price, cost, category, attrs)
      VALUES ('supply-upgrade-product', 'SUPPLY-UPGRADE-SKU', 'Populated legacy product', 10000, 7000, 'test', '{}');
      INSERT INTO "Order" (id, "customerId", status, channel, "fulfillmentType", total)
      VALUES ('supply-upgrade-order', 'supply-upgrade-customer', 'created', 'web', 'pickup', 10000);
      INSERT INTO "OrderItem" (
        id, "orderId", sku, qty, price, "taxBaseAmount", "taxAmount", "taxCode"
      )
      VALUES (
        'supply-upgrade-item', 'supply-upgrade-order', 'SUPPLY-UPGRADE-SKU', 1, 10000, 8929, 1071, 'vat_standard'
      );
      INSERT INTO "SupportTicket" (
        id, "customerId", channel, priority, sla, status, subject, body
      )
      VALUES (
        'supply-upgrade-ticket', 'supply-upgrade-customer', 'app', 'normal',
        CURRENT_TIMESTAMP + INTERVAL '1 day', 'new', 'Populated legacy ticket', 'before revision migration'
      );
    `);
  const preSupplyPopulation = await db.query(`
      SELECT
        (SELECT count(*)::int FROM "Product") AS products,
        (SELECT count(*)::int FROM "Order") AS orders,
        (SELECT count(*)::int FROM "OrderItem") AS items,
        (SELECT count(*)::int FROM "SupportTicket") AS tickets
    `);
  if (preSupplyPopulation.rows[0]?.products !== 1
    || preSupplyPopulation.rows[0]?.orders !== 1
    || preSupplyPopulation.rows[0]?.items !== 1
    || preSupplyPopulation.rows[0]?.tickets !== 1) {
    throw new Error(`Pre-supply schema was not populated: ${JSON.stringify(preSupplyPopulation.rows)}`);
  }

  for (const name of migrationNames.filter((migration) => migration >= firstSupplyMigration)) {
    await applyMigration(db, name);
  }
  if (JSON.stringify(appliedMigrationNames) !== JSON.stringify(migrationNames)) {
    throw new Error(
      `Upgrade did not apply the current migration directory head: expected=${JSON.stringify(migrationNames)} `
        + `applied=${JSON.stringify(appliedMigrationNames)}`,
    );
  }

  const upgradedProduct = await db.query(`
      SELECT "supplyMode"::text, "supplyLeadDays", "supplierId"
      FROM "Product" WHERE id = 'supply-upgrade-product'
    `);
  if (upgradedProduct.rows[0]?.supplyMode !== 'own_stock'
      || upgradedProduct.rows[0]?.supplyLeadDays !== null
      || upgradedProduct.rows[0]?.supplierId !== null) {
      throw new Error(`Legacy product supply backfill is unsafe: ${JSON.stringify(upgradedProduct.rows)}`);
    }
  const upgradedItem = await db.query(`
      SELECT "productId", "supplyModeSnapshot"::text, "supplyLeadDaysSnapshot",
             "fulfillmentStatus"::text
      FROM "OrderItem" WHERE id = 'supply-upgrade-item'
    `);
  if (upgradedItem.rows[0]?.productId !== 'supply-upgrade-product'
      || upgradedItem.rows[0]?.supplyModeSnapshot !== 'own_stock'
      || upgradedItem.rows[0]?.supplyLeadDaysSnapshot !== null
      || upgradedItem.rows[0]?.fulfillmentStatus !== 'pending_payment') {
      throw new Error(`Legacy order item supply backfill is unsafe: ${JSON.stringify(upgradedItem.rows)}`);
    }
  const historicalSupplyRows = await db.query(`
      SELECT count(*)::int AS count FROM "OrderLineSupply"
      WHERE "orderItemId" = 'supply-upgrade-item'
    `);
  if (historicalSupplyRows.rows[0]?.count !== 0) {
      throw new Error('Migration invented a customer-specific supply promise for a historical own-stock line');
    }
  const enumValues = await db.query(`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'OrderLineSupplyStatus'
    `);
  const statuses = new Set(enumValues.rows.map((row) => row.enumlabel));
  for (const expected of ['awaiting_deposit', 'quality_check', 'ready', 'customer_cancelled', 'quarantined']) {
    if (!statuses.has(expected)) throw new Error(`Supply status ${expected} was not installed`);
  }
  const currentHeadFeatures = await db.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'OtpPurpose' AND pg_enum.enumlabel = 'recovery'
        ) AS recovery_otp,
        to_regclass('"SocialEnrollment"') IS NOT NULL AS social_enrollment
    `);
  if (!currentHeadFeatures.rows[0]?.recovery_otp || !currentHeadFeatures.rows[0]?.social_enrollment) {
    throw new Error(`Current Auth V2 migration head was not applied: ${JSON.stringify(currentHeadFeatures.rows)}`);
  }

  const reviewColumns = await db.query(`
    SELECT "column_name", "column_default", "is_nullable"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ReviewLoginGuard'
  `);
  const reviewColumnByName = new Map(reviewColumns.rows.map((row) => [row.column_name, row]));
  if (!/0/.test(reviewColumnByName.get('attempts')?.column_default ?? '')
    || !/0/.test(reviewColumnByName.get('successes')?.column_default ?? '')
    || reviewColumnByName.get('phone')?.is_nullable !== 'NO') {
    throw new Error(`ReviewLoginGuard defaults/nullability are unsafe: ${JSON.stringify(reviewColumns.rows)}`);
  }
  await db.query(`
    INSERT INTO "ReviewLoginGuard" (phone, "updatedAt")
    VALUES ('+996700009929', CURRENT_TIMESTAMP)
  `);
  const reviewDefaults = await db.query(`
    SELECT attempts, successes FROM "ReviewLoginGuard" WHERE phone = '+996700009929'
  `);
  if (reviewDefaults.rows[0]?.attempts !== 0 || reviewDefaults.rows[0]?.successes !== 0) {
    throw new Error(`ReviewLoginGuard counters did not default to zero: ${JSON.stringify(reviewDefaults.rows)}`);
  }
  const reviewChecks = await db.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = '"ReviewLoginGuard"'::regclass AND contype = 'c'
  `);
  if (!reviewChecks.rows.some((row) => /phone/i.test(row.definition))
    || !reviewChecks.rows.some((row) => /attempts/i.test(row.definition))
    || !reviewChecks.rows.some((row) => /successes/i.test(row.definition))) {
    throw new Error(`ReviewLoginGuard phone/counter CHECK constraints are incomplete: ${JSON.stringify(reviewChecks.rows)}`);
  }
  await expectDatabaseReject(
    db,
    `INSERT INTO "ReviewLoginGuard" (phone, "updatedAt") VALUES ('996700009930', CURRENT_TIMESTAMP)`,
    'non-canonical ReviewLoginGuard phone',
  );
  await expectDatabaseReject(
    db,
    `UPDATE "ReviewLoginGuard" SET attempts = -1 WHERE phone = '+996700009929'`,
    'negative ReviewLoginGuard attempts',
  );
  await expectDatabaseReject(
    db,
    `UPDATE "ReviewLoginGuard" SET successes = -1 WHERE phone = '+996700009929'`,
    'negative ReviewLoginGuard successes',
  );

  const authLifecycleColumns = await db.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'RefreshToken' AND column_name = 'rotatedAt')
        OR
        (table_name = 'SocialEnrollment' AND column_name = 'consumedAt')
      )
  `);
  const authLifecycle = new Set(authLifecycleColumns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  if (!authLifecycle.has('RefreshToken.rotatedAt') || !authLifecycle.has('SocialEnrollment.consumedAt')) {
    throw new Error(`Auth rotation/replay columns are missing: ${JSON.stringify(authLifecycleColumns.rows)}`);
  }
  const socialUniqueIndexes = await db.query(`
    SELECT
      to_regclass('"SocialEnrollment_tokenHash_key"') IS NOT NULL AS token_unique,
      to_regclass('"SocialEnrollment_assertionHash_key"') IS NOT NULL AS assertion_unique
  `);
  if (!socialUniqueIndexes.rows[0]?.token_unique || !socialUniqueIndexes.rows[0]?.assertion_unique) {
    throw new Error(`SocialEnrollment replay uniqueness is missing: ${JSON.stringify(socialUniqueIndexes.rows)}`);
  }
  await db.query(`
    INSERT INTO "SocialEnrollment" (
      id, "tokenHash", "assertionHash", provider, subject, "expiresAt"
    ) VALUES (
      'supply-upgrade-social', 'token-hash-upgrade', 'assertion-hash-upgrade',
      'apple', 'subject-upgrade', CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    )
  `);
  await expectDatabaseReject(
    db,
    `INSERT INTO "SocialEnrollment" (
      id, "tokenHash", "assertionHash", provider, subject, "expiresAt"
    ) VALUES (
      'supply-upgrade-social-token-replay', 'token-hash-upgrade', 'assertion-hash-other',
      'apple', 'subject-other', CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    )`,
    'SocialEnrollment token replay',
  );
  await expectDatabaseReject(
    db,
    `INSERT INTO "SocialEnrollment" (
      id, "tokenHash", "assertionHash", provider, subject, "expiresAt"
    ) VALUES (
      'supply-upgrade-social-assertion-replay', 'token-hash-other', 'assertion-hash-upgrade',
      'apple', 'subject-other', CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    )`,
    'SocialEnrollment assertion replay',
  );
  const firstConsume = await db.query(`
    UPDATE "SocialEnrollment"
    SET "consumedAt" = CURRENT_TIMESTAMP
    WHERE id = 'supply-upgrade-social' AND "consumedAt" IS NULL
  `);
  const replayConsume = await db.query(`
    UPDATE "SocialEnrollment"
    SET "consumedAt" = CURRENT_TIMESTAMP
    WHERE id = 'supply-upgrade-social' AND "consumedAt" IS NULL
  `);
  if (firstConsume.rowCount !== 1 || replayConsume.rowCount !== 0) {
    throw new Error('SocialEnrollment one-time consume/replay predicate is not structurally enforceable');
  }

  const ticketBackfill = await db.query(`
    SELECT revision FROM "SupportTicket" WHERE id = 'supply-upgrade-ticket'
  `);
  if (ticketBackfill.rows[0]?.revision !== 0) {
    throw new Error(`Populated SupportTicket revision backfill failed: ${JSON.stringify(ticketBackfill.rows)}`);
  }
  const ticketStructure = await db.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = '"SupportTicket"'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%revision%>= 0%'
      ) AS revision_check,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = '"SupportTicket"'::regclass
          AND tgname = 'SupportTicket_revision_increment'
          AND NOT tgisinternal
          AND (tgtype & 2) = 2
          AND (tgtype & 16) = 16
      ) AS before_update_trigger
  `);
  if (!ticketStructure.rows[0]?.revision_check || !ticketStructure.rows[0]?.before_update_trigger) {
    throw new Error(`SupportTicket revision CHECK/BEFORE trigger is incomplete: ${JSON.stringify(ticketStructure.rows)}`);
  }
  await expectDatabaseReject(
    db,
    `INSERT INTO "SupportTicket" (
      id, "customerId", channel, priority, sla, status, subject, revision
    ) VALUES (
      'supply-upgrade-negative-ticket', 'supply-upgrade-customer', 'app', 'normal',
      CURRENT_TIMESTAMP + INTERVAL '1 day', 'new', 'Negative revision', -1
    )`,
    'negative SupportTicket revision',
  );
  await db.query(`
    UPDATE "SupportTicket" SET body = 'first update' WHERE id = 'supply-upgrade-ticket';
    UPDATE "SupportTicket" SET body = 'second update', revision = 99 WHERE id = 'supply-upgrade-ticket';
    UPDATE "SupportTicket" SET body = body WHERE id = 'supply-upgrade-ticket';
  `);
  const ticketAfterUpdates = await db.query(`
    SELECT revision FROM "SupportTicket" WHERE id = 'supply-upgrade-ticket'
  `);
  if (ticketAfterUpdates.rows[0]?.revision !== 3) {
    throw new Error(
      `SupportTicket BEFORE trigger did not increment exactly once per update or recursed: `
      + JSON.stringify(ticketAfterUpdates.rows),
    );
  }

  await expectDatabaseReject(
    db,
    `
        UPDATE "Product"
        SET "supplyMode" = 'to_order', "supplyLeadDays" = NULL
        WHERE id = 'supply-upgrade-product'
    `,
    'to_order Product without a lead time',
  );
} catch (error) {
  primaryError = error;
} finally {
  if (db) {
    try {
      await db.end();
    } catch (error) {
      cleanupErrors.push({ operation: 'test database client end', error });
    }
  }
  if (databaseCreated) {
    try {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    } catch (error) {
      cleanupErrors.push({ operation: 'terminate test database sessions', error });
    }
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    } catch (error) {
      cleanupErrors.push({ operation: 'drop test database', error });
    }
  }
  try {
    await admin.end();
  } catch (error) {
    cleanupErrors.push({ operation: 'admin client end', error });
  }
}

if (cleanupErrors.length > 0) {
  for (const { operation, error } of cleanupErrors) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[cleanup] ${operation} failed: ${detail}`);
  }
}
if (primaryError) {
  if (cleanupErrors.length > 0 && primaryError && typeof primaryError === 'object') {
    primaryError.cleanupErrors = cleanupErrors.map(({ operation }) => operation);
  }
  throw primaryError;
}
if (cleanupErrors.length > 0) {
  throw new AggregateError(
    cleanupErrors.map(({ error }) => error),
    `Supply migration upgrade cleanup failed: ${cleanupErrors.map(({ operation }) => operation).join(', ')}`,
  );
}

console.log('Supply migration upgrade test passed: populated pre-supply schema upgraded without invented promises.');
