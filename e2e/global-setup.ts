import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

function prepareIsolatedDatabase() {
  if (process.env.E2E_AUTO_PREPARE_DB === 'false') return;

  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://alistore@localhost:5432/alistore_test?schema=public';
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const localHost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

  if (!localHost || !databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing automatic E2E schema preparation for non-isolated database ${parsed.hostname}/${databaseName}. ` +
        'Use a localhost database whose name ends with _test.',
    );
  }

  const prismaBin = join(process.cwd(), 'node_modules', '.bin', 'prisma');
  // Rebuild the isolated schema from migration history so stale triggers and
  // other objects that `db push` cannot remove never leak between E2E runs.
  execFileSync(prismaBin, ['migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], {
    cwd: join(process.cwd(), 'apps', 'api'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

export default function globalSetup() {
  prepareIsolatedDatabase();
  const apiPort = Number(process.env.E2E_API_PORT ?? 4200);
  rmSync(`/tmp/alistore-e2e-media-${apiPort}`, { recursive: true, force: true });
}
