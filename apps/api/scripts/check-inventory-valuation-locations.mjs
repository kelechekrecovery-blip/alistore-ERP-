import pg from 'pg';

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required');

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "InventoryValuationIssue"
       WHERE "location" IS NULL OR btrim("location") = '' OR btrim("location") = 'UNKNOWN')::int AS "unknownIssueLocations",
      (SELECT COUNT(*) FROM "InventoryValuationReversal"
       WHERE "location" IS NULL OR btrim("location") = '' OR btrim("location") = 'UNKNOWN')::int AS "unknownReversalLocations";
  `);
  const row = result.rows[0];
  const unknownIssueLocations = Number(row?.unknownIssueLocations ?? 0);
  const unknownReversalLocations = Number(row?.unknownReversalLocations ?? 0);
  const report = { unknownIssueLocations, unknownReversalLocations };
  console.log(`Inventory valuation location preflight: ${JSON.stringify(report)}`);
  if (unknownIssueLocations > 0 || unknownReversalLocations > 0) {
    throw new Error('Inventory valuation location preflight blocked: resolve NULL/empty/UNKNOWN locations before contract deployment');
  }
} finally {
  await client.end().catch(() => undefined);
}
