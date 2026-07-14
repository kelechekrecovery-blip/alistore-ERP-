ALTER TABLE "CourierRun"
  ADD COLUMN "handoverIdempotencyKey" TEXT,
  ADD COLUMN "handoverAmount" INTEGER,
  ADD COLUMN "handoverReason" TEXT;

CREATE UNIQUE INDEX "CourierRun_handoverIdempotencyKey_key"
  ON "CourierRun"("handoverIdempotencyKey");
