import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface DbClient {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
  connect(): Promise<void>;
}

const { Client } = require('pg') as {
  Client: new (options: { connectionString: string }) => DbClient;
};

describe('Review login guard constraints migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260730170000_review_login_guard_constraints/migration.sql',
    ),
    'utf8',
  );
  const schemas: string[] = [];

  afterEach(async () => {
    for (const schema of schemas.splice(0)) {
      const client = await connectedClient();
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });

  it('enforces canonical phones and nonnegative attempt budgets', async () => {
    const { client } = await isolatedSchema();
    await client.query(`
      INSERT INTO "ReviewLoginGuard" (phone, attempts, successes)
      VALUES ('+996700123456', 1, 2)
    `);

    await client.query(sql);

    await expect(client.query(`
      INSERT INTO "ReviewLoginGuard" (phone, attempts, successes)
      VALUES ('996700123457', 0, 0)
    `)).rejects.toMatchObject({ code: '23514' });
    await expect(client.query(`
      INSERT INTO "ReviewLoginGuard" (phone, attempts, successes)
      VALUES ('+096700123457', 0, 0)
    `)).rejects.toMatchObject({ code: '23514' });
    await expect(client.query(`
      INSERT INTO "ReviewLoginGuard" (phone, attempts, successes)
      VALUES ('+996700123458', -1, 0)
    `)).rejects.toMatchObject({ code: '23514' });
    await expect(client.query(`
      INSERT INTO "ReviewLoginGuard" (phone, attempts, successes)
      VALUES ('+996700123459', 0, -1)
    `)).rejects.toMatchObject({ code: '23514' });
    await client.end();
  });

  it('fails explicitly before installing constraints over invalid existing state', async () => {
    const { client } = await isolatedSchema();
    await client.query(`
      INSERT INTO "ReviewLoginGuard" (phone, attempts, successes)
      VALUES ('not-canonical', -1, 0)
    `);

    await expect(client.query(sql)).rejects.toThrow(
      /Cannot enforce ReviewLoginGuard constraints: 1 invalid row/,
    );
    const constraints = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM pg_constraint
      WHERE conrelid = '"ReviewLoginGuard"'::regclass
        AND contype = 'c'
    `);
    expect(constraints.rows).toEqual([{ count: '0' }]);
    await client.end();
  });

  async function isolatedSchema(): Promise<{
    client: DbClient;
    schema: string;
  }> {
    const client = await connectedClient();
    const schema = `review_guard_migration_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    schemas.push(schema);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "ReviewLoginGuard" (
        phone TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        successes INTEGER NOT NULL DEFAULT 0
      )
    `);
    return { client, schema };
  }

  async function connectedClient(): Promise<DbClient> {
    const connectionString =
      process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error('Test database URL is not configured');
    const client = new Client({ connectionString });
    await client.connect();
    return client;
  }
});
