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

describe('Auth phone normalization migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260730120000_add_recovery_otp_purpose/migration.sql',
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

  it('backfills legacy rows, invalidates SMS proofs, and enforces canonical customer uniqueness', async () => {
    const { client, schema } = await isolatedLegacySchema();
    await client.query(`
      INSERT INTO "Customer" (phone) VALUES ('996700123456');
      INSERT INTO "OtpChallenge" (phone, channel) VALUES
        ('996700123456', 'sms'),
        (NULL, 'email');
    `);

    await client.query(sql);

    const customer = await client.query<{ phone: string }>(
      `SELECT phone FROM "Customer"`,
    );
    expect(customer.rows).toEqual([{ phone: '+996700123456' }]);
    const challenges = await client.query<{
      phone: string | null;
      channel: string;
      consumed: boolean;
    }>(`
      SELECT phone, channel::text AS channel, "consumedAt" IS NOT NULL AS consumed
      FROM "OtpChallenge"
      ORDER BY channel::text
    `);
    expect(challenges.rows).toEqual([
      { phone: null, channel: 'email', consumed: false },
      { phone: '+996700123456', channel: 'sms', consumed: true },
    ]);
    await expect(
      client.query(`INSERT INTO "Customer" (phone) VALUES ('996700123456')`),
    ).rejects.toMatchObject({ code: '23505' });
    const index = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1`,
      [schema],
    );
    expect(index.rows.map((row) => row.indexname)).toContain(
      'Customer_phone_canonical_key',
    );
    await client.end();
  });

  it('aborts before changing legacy rows when canonical customers collide', async () => {
    const { client } = await isolatedLegacySchema();
    await client.query(`
      INSERT INTO "Customer" (phone) VALUES
        ('996700654321'),
        ('+996700654321');
      INSERT INTO "OtpChallenge" (phone, channel)
      VALUES ('996700654321', 'sms');
    `);

    await expect(client.query(sql)).rejects.toThrow(
      /Cannot canonicalize Customer\.phone/,
    );
    const customers = await client.query<{ phone: string }>(
      `SELECT phone FROM "Customer" ORDER BY phone`,
    );
    expect(customers.rows.map((row) => row.phone)).toEqual([
      '+996700654321',
      '996700654321',
    ]);
    const challenge = await client.query<{ phone: string; consumed: boolean }>(
      `SELECT phone, "consumedAt" IS NOT NULL AS consumed FROM "OtpChallenge"`,
    );
    expect(challenge.rows).toEqual([
      { phone: '996700654321', consumed: false },
    ]);
    await client.end();
  });

  async function isolatedLegacySchema(): Promise<{
    client: DbClient;
    schema: string;
  }> {
    const client = await connectedClient();
    const schema = `auth_migration_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    schemas.push(schema);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "OtpPurpose" AS ENUM ('login', 'email_attach');
      CREATE TYPE "OtpChannel" AS ENUM ('sms', 'email');
      CREATE TABLE "Customer" (
        id text PRIMARY KEY DEFAULT md5(random()::text),
        phone text NOT NULL
      );
      CREATE TABLE "OtpChallenge" (
        id text PRIMARY KEY DEFAULT md5(random()::text),
        phone text,
        channel "OtpChannel" NOT NULL DEFAULT 'sms',
        "consumedAt" timestamp(3)
      );
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
