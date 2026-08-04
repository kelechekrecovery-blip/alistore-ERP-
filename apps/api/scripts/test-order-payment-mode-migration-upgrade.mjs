import { readFile, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsRoot = path.resolve(here, '../prisma/migrations');
const targetMigration = '20260716147000_order_payment_mode';
const sourceUrl = process.env.TEST_DATABASE_URL;

if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const source = new URL(sourceUrl);
if (!/(^|[_-])test($|[_-])/i.test(source.pathname.replace(/^\/+/, ''))) {
  throw new Error(`Refusing migration upgrade test against non-test database ${source.pathname}`);
}

const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const databaseName = `alistore_test_order_mode_upgrade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseUrl = new URL(source);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.delete('schema');
const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function runPostdeploy(databaseUrlValue) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(here, 'postdeploy-indexes.mjs')], {
      cwd: path.resolve(here, '../../..'),
      env: { ...process.env, DATABASE_URL: databaseUrlValue, DIRECT_DATABASE_URL: databaseUrlValue },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 90_000);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Postdeploy failed (${code ?? signal}):\n${stdout}\n${stderr}`));
    });
  });
}

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
      VALUES ('order-mode-customer', '+996700009903', 'Order mode upgrade', '{}');
      INSERT INTO "Order" (id, "customerId", status, channel, "fulfillmentType", total)
      VALUES
        ('cod-paid', 'order-mode-customer', 'paid', 'web', 'courier', 100),
        ('cod-picking', 'order-mode-customer', 'picking', 'web', 'courier', 100),
        ('cod-packed', 'order-mode-customer', 'packed', 'web', 'courier', 100),
        ('cod-completed', 'order-mode-customer', 'completed', 'web', 'courier', 100),
        ('ambiguous-created', 'order-mode-customer', 'created', 'web', 'courier', 100),
        ('settled-paid', 'order-mode-customer', 'paid', 'web', 'courier', 100),
        ('released-cancelled', 'order-mode-customer', 'cancelled', 'web', 'pickup', 100);
      INSERT INTO "Payment" (id, "orderId", amount, method, status)
      VALUES ('settled-payment', 'settled-paid', 100, 'cash', 'received');
      INSERT INTO "Product" (id, sku, name, price, cost, category, attrs)
      VALUES ('legacy-component', 'LEGACY-COMPONENT', 'Legacy component', 100, 50, 'test', '{}');
      INSERT INTO "OrderItem" (id, "orderId", sku, qty, price)
      VALUES
        ('legacy-bundle-line', 'settled-paid', 'LEGACY-BUNDLE', 1, 100),
        ('released-bundle-line', 'released-cancelled', 'LEGACY-BUNDLE', 1, 100);
      INSERT INTO "DeviceUnit" (id, imei, "productId", status, location, "orderId")
      VALUES
        ('legacy-sold-unit', '990000000000001', 'legacy-component', 'sold', 'MAIN', 'settled-paid'),
        ('legacy-released-unit', '990000000000002', 'legacy-component', 'in_stock', 'MAIN', NULL);
      INSERT INTO "Reservation" (id, "orderId", imei, "expiresAt", active)
      VALUES ('legacy-released-reservation', 'released-cancelled', '990000000000002', CURRENT_TIMESTAMP, false);
      INSERT INTO "OrderBundleAllocation" (
        id, "orderId", "orderItemId", "bundleSku", "componentProductId", "componentSku", location, imei
      ) VALUES
        (
          'legacy-bundle-allocation', 'settled-paid', 'legacy-bundle-line', 'LEGACY-BUNDLE',
          'legacy-component', 'LEGACY-COMPONENT', 'MAIN', '990000000000001'
        ),
        (
          'released-bundle-allocation', 'released-cancelled', 'released-bundle-line', 'LEGACY-BUNDLE',
          'legacy-component', 'LEGACY-COMPONENT', 'MAIN', '990000000000002'
        );
    `);

    await applyMigration(db, targetMigration);
    const modes = await db.query(`SELECT id, "paymentMode" FROM "Order" ORDER BY id`);
    const byId = new Map(modes.rows.map((row) => [row.id, row.paymentMode]));
    for (const id of ['cod-paid', 'cod-picking', 'cod-packed', 'cod-completed']) {
      if (byId.get(id) !== 'cod') throw new Error(`Expected ${id} to backfill as COD: ${JSON.stringify(modes.rows)}`);
    }
    for (const id of ['ambiguous-created', 'settled-paid']) {
      if (byId.get(id) !== 'prepaid') throw new Error(`Expected ${id} to remain prepaid: ${JSON.stringify(modes.rows)}`);
    }

    const lifecycle = await db.query(`
      SELECT active, "releasedAt", "consumedAt"
      FROM "OrderBundleAllocation"
      WHERE id = 'legacy-bundle-allocation'
    `);
    const legacyAllocation = lifecycle.rows[0];
    if (legacyAllocation?.active !== false || legacyAllocation.releasedAt !== null || !legacyAllocation.consumedAt) {
      throw new Error(`Expected sold legacy bundle allocation to be preserved as consumed: ${JSON.stringify(lifecycle.rows)}`);
    }
    const releasedLifecycle = await db.query(`
      SELECT active, "releasedAt", "consumedAt"
      FROM "OrderBundleAllocation"
      WHERE id = 'released-bundle-allocation'
    `);
    const releasedAllocation = releasedLifecycle.rows[0];
    if (releasedAllocation?.active !== false || !releasedAllocation.releasedAt || releasedAllocation.consumedAt !== null) {
      throw new Error(`Expected cancelled legacy bundle allocation to be preserved as released: ${JSON.stringify(releasedLifecycle.rows)}`);
    }

    await db.query(`
      INSERT INTO "Order" (id, "customerId", status, channel, "fulfillmentType", total)
      VALUES
        ('rolling-cod', 'order-mode-customer', 'created', 'web', 'courier', 100),
        ('rolling-bundle', 'order-mode-customer', 'created', 'web', 'pickup', 100);
      INSERT INTO "Order" (
        id, "customerId", status, channel, "fulfillmentType", "paymentMode", "paymentModeExplicit", total
      ) VALUES (
        'explicit-prepaid', 'order-mode-customer', 'packed', 'web', 'courier', 'prepaid', true, 100
      );
      UPDATE "Order" SET status = 'paid' WHERE id = 'rolling-cod';
    `);
    const rollingCod = await db.query(`SELECT "paymentMode" FROM "Order" WHERE id = 'rolling-cod'`);
    if (rollingCod.rows[0]?.paymentMode !== 'cod') {
      throw new Error(`Expected old API status update after migration to classify COD: ${JSON.stringify(rollingCod.rows)}`);
    }
    const explicitPrepaid = await db.query(`SELECT "paymentMode" FROM "Order" WHERE id = 'explicit-prepaid'`);
    if (explicitPrepaid.rows[0]?.paymentMode !== 'prepaid') {
      throw new Error(`Expected explicit prepaid order to remain prepaid: ${JSON.stringify(explicitPrepaid.rows)}`);
    }
    await db.query(`
      INSERT INTO "Payment" (id, "orderId", amount, method, status)
      VALUES ('rolling-settled-payment', 'rolling-cod', 100, 'cash', 'received');
    `);
    const rollingSettled = await db.query(`SELECT "paymentMode" FROM "Order" WHERE id = 'rolling-cod'`);
    if (rollingSettled.rows[0]?.paymentMode !== 'prepaid') {
      throw new Error(`Expected full legacy payment to restore prepaid classification: ${JSON.stringify(rollingSettled.rows)}`);
    }

    await db.query(`
      INSERT INTO "Order" (id, "customerId", status, channel, "fulfillmentType", total)
      VALUES
        ('rolling-race', 'order-mode-customer', 'paid', 'web', 'courier', 200),
        ('rolling-move-a', 'order-mode-customer', 'paid', 'web', 'courier', 100),
        ('rolling-move-b', 'order-mode-customer', 'paid', 'web', 'courier', 100);
    `);
    const paymentWriters = [
      new Client({ connectionString: databaseUrl.toString() }),
      new Client({ connectionString: databaseUrl.toString() }),
    ];
    await Promise.all(paymentWriters.map((writer) => writer.connect()));
    try {
      await Promise.all(paymentWriters.map((writer, index) => writer.query(`
        INSERT INTO "Payment" (id, "orderId", amount, method, status)
        VALUES ($1, 'rolling-race', 100, 'cash', 'received')
      `, [`rolling-race-payment-${index}`])));
    } finally {
      await Promise.all(paymentWriters.map((writer) => writer.end()));
    }
    const racedMode = await db.query(`SELECT "paymentMode" FROM "Order" WHERE id = 'rolling-race'`);
    if (racedMode.rows[0]?.paymentMode !== 'prepaid') {
      throw new Error(`Expected concurrent legacy payments to settle prepaid classification: ${JSON.stringify(racedMode.rows)}`);
    }

    await db.query(`
      INSERT INTO "Payment" (id, "orderId", amount, method, status)
      VALUES ('rolling-moved-payment', 'rolling-move-a', 100, 'cash', 'received');
      UPDATE "Payment" SET "orderId" = 'rolling-move-b' WHERE id = 'rolling-moved-payment';
    `);
    const movedModes = await db.query(`
      SELECT id, "paymentMode" FROM "Order"
      WHERE id IN ('rolling-move-a', 'rolling-move-b') ORDER BY id
    `);
    const movedById = new Map(movedModes.rows.map((row) => [row.id, row.paymentMode]));
    if (movedById.get('rolling-move-a') !== 'cod' || movedById.get('rolling-move-b') !== 'prepaid') {
      throw new Error(`Expected payment orderId move to reconcile both orders: ${JSON.stringify(movedModes.rows)}`);
    }

    await db.query(`
      INSERT INTO "OrderItem" (id, "orderId", sku, qty, price)
      VALUES ('rolling-bundle-line', 'rolling-bundle', 'LEGACY-BUNDLE', 1, 100);
      INSERT INTO "DeviceUnit" (id, imei, "productId", status, location, "orderId")
      VALUES ('rolling-bundle-unit', '990000000000003', 'legacy-component', 'reserved', 'MAIN', 'rolling-bundle');
      INSERT INTO "Reservation" (id, "orderId", imei, "expiresAt", active)
      VALUES ('rolling-bundle-reservation', 'rolling-bundle', '990000000000003', CURRENT_TIMESTAMP, true);
      INSERT INTO "OrderBundleAllocation" (
        id, "orderId", "orderItemId", "bundleSku", "componentProductId", "componentSku", location, imei
      ) VALUES (
        'rolling-bundle-allocation', 'rolling-bundle', 'rolling-bundle-line', 'LEGACY-BUNDLE',
        'legacy-component', 'LEGACY-COMPONENT', 'MAIN', '990000000000003'
      );
      UPDATE "DeviceUnit" SET status = 'in_stock', "orderId" = NULL WHERE id = 'rolling-bundle-unit';
      UPDATE "Reservation" SET active = false WHERE id = 'rolling-bundle-reservation';
    `);
    const rollingLifecycle = await db.query(`
      SELECT active, "releasedAt", "consumedAt"
      FROM "OrderBundleAllocation"
      WHERE id = 'rolling-bundle-allocation'
    `);
    if (rollingLifecycle.rows[0]?.active !== false || !rollingLifecycle.rows[0]?.releasedAt || rollingLifecycle.rows[0]?.consumedAt !== null) {
      throw new Error(`Expected old API release after migration to synchronize allocation lifecycle: ${JSON.stringify(rollingLifecycle.rows)}`);
    }

    // A failed concurrent build can leave an index with the right name and the
    // wrong definition. Postdeploy must repair it before removing global IMEI
    // uniqueness, then an inactive historical IMEI must be reusable.
    await db.query(`CREATE INDEX "OrderBundleAllocation_active_imei_key" ON "OrderBundleAllocation"("orderId")`);
    await Promise.all([
      runPostdeploy(databaseUrl.toString()),
      runPostdeploy(databaseUrl.toString()),
    ]);
    const postdeploy = spawnSync(process.execPath, [path.resolve(here, 'postdeploy-indexes.mjs')], {
      cwd: path.resolve(here, '../../..'),
      env: { ...process.env, DATABASE_URL: databaseUrl.toString(), DIRECT_DATABASE_URL: databaseUrl.toString() },
      encoding: 'utf8',
      timeout: 90_000,
    });
    if (postdeploy.status !== 0) {
      throw new Error(`Postdeploy recovery failed:\n${postdeploy.stdout}\n${postdeploy.stderr}`);
    }
    await db.query(`
      INSERT INTO "OrderItem" (id, "orderId", sku, qty, price)
      VALUES ('replacement-bundle-line', 'ambiguous-created', 'LEGACY-BUNDLE', 1, 100);
      INSERT INTO "OrderBundleAllocation" (
        id, "orderId", "orderItemId", "bundleSku", "componentProductId", "componentSku", location, imei
      ) VALUES (
        'replacement-bundle-allocation', 'ambiguous-created', 'replacement-bundle-line', 'LEGACY-BUNDLE',
        'legacy-component', 'LEGACY-COMPONENT', 'MAIN', '990000000000003'
      );
    `);

    await db.query('BEGIN');
    try {
      await db.query(`UPDATE "Order" SET "fulfillmentType" = 'pickup' WHERE id = 'cod-packed'`);
      await db.query('COMMIT');
      throw new Error('COD courier constraint unexpectedly accepted pickup fulfillment');
    } catch (error) {
      await db.query('ROLLBACK');
      if (error instanceof Error && error.message === 'COD courier constraint unexpectedly accepted pickup fulfillment') throw error;
    }
  } finally {
    await db.end();
  }
} finally {
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
}

console.log('Order payment-mode migration upgrade test passed: COD backfill and constraints verified.');
