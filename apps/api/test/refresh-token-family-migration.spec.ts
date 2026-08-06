import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('refresh token family migration contract', () => {
  const sql = readFileSync(join(
    __dirname,
    '../prisma/migrations/20260807040000_refresh_token_families/migration.sql',
  ), 'utf8');

  it('backfills an exact non-null family key and replaces the lookup index', () => {
    expect(sql).toContain("DEFAULT ('legacy:' || gen_random_uuid()::text)");
    expect(sql).toMatch(/BEGIN;[\s\S]*ADD COLUMN "familyId" TEXT;[\s\S]*SET DEFAULT[\s\S]*COMMIT;/);
    expect(sql).toContain('ALTER COLUMN "familyId" SET DEFAULT');
    expect(sql).toContain('"familyId" = COALESCE("familyId", \'legacy:\' || id)');
    expect(sql).toContain('ALTER COLUMN "familyId" SET NOT NULL');
    expect(sql).toContain('postdeploy-indexes');
  });

  it('revokes ambiguous legacy sessions instead of pretending to know their lineage', () => {
    expect(sql).toContain('"revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)');
    expect(sql).toContain('"rotatedAt" = NULL');
  });

  it('serializes old-writer inserts with deletion and adds staff access revocation state', () => {
    expect(sql).toContain('ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('enforce_active_customer_refresh_token');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('RefreshToken_active_customer_insert');
    expect(sql).toContain('RefreshToken_scoped_revocation');
    expect(sql).toContain('alistore.allow_refresh_revocation');
  });
});
