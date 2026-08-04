ALTER TABLE "Order"
  ADD COLUMN "fulfillmentType" TEXT NOT NULL DEFAULT 'pickup',
  ADD COLUMN "pickupPoint" TEXT,
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "deliverySlot" TEXT,
  ADD COLUMN "pickupCode" TEXT;

CREATE UNIQUE INDEX "Order_pickupCode_key" ON "Order"("pickupCode");
CREATE INDEX "Order_fulfillmentType_status_idx" ON "Order"("fulfillmentType", "status");
CREATE INDEX "Order_pickupPoint_status_idx" ON "Order"("pickupPoint", "status");
