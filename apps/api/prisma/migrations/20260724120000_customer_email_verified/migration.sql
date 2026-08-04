-- First-class record of email verification. Email is only ever set by the OTP
-- attach flow (auth.service.confirmEmailAttach), which already proves ownership,
-- so this timestamp makes that verification explicit and auditable rather than
-- implied. Backfill: every existing email was set through the verified attach
-- flow, so stamp it as verified at migration time.

ALTER TABLE "Customer" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "Customer" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "email" IS NOT NULL;
