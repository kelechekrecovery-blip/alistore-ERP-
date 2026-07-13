ALTER TABLE "CashShift"
  ADD COLUMN "closeReason" TEXT,
  ADD COLUMN "openIdempotencyKey" TEXT,
  ADD COLUMN "closeIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "CashShift_openIdempotencyKey_key"
  ON "CashShift"("openIdempotencyKey");

CREATE UNIQUE INDEX "CashShift_closeIdempotencyKey_key"
  ON "CashShift"("closeIdempotencyKey");
