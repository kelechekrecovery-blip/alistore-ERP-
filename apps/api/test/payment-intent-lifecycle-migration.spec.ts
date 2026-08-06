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

describe('Online payment intent lifecycle migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260805200000_online_payment_intent_lifecycle/migration.sql',
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

  it('quarantines all legacy history and preserves duplicate provider evidence for review', async () => {
    const { client } = await isolatedSchema();
    await client.query(`
      INSERT INTO "Customer" (id, phone)
      VALUES ('customer-1', '+996700000001'), ('deleted-customer', 'deleted:deleted-customer')
    `);
    await client.query(`INSERT INTO "Order" (id, "customerId") VALUES ('deleted-order', 'deleted-customer')`);
    await client.query(`
      INSERT INTO "OnlinePaymentIntentCommand"
        (id, "idempotencyKey", "customerId", "orderId", method, amount, response, "updatedAt")
      VALUES
        ('unknown', 'key-unknown', 'customer-1', 'order-1', 'card', 1000, NULL, NOW()),
        ('known', 'key-known', 'customer-1', 'order-2', 'qr_mbank', 2000,
         '{"provider":"sandbox","intentId":"intent-1","txnId":"txn-1"}'::jsonb, NOW()),
        ('known-duplicate', 'key-known-duplicate', 'customer-1', 'order-3', 'qr_mbank', 2000,
         '{"provider":"sandbox","intentId":"intent-1","txnId":"txn-1"}'::jsonb, NOW()),
        ('deleted-known', 'key-deleted', 'web_checkout', 'deleted-order', 'card', 3000,
         '{"provider":"card","intentId":"intent-deleted","txnId":"txn-deleted","paymentUrl":"https://secret"}'::jsonb, NOW())
    `);

    await client.query(sql);

    const rows = await client.query<{
      id: string;
      status: string;
      providerIdempotencyKey: string;
      requestHash: string;
      providerIntentId: string | null;
      attempts: number;
    }>(`
      SELECT id, status, "providerIdempotencyKey", "requestHash", "providerIntentId", attempts
      FROM "OnlinePaymentIntentCommand"
      ORDER BY id
    `);
    expect(rows.rows).toEqual([
      {
        id: 'deleted-known',
        status: 'cancel_pending',
        providerIdempotencyKey: 'legacy:deleted-known',
        requestHash: 'legacy-columns-v1:deleted-known',
        providerIntentId: 'intent-deleted',
        attempts: 1,
      },
      {
        id: 'known',
        status: 'manual_review',
        providerIdempotencyKey: 'legacy:known',
        requestHash: 'legacy-columns-v1:known',
        providerIntentId: 'intent-1',
        attempts: 1,
      },
      {
        id: 'known-duplicate',
        status: 'manual_review',
        providerIdempotencyKey: 'legacy:known-duplicate',
        requestHash: 'legacy-columns-v1:known-duplicate',
        providerIntentId: 'intent-1',
        attempts: 1,
      },
      {
        id: 'unknown',
        status: 'creation_unknown',
        providerIdempotencyKey: 'legacy:unknown',
        requestHash: 'legacy-columns-v1:unknown',
        providerIntentId: null,
        attempts: 0,
      },
    ]);
    const deleted = await client.query<{ response: unknown; hasActionUrl: boolean }>(`
      SELECT response, ("providerResult" ? 'paymentUrl') AS "hasActionUrl"
      FROM "OnlinePaymentIntentCommand"
      WHERE id = 'deleted-known'
    `);
    expect(deleted.rows).toEqual([{ response: null, hasActionUrl: false }]);
    await client.end();
  });

  it('enforces money, claim and provider-evidence invariants', async () => {
    const { client } = await isolatedSchema();
    await client.query(sql);

    const base = `
      INSERT INTO "OnlinePaymentIntentCommand"
        (id, "idempotencyKey", "providerIdempotencyKey", "requestHash", "customerId",
         "orderId", method, amount, "gatewayMode", status, "updatedAt")
    `;
    await expect(client.query(`${base} VALUES
      ('bad-amount', 'key-1', 'provider-key-1', 'hash-1', 'customer-1',
       'order-1', 'card', 0, 'sandbox', 'queued', NOW())`))
      .rejects.toMatchObject({ code: '23514' });
    await expect(client.query(`${base} VALUES
      ('bad-claim', 'key-2', 'provider-key-2', 'hash-2', 'customer-1',
       'order-1', 'card', 1000, 'sandbox', 'creating', NOW())
      RETURNING id`)).rejects.toMatchObject({ code: '23514' });
    await expect(client.query(`${base} VALUES
      ('bad-evidence', 'key-3', 'provider-key-3', 'hash-3', 'customer-1',
       'order-1', 'card', 1000, 'sandbox', 'requires_action', NOW())`))
      .rejects.toMatchObject({ code: '23514' });

    const evidenceInsert = `
      INSERT INTO "OnlinePaymentIntentCommand"
        (id, "idempotencyKey", "providerIdempotencyKey", "requestHash", "customerId",
         "orderId", method, amount, "gatewayMode", status, "updatedAt",
         "providerName", "providerIntentId", "providerTxnId", "providerResult",
         "providerResultHash", "providerResultAt", attempts, "dispatchedAt", response)
    `;
    await client.query(`${evidenceInsert}
      VALUES ('good-evidence', 'key-4', 'provider-key-4', 'hash-4', 'customer-1',
       'order-1', 'card', 1000, 'sandbox', 'requires_action', NOW(),
       'card', 'intent-live', 'txn-live', '{"intentId":"intent-live"}'::jsonb,
       'sha256:example', NOW(), 1, NOW(), '{"intentId":"intent-live"}'::jsonb)`);
    await expect(client.query(`${evidenceInsert}
      VALUES ('duplicate-evidence', 'key-5', 'provider-key-5', 'hash-5', 'customer-1',
       'order-2', 'card', 1000, 'sandbox', 'requires_action', NOW(),
       'card', 'intent-live', 'txn-other', '{"intentId":"intent-live"}'::jsonb,
       'sha256:other', NOW(), 1, NOW(), '{"intentId":"intent-live"}'::jsonb)`))
      .rejects.toMatchObject({ code: '23505' });
    await expect(client.query(`
      UPDATE "OnlinePaymentIntentCommand"
      SET "providerIntentId" = 'overwritten'
      WHERE id = 'good-evidence'
    `)).rejects.toThrow(/request and provider evidence are immutable/);
    await expect(client.query(`
      UPDATE "OnlinePaymentIntentCommand"
      SET amount = 2000
      WHERE id = 'good-evidence'
    `)).rejects.toThrow(/request and provider evidence are immutable/);
    await expect(client.query(`
      UPDATE "OnlinePaymentIntentCommand"
      SET response = '{"intentId":"rewritten"}'::jsonb
      WHERE id = 'good-evidence'
    `)).rejects.toThrow(/request and provider evidence are immutable/);
    await client.end();
  });

  it('refuses invalid historical rows before constraints are installed', async () => {
    const { client } = await isolatedSchema();
    await client.query(`
      INSERT INTO "OnlinePaymentIntentCommand"
        (id, "idempotencyKey", "customerId", "orderId", method, amount, response, "updatedAt")
      VALUES ('invalid', 'key-invalid', 'customer-1', 'order-1', 'card', 0,
        NULL, NOW())
    `);

    await expect(client.query(sql)).rejects.toThrow(
      /Cannot install online payment intent lifecycle constraints: 1 invalid row/,
    );
    await client.query('ROLLBACK');
    const columns = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'OnlinePaymentIntentCommand'
        AND column_name = 'providerIdempotencyKey'
    `);
    expect(columns.rows).toEqual([{ count: '0' }]);
    const types = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = current_schema()
        AND t.typname = 'OnlinePaymentIntentCommandStatus'
    `);
    expect(types.rows).toEqual([{ count: '0' }]);
    await client.query(`UPDATE "OnlinePaymentIntentCommand" SET amount = 1 WHERE id = 'invalid'`);
    await expect(client.query(sql)).resolves.toBeDefined();
    await client.end();
  });

  async function isolatedSchema(): Promise<{ client: DbClient; schema: string }> {
    const client = await connectedClient();
    const schema = `payment_intent_migration_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    schemas.push(schema);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`CREATE TYPE "PaymentMethod" AS ENUM ('card', 'qr_mbank')`);
    await client.query(`CREATE TABLE "Customer" (id TEXT PRIMARY KEY, phone TEXT NOT NULL)`);
    await client.query(`CREATE TABLE "Order" (id TEXT PRIMARY KEY, "customerId" TEXT NOT NULL)`);
    await client.query(`
      CREATE TABLE "OnlinePaymentIntentCommand" (
        id TEXT PRIMARY KEY,
        "idempotencyKey" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        method "PaymentMethod" NOT NULL,
        amount INTEGER NOT NULL,
        "returnUrl" TEXT,
        response JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      )
    `);
    await client.query(`CREATE UNIQUE INDEX "OnlinePaymentIntentCommand_idempotencyKey_key"
      ON "OnlinePaymentIntentCommand"("idempotencyKey")`);
    await client.query(`CREATE INDEX "OnlinePaymentIntentCommand_customerId_createdAt_idx"
      ON "OnlinePaymentIntentCommand"("customerId", "createdAt")`);
    await client.query(`CREATE INDEX "OnlinePaymentIntentCommand_orderId_idx"
      ON "OnlinePaymentIntentCommand"("orderId")`);
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
