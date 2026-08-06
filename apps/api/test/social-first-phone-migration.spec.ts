import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('social-first customer phone migration contract', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260807090000_social_first_customer_phone/migration.sql'),
    'utf8',
  );

  it('is additive, preserves uniqueness, and backfills only live historical phones', () => {
    expect(sql).toContain('ALTER COLUMN "phone" DROP NOT NULL');
    expect(sql).toContain('ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3)');
    expect(sql).toContain('SET "phoneVerifiedAt" = "createdAt"');
    expect(sql).toContain('"phone" IS NOT NULL');
    expect(sql).toContain('"phone" NOT LIKE \'deleted:%\'');
    expect(sql).not.toMatch(/DROP\s+(?:INDEX|CONSTRAINT).*phone/iu);
    expect(sql).not.toMatch(/synthetic|\+999/iu);
  });
});
