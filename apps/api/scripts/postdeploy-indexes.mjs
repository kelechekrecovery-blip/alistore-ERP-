import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required for post-deploy indexes');
}
if (process.env.NODE_ENV === 'production' && !process.env.DIRECT_DATABASE_URL) {
  throw new Error('DIRECT_DATABASE_URL is required for production post-deploy indexes');
}

const client = new Client({ connectionString });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquireAdvisoryLock(key) {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired', [key]);
    if (result.rows[0]?.acquired) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for postdeploy advisory lock: ${key}`);
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

async function ensurePlainConcurrentIndex(name, columns) {
  const inspect = () => client.query(`
    SELECT index.indisvalid, index.indisready, index.indislive,
           table_class.relname = 'OrderBundleAllocation' AND table_namespace.nspname = current_schema() AS correct_table,
           access_method.amname = 'btree' AS correct_method,
           NOT index.indisunique AS correct_uniqueness,
           index.indnatts = $2 AND index.indnkeyatts = $2 AS correct_width,
           index.indexprs IS NULL AS no_expressions,
           index.indpred IS NULL AS no_predicate,
           ARRAY(
             SELECT attribute.attname
             FROM unnest(index.indkey::smallint[]) WITH ORDINALITY AS key(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = table_class.oid AND attribute.attnum = key.attnum
             WHERE key.position <= index.indnkeyatts
             ORDER BY key.position
           )::text[] AS columns
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = $1
  `, [name, columns.length]);
  const existing = await inspect();
  const metadataValid = existing.rowCount === 1
    && existing.rows[0].indisvalid
    && existing.rows[0].indisready
    && existing.rows[0].indislive
    && existing.rows[0].correct_table
    && existing.rows[0].correct_method
    && existing.rows[0].correct_uniqueness
    && existing.rows[0].correct_width
    && existing.rows[0].no_expressions
    && existing.rows[0].no_predicate
    && JSON.stringify(existing.rows[0].columns) === JSON.stringify(columns);
  if (existing.rowCount && !metadataValid) {
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdentifier(name)}`);
  }
  if (!metadataValid) {
    const columnSql = columns.map(quoteIdentifier).join(', ');
    await client.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdentifier(name)} ON "OrderBundleAllocation"(${columnSql})`,
    );
  }
  const verified = await inspect();
  const row = verified.rows[0];
  if (
    verified.rowCount !== 1 || !row.indisvalid || !row.indisready || !row.indislive
    || !row.correct_table || !row.correct_method || !row.correct_uniqueness
    || !row.correct_width || !row.no_expressions || !row.no_predicate
    || JSON.stringify(row.columns) !== JSON.stringify(columns)
  ) {
    throw new Error(`${name} is not ready and valid: ${JSON.stringify(verified.rows)}`);
  }
}

async function dropBundleAllocationGlobalConstraint() {
  await client.query("SET lock_timeout = '3s'");
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await client.query(
          'ALTER TABLE "OrderBundleAllocation" DROP CONSTRAINT IF EXISTS "OrderBundleAllocation_imei_key"',
        );
        return;
      } catch (error) {
        if (error?.code !== '55P03' || attempt === 5) throw error;
        await sleep(attempt * 250);
      }
    }
  } finally {
    await client.query("SET lock_timeout = '0'");
  }
}

try {
  await client.connect();
  // Concurrent production builds can legitimately outlive request timeouts.
  await client.query("SET lock_timeout = '0'");
  await client.query("SET statement_timeout = '0'");
  await acquireAdvisoryLock('postdeploy:Payment_giftCardId_idx');
  const existing = await client.query(`
    SELECT index.indisvalid, index.indisready, index.indislive,
           table_class.relname = 'Payment' AND table_namespace.nspname = current_schema() AS correct_table,
           access_method.amname = 'btree' AS correct_method,
           index.indisunique = false AS correct_uniqueness,
           index.indnatts = 1 AND index.indnkeyatts = 1 AS correct_width,
           index.indexprs IS NULL AS no_expressions,
           index.indpred IS NULL AS no_predicate,
           index.indkey[0] = attribute.attnum AND attribute.attname = 'giftCardId' AS correct_column,
           index.indoption[0] = 0 AS default_ordering,
           opclass.opcdefault AS default_opclass,
           index.indcollation[0] = attribute.attcollation AS correct_collation
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    JOIN pg_opclass opclass ON opclass.oid = index.indclass[0]
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'Payment_giftCardId_idx'
  `);
  const validDefinition = existing.rowCount === 1
    && Object.values(existing.rows[0]).every(Boolean);
  if (existing.rowCount && !validDefinition) {
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS "Payment_giftCardId_idx"');
  }
  await client.query(
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_giftCardId_idx" ON "Payment"("giftCardId")',
  );

  const result = await client.query(`
    SELECT 1
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    JOIN pg_opclass opclass ON opclass.oid = index.indclass[0]
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'Payment_giftCardId_idx'
      AND index.indisvalid AND index.indisready AND index.indislive
      AND table_namespace.nspname = current_schema()
      AND table_class.relname = 'Payment'
      AND access_method.amname = 'btree'
      AND NOT index.indisunique
      AND index.indnatts = 1
      AND index.indnkeyatts = 1
      AND index.indexprs IS NULL
      AND index.indpred IS NULL
      AND index.indkey[0] = attribute.attnum
      AND attribute.attname = 'giftCardId'
      AND index.indoption[0] = 0
      AND opclass.opcdefault
      AND index.indcollation[0] = attribute.attcollation
  `);
  if (result.rowCount !== 1) {
    throw new Error('Payment_giftCardId_idx is not ready and valid');
  }

  await acquireAdvisoryLock('postdeploy:CourierRun_assignmentIdempotencyKey_key');
  const courierRunIndex = await client.query(`
    SELECT index.indisvalid, index.indisready, index.indislive,
           table_class.relname = 'CourierRun' AND table_namespace.nspname = current_schema() AS correct_table,
           access_method.amname = 'btree' AS correct_method,
           index.indisunique AS correct_uniqueness,
           index.indnatts = 1 AND index.indnkeyatts = 1 AS correct_width,
           index.indexprs IS NULL AS no_expressions,
           index.indpred IS NULL AS no_predicate,
           index.indkey[0] = attribute.attnum AND attribute.attname = 'assignmentIdempotencyKey' AS correct_column
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'CourierRun_assignmentIdempotencyKey_key'
  `);
  const validCourierRunIndex = courierRunIndex.rowCount === 1
    && Object.values(courierRunIndex.rows[0]).every(Boolean);
  if (courierRunIndex.rowCount && !validCourierRunIndex) {
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS "CourierRun_assignmentIdempotencyKey_key"');
  }
  await client.query(
    'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "CourierRun_assignmentIdempotencyKey_key" ON "CourierRun"("assignmentIdempotencyKey")',
  );
  const courierRunResult = await client.query(`
    SELECT 1
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'CourierRun_assignmentIdempotencyKey_key'
      AND index.indisvalid AND index.indisready AND index.indislive
      AND table_namespace.nspname = current_schema()
      AND table_class.relname = 'CourierRun'
      AND access_method.amname = 'btree'
      AND index.indisunique
      AND index.indnatts = 1
      AND index.indnkeyatts = 1
      AND index.indexprs IS NULL
      AND index.indpred IS NULL
      AND index.indkey[0] = attribute.attnum
      AND attribute.attname = 'assignmentIdempotencyKey'
  `);
  if (courierRunResult.rowCount !== 1) {
    throw new Error('CourierRun_assignmentIdempotencyKey_key is not ready and valid');
  }

  await acquireAdvisoryLock('postdeploy:Reservation_active_expiresAt_idx');
  const reservationExpiryIndex = await client.query(`
    SELECT index.indisvalid, index.indisready, index.indislive,
           table_class.relname = 'Reservation' AND table_namespace.nspname = current_schema() AS correct_table,
           access_method.amname = 'btree' AS correct_method,
           NOT index.indisunique AS correct_uniqueness,
           index.indnatts = 1 AND index.indnkeyatts = 1 AS correct_width,
           index.indexprs IS NULL AS no_expressions,
           index.indpred IS NOT NULL AS has_predicate,
           index.indkey[0] = attribute.attnum AND attribute.attname = 'expiresAt' AS correct_column,
           pg_get_expr(index.indpred, index.indrelid) IN ('active', '(active = true)') AS correct_predicate
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'Reservation_active_expiresAt_idx'
  `);
  const validReservationExpiryIndex = reservationExpiryIndex.rowCount === 1
    && Object.values(reservationExpiryIndex.rows[0]).every(Boolean);
  if (reservationExpiryIndex.rowCount && !validReservationExpiryIndex) {
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS "Reservation_active_expiresAt_idx"');
  }
  await client.query(
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Reservation_active_expiresAt_idx" ON "Reservation"("expiresAt") WHERE "active" = true',
  );
  const reservationExpiryResult = await client.query(`
    SELECT 1
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'Reservation_active_expiresAt_idx'
      AND index.indisvalid AND index.indisready AND index.indislive
      AND table_namespace.nspname = current_schema()
      AND table_class.relname = 'Reservation'
      AND access_method.amname = 'btree'
      AND NOT index.indisunique
      AND index.indnatts = 1
      AND index.indnkeyatts = 1
      AND index.indexprs IS NULL
      AND index.indpred IS NOT NULL
      AND index.indkey[0] = attribute.attnum
      AND attribute.attname = 'expiresAt'
      AND pg_get_expr(index.indpred, index.indrelid) IN ('active', '(active = true)')
  `);
  if (reservationExpiryResult.rowCount !== 1) {
    throw new Error('Reservation_active_expiresAt_idx is not ready and valid');
  }

  await ensurePlainConcurrentIndex('OrderBundleAllocation_orderId_active_idx', ['orderId', 'active']);
  await ensurePlainConcurrentIndex('OrderBundleAllocation_imei_idx', ['imei']);

  await acquireAdvisoryLock('postdeploy:OrderBundleAllocation_active_imei_key');
  const existingActiveBundleImeiIndex = await client.query(`
    SELECT index.indisvalid, index.indisready, index.indislive,
           table_class.relname = 'OrderBundleAllocation' AND table_namespace.nspname = current_schema() AS correct_table,
           access_method.amname = 'btree' AS correct_method,
           index.indisunique AS correct_uniqueness,
           index.indnatts = 1 AND index.indnkeyatts = 1 AS correct_width,
           index.indexprs IS NULL AS no_expressions,
           index.indpred IS NOT NULL AS has_predicate,
           index.indkey[0] = attribute.attnum AND attribute.attname = 'imei' AS correct_column,
           pg_get_expr(index.indpred, index.indrelid) IN ('active', '(active = true)') AS correct_predicate
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am access_method ON access_method.oid = index_class.relam
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'OrderBundleAllocation_active_imei_key'
  `);
  const validActiveBundleImeiIndex = existingActiveBundleImeiIndex.rowCount === 1
    && Object.values(existingActiveBundleImeiIndex.rows[0]).every(Boolean);
  if (existingActiveBundleImeiIndex.rowCount && !validActiveBundleImeiIndex) {
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS "OrderBundleAllocation_active_imei_key"');
  }
  await client.query(
    'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "OrderBundleAllocation_active_imei_key" ON "OrderBundleAllocation"(imei) WHERE active = true',
  );
  const activeBundleImeiIndex = await client.query(`
    SELECT 1
    FROM pg_class index_class
    JOIN pg_index index ON index.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = index.indkey[0]
    WHERE index_namespace.nspname = current_schema()
      AND index_class.relname = 'OrderBundleAllocation_active_imei_key'
      AND index.indisvalid AND index.indisready AND index.indislive
      AND table_namespace.nspname = current_schema()
      AND table_class.relname = 'OrderBundleAllocation'
      AND index.indisunique
      AND index.indnatts = 1
      AND index.indnkeyatts = 1
      AND index.indexprs IS NULL
      AND index.indpred IS NOT NULL
      AND index.indkey[0] = attribute.attnum
      AND attribute.attname = 'imei'
      AND pg_get_expr(index.indpred, index.indrelid) IN ('active', '(active = true)')
  `);
  if (activeBundleImeiIndex.rowCount !== 1) {
    throw new Error('OrderBundleAllocation_active_imei_key is not ready and valid');
  }
  // Replace the old global uniqueness only after the partial index is ready, so
  // inactive historical allocation attempts can retain and later reuse an IMEI.
  await dropBundleAllocationGlobalConstraint();
  await client.query(
    'DROP INDEX CONCURRENTLY IF EXISTS "OrderBundleAllocation_imei_key"',
  );
} finally {
  await client.end();
}
