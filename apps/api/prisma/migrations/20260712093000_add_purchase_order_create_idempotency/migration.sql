ALTER TABLE "PurchaseOrder" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "PurchaseOrder_idempotencyKey_key" ON "PurchaseOrder"("idempotencyKey");
