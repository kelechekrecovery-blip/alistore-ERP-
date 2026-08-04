ALTER TABLE "SupportTicket" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Return" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "SupportTicket_idempotencyKey_key" ON "SupportTicket"("idempotencyKey");
CREATE UNIQUE INDEX "Return_idempotencyKey_key" ON "Return"("idempotencyKey");
