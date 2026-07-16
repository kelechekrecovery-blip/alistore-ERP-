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

try {
  await client.connect();
  // Concurrent production builds can legitimately outlive request timeouts.
  await client.query("SET lock_timeout = '0'");
  await client.query("SET statement_timeout = '0'");
  await client.query(
    "SELECT pg_advisory_lock(hashtextextended('postdeploy:Payment_giftCardId_idx', 0))",
  );
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
} finally {
  await client.end();
}
