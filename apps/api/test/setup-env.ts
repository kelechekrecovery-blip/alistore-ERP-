// Load .env, then point integration tests at the isolated TEST database so they
// never touch dev/prod data.
import { config } from 'dotenv';

process.env.NODE_ENV ??= 'test';
config();
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
