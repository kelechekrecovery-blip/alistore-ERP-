// Load .env, then point integration tests at the isolated TEST database so they
// never touch dev/prod data.
import { config } from 'dotenv';

process.env.NODE_ENV ??= 'test';
config();
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for API tests');
const parsed = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
  throw new Error(`TEST_DATABASE_URL must target an explicitly named test database; got ${databaseName}`);
}
if (
  process.env.DATABASE_URL
  && normalizedDatabase(process.env.DATABASE_URL) === normalizedDatabase(testDatabaseUrl)
  && process.env.ALISTORE_TEST_DATABASE_CONFIRMED !== '1'
) {
  throw new Error('TEST_DATABASE_URL must differ from the configured development/production DATABASE_URL');
}
process.env.DATABASE_URL = testDatabaseUrl;

function normalizedDatabase(value: string) {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  return url.toString();
}
