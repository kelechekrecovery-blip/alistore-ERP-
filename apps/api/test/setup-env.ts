// Load .env, then point integration tests at the isolated TEST database so they
// never touch dev/prod data.
import http from 'node:http';
import { config } from 'dotenv';

// Node 19 turned on connection pooling in the global agent. Supertest binds a
// fresh ephemeral port for every `request(app.getHttpServer())` call and closes
// it right after, so a pooled socket can outlive its server and land on whatever
// the OS gave that port next — the client then reads a reply that is not HTTP
// and throws «Parse Error: Expected HTTP/, RTSP/ or ICE/». That surfaced as a
// gate failure in a different suite on every run (batches 55, 81, 163), each
// passing 17/17 in isolation. Tests are short-lived and local: pooling buys
// nothing here and costs reproducibility.
http.globalAgent = new http.Agent({ keepAlive: false });

process.env.NODE_ENV ??= 'test';
if (process.env.ALISTORE_EVIDENCE_MODE !== '1') config();
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
