import { Client } from 'pg';
import {
  FEATURE_FLAG_DEPLOY_PROCESS_TIMEOUT_MS,
  deployWithFeatureFlagCutoverGate,
} from './feature-flag-cutover-gate.mjs';
import { runBoundedCommand } from './run-bounded-command.mjs';

const directUrl = process.env.DIRECT_DATABASE_URL;
if (process.env.NODE_ENV === 'production' && !directUrl) {
  throw new Error('DIRECT_DATABASE_URL is required for production database deployment');
}
const databaseUrl = directUrl ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required for database deployment');
}

await deployWithFeatureFlagCutoverGate({
  client: new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 45_000,
  }),
  production: process.env.NODE_ENV === 'production',
  releaseSha: process.env.RENDER_GIT_COMMIT ?? process.env.ALISTORE_RELEASE_SHA,
  acknowledgement: process.env.FEATURE_FLAG_CUTOVER_ACK,
  acknowledgedSha: process.env.FEATURE_FLAG_CUTOVER_ACK_SHA,
  deploy: () => run('npx', ['prisma', 'migrate', 'deploy']),
  log: (message) => console.log(`[feature-flag-cutover] ${message}`),
});
await run('node', ['scripts/check-inventory-valuation-locations.mjs']);
await run('node', ['scripts/postdeploy-indexes.mjs']);
// Справочники ставятся деплоем, а не миграцией и не тестами: до этого план
// счетов существовал только в INSERT-е миграции и в тестовом харнессе, и в
// рабочей базе его могло не оказаться вовсе.
await run('node', ['scripts/ensure-reference-data.mjs']);

function run(command, args) {
  return runBoundedCommand(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: directUrl ?? databaseUrl },
    timeoutMs: FEATURE_FLAG_DEPLOY_PROCESS_TIMEOUT_MS,
  });
}
