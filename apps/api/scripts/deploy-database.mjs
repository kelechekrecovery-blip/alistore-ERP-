import { spawnSync } from 'node:child_process';

const directUrl = process.env.DIRECT_DATABASE_URL;
if (process.env.NODE_ENV === 'production' && !directUrl) {
  throw new Error('DIRECT_DATABASE_URL is required for production database deployment');
}
const databaseUrl = directUrl ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required for database deployment');
}

run('npx', ['prisma', 'migrate', 'deploy']);
run('node', ['scripts/check-inventory-valuation-locations.mjs']);
run('node', ['scripts/postdeploy-indexes.mjs']);
// Справочники ставятся деплоем, а не миграцией и не тестами: до этого план
// счетов существовал только в INSERT-е миграции и в тестовом харнессе, и в
// рабочей базе его могло не оказаться вовсе.
run('node', ['scripts/ensure-reference-data.mjs']);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: directUrl ?? databaseUrl },
    shell: false,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
