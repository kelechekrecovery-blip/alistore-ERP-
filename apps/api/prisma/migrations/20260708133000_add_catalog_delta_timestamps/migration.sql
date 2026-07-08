ALTER TABLE "Product"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "DeviceUnit"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt");
CREATE INDEX "DeviceUnit_updatedAt_idx" ON "DeviceUnit"("updatedAt");
