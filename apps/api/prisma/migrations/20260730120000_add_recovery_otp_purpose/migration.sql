-- Recovery codes are intentionally distinct from login codes. Existing rows
-- remain `login`; only newly requested recovery challenges use this value.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'recovery';

-- Old released clients were allowed to send either `996...` or `+996...`, and
-- the old service persisted the input verbatim. Refuse to guess if both forms
-- already exist for one identity: merging Customer rows also requires merging
-- their business relations and must be handled deliberately before deployment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Customer"
    WHERE phone ~ '^\+?[1-9][0-9]{8,14}$'
    GROUP BY CASE WHEN phone LIKE '+%' THEN phone ELSE '+' || phone END
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot canonicalize Customer.phone: +/non-+ identity collision exists';
  END IF;
END
$$;

UPDATE "Customer"
SET phone = '+' || phone
WHERE phone ~ '^[1-9][0-9]{8,14}$';

-- OTP challenges have no phone uniqueness constraint, so all historical SMS
-- rows can be normalized directly without merging or dropping audit state.
UPDATE "OtpChallenge"
SET phone = '+' || phone
WHERE phone ~ '^[1-9][0-9]{8,14}$';

-- EXPAND/SWITCH CONTRACT: the migration is additive and production keeps
-- AUTH_RECOVERY_OTP_ENABLED=false while the previous API revision drains.
-- The compatibility build accepts both canonical and legacy no-plus login
-- challenges, so an old writer cannot strand a valid SMS proof after backfill.
-- Recovery rows are written only after operators enable the flag on the fully
-- drained new revision. Existing SMS proofs are invalidated once at the schema
-- boundary; clients request a fresh challenge.
UPDATE "OtpChallenge"
SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
WHERE channel::text = 'sms'
  AND "consumedAt" IS NULL;

-- Keep the customer invariant true during a rolling deploy too: an older process may
-- still attempt to persist a no-plus Customer after this migration finishes.
-- Challenges deliberately have no canonical uniqueness constraint because a
-- customer can request multiple codes; the new runtime temporarily accepts
-- both canonical forms while old writers drain.
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phone_canonical_key"
ON "Customer" (
  (CASE WHEN phone LIKE '+%' THEN phone ELSE '+' || phone END)
)
WHERE phone ~ '^\+?[1-9][0-9]{8,14}$';
