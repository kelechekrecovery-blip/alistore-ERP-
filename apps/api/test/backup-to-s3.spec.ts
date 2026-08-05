import { libpqEnv, libpqUrl } from '../src/ops/backup-to-s3';

/**
 * The production nightly backup shells out to `pg_dump`, which speaks libpq
 * connection strings and rejects Prisma's query parameters ("неверный параметр в
 * URI: schema"). Production is currently spared only because Render hands the job
 * a bare connection string — but any staging or local URL carries `?schema=public`
 * (and often `connection_limit`/`pgbouncer`), and that would abort the backup.
 * This locks the sanitisation so the regression can't come back silently.
 */
describe('libpqUrl', () => {
  it('strips Prisma-only query parameters pg_dump cannot parse', () => {
    expect(libpqUrl('postgresql://u@h:5432/db?schema=public')).toBe('postgresql://u@h:5432/db');
    expect(
      libpqUrl('postgresql://u@h:5432/db?schema=public&connection_limit=5&pgbouncer=true'),
    ).toBe('postgresql://u@h:5432/db');
  });

  it('keeps libpq-recognised parameters like sslmode', () => {
    expect(libpqUrl('postgresql://u@h:5432/db?sslmode=require&schema=public')).toBe(
      'postgresql://u@h:5432/db?sslmode=require',
    );
    expect(libpqUrl('postgresql://u@h:5432/db?sslmode=verify-full&connect_timeout=10')).toBe(
      'postgresql://u@h:5432/db?sslmode=verify-full&connect_timeout=10',
    );
  });

  it('leaves a clean URL untouched', () => {
    expect(libpqUrl('postgresql://u@h:5432/db')).toBe('postgresql://u@h:5432/db');
  });
});

describe('libpqEnv', () => {
  it('keeps credentials out of argv-compatible values and maps safe libpq options', () => {
    expect(libpqEnv('postgresql://backup:p%40ss@db.example:6432/alistore?schema=public&sslmode=require'))
      .toEqual(expect.objectContaining({
        PGHOST: 'db.example', PGPORT: '6432', PGUSER: 'backup', PGPASSWORD: 'p@ss',
        PGDATABASE: 'alistore', PGSSLMODE: 'require',
      }));
  });
});
