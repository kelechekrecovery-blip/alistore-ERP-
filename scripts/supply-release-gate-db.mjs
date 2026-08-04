const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function validateSupplyGateDatabaseUrl(
  explicitBase,
  {
    planOnly = false,
    confirmed = false,
    productionDatabaseUrl,
  } = {},
) {
  if (!planOnly && !explicitBase) {
    throw new Error('full release gate requires explicit E2E_DATABASE_URL or TEST_DATABASE_URL');
  }
  const base = explicitBase
    ?? 'postgresql://alistore@localhost:5432/alistore_test?schema=public';
  const url = new URL(base);
  const database = url.pathname.replace(/^\//, '');
  if (!/(^|_)test($|_)/i.test(database)) {
    throw new Error('release gate requires E2E_DATABASE_URL/TEST_DATABASE_URL with a test database name');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error('release gate refuses destructive database operations on non-loopback hosts');
  }
  if (url.searchParams.has('host') || url.searchParams.has('hostaddr')) {
    throw new Error('release gate refuses PostgreSQL host overrides in connection parameters');
  }
  if (!planOnly && !confirmed) {
    throw new Error('full release gate requires ALISTORE_TEST_DATABASE_CONFIRMED=1');
  }
  if (
    !planOnly
    && productionDatabaseUrl
    && new URL(productionDatabaseUrl).toString() === url.toString()
  ) {
    throw new Error('test database URL must not equal DATABASE_URL');
  }
  return base;
}
