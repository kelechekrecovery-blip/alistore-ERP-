-- Add nullable TOTP enrollment fields for staff step-up approval.
ALTER TABLE "StaffUser" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
