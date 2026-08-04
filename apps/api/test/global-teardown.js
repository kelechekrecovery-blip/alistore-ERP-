const { Client } = require('pg');

const PG_CONNECT_TIMEOUT_MS = 5_000;
const PG_QUERY_TIMEOUT_MS = 10_000;

module.exports = async function globalTeardown() {
  const state = global.__ALISTORE_JEST_SCHEMA__;
  if (!state) return;

  const { adminDatabaseUrl, schemaName } = state;
  if (!/^alistore_jest_[0-9]+_[a-f0-9]{12}$/.test(schemaName)) {
    throw new Error('Refusing to drop an unexpected Jest schema name');
  }

  const client = new Client({
    connectionString: adminDatabaseUrl,
    connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS,
    query_timeout: PG_QUERY_TIMEOUT_MS,
    statement_timeout: PG_QUERY_TIMEOUT_MS,
    lock_timeout: PG_CONNECT_TIMEOUT_MS,
  });
  try {
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } catch (error) {
    const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
    throw new Error(`Failed to remove isolated Jest schema${code}`);
  } finally {
    await client.end();
  }
};
