ALTER TABLE "TradeInDevice" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "TradeInDevice_idempotencyKey_key" ON "TradeInDevice"("idempotencyKey");
