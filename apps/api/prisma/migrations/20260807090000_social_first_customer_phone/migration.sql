-- Expand first: social-first customers may exist before they attach a phone.
-- PostgreSQL UNIQUE indexes permit multiple NULL values, while preserving the
-- one-customer-per-canonical-phone invariant for attached phones.
ALTER TABLE "Customer"
  ALTER COLUMN "phone" DROP NOT NULL,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Every pre-existing live phone remains trusted exactly as it was before this
-- migration. Deleted tombstones are deliberately not marked verified.
UPDATE "Customer"
SET "phoneVerifiedAt" = "createdAt"
WHERE "phone" IS NOT NULL
  AND "phone" NOT LIKE 'deleted:%';
