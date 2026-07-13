ALTER TABLE "Order"
  ADD COLUMN "courierId" TEXT,
  ADD COLUMN "courierRunId" TEXT;

ALTER TABLE "CourierRun"
  ADD COLUMN "collectedTotal" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CourierCommand" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "courierId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourierCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourierCommand_idempotencyKey_key" ON "CourierCommand"("idempotencyKey");
CREATE INDEX "CourierCommand_courierId_createdAt_idx" ON "CourierCommand"("courierId", "createdAt");
CREATE INDEX "CourierCommand_orderId_createdAt_idx" ON "CourierCommand"("orderId", "createdAt");
CREATE INDEX "Order_courierId_status_idx" ON "Order"("courierId", "status");
CREATE INDEX "Order_courierRunId_idx" ON "Order"("courierRunId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey"
  FOREIGN KEY ("courierId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_courierRunId_fkey"
  FOREIGN KEY ("courierRunId") REFERENCES "CourierRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
