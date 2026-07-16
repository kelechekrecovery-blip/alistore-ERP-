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
run('node', ['scripts/postdeploy-indexes.mjs']);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: directUrl ?? databaseUrl },
    shell: false,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
