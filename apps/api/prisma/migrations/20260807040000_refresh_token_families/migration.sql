-- Bound replay and late-logout revocation to one rotation family. Historical
-- tokens are revoked once during rollout; new logins then receive exact family
-- lineage and cannot revoke a later recovery or separate device login.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- The database default is required during rolling deploys: the previous API
-- binary does not know familyId but remains live while preDeployCommand runs.
-- Hold ACCESS EXCLUSIVE across both statements: Prisma does not wrap PostgreSQL
-- migration files automatically, and an old writer must never observe the
-- nullable column before its compatibility default exists.
BEGIN;
ALTER TABLE "RefreshToken"
ADD COLUMN "familyId" TEXT;
ALTER TABLE "RefreshToken"
ALTER COLUMN "familyId" SET DEFAULT ('legacy:' || gen_random_uuid()::text);
COMMIT;

-- One pass both establishes marked legacy roots and invalidates their
-- ambiguous lineage. New mixed-version inserts already receive the DB default.
UPDATE "RefreshToken"
SET "familyId" = COALESCE("familyId", 'legacy:' || id),
    "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
    "rotatedAt" = NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- Staff access-token revocation epoch. Old API binaries ignore the column;
-- new binaries treat missing JWT claims as version zero for rolling
-- compatibility, while every security-sensitive mutation increments it.
ALTER TABLE "StaffUser"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Serialize refresh-token insertion from the previous deployment revision
-- with account deletion. The old binary does not take customer-auth advisory
-- locks, so the database row lock is the compatibility boundary: either the
-- insert commits first and deletion's later token UPDATE sees it, or deletion
-- commits first and the insert fails against the tombstone.
CREATE OR REPLACE FUNCTION "enforce_active_customer_refresh_token"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  customer_phone TEXT;
BEGIN
  IF NEW."customerId" LIKE 'staff:%' THEN
    RETURN NEW;
  END IF;

  SELECT "phone"
  INTO customer_phone
  FROM "Customer"
  WHERE id = NEW."customerId"
  FOR UPDATE;

  IF NOT FOUND OR customer_phone LIKE 'deleted:%' THEN
    RAISE EXCEPTION 'refresh token customer is missing or deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "RefreshToken_active_customer_insert"
BEFORE INSERT ON "RefreshToken"
FOR EACH ROW
EXECUTE FUNCTION "enforce_active_customer_refresh_token"();

-- The previous binary revokes every live token for a customer when any old
-- token is replayed. Once exact families exist, that would let an old request
-- kill a newer recovery/device session. New code explicitly opts in before an
-- intentional scoped/account-wide revocation. Old normal customer rotation is
-- still allowed because it changes rotatedAt together with revokedAt; unsafe
-- broad UPDATEs (and old staff rotation of a new-family token) fail closed.
CREATE OR REPLACE FUNCTION "enforce_scoped_refresh_revocation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."revokedAt" IS NULL
     AND NEW."revokedAt" IS NOT NULL
     AND OLD."familyId" NOT LIKE 'legacy:%'
     AND NEW."rotatedAt" IS NOT DISTINCT FROM OLD."rotatedAt"
     AND COALESCE(current_setting('alistore.allow_refresh_revocation', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'unscoped refresh token revocation blocked during mixed-version rollout'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "RefreshToken_scoped_revocation"
BEFORE UPDATE OF "revokedAt" ON "RefreshToken"
FOR EACH ROW
EXECUTE FUNCTION "enforce_scoped_refresh_revocation"();

-- Keep the existing customerId index for the old binary and account-wide
-- revocation. The composite index is built concurrently by postdeploy-indexes.

RESET statement_timeout;
RESET lock_timeout;
