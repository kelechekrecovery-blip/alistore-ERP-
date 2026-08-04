CREATE TABLE "ProductBundleComponent" (
  "id" TEXT NOT NULL,
  "bundleProductId" TEXT NOT NULL,
  "componentProductId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  CONSTRAINT "ProductBundleComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderBundleAllocation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "bundleSku" TEXT NOT NULL,
  "componentProductId" TEXT NOT NULL,
  "componentSku" TEXT NOT NULL,
  "imei" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderBundleAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductBundleComponent_bundleProductId_componentProductId_key"
ON "ProductBundleComponent"("bundleProductId", "componentProductId");
CREATE INDEX "ProductBundleComponent_componentProductId_idx"
ON "ProductBundleComponent"("componentProductId");
CREATE UNIQUE INDEX "OrderBundleAllocation_imei_key" ON "OrderBundleAllocation"("imei");
CREATE INDEX "OrderBundleAllocation_orderId_idx" ON "OrderBundleAllocation"("orderId");
CREATE INDEX "OrderBundleAllocation_orderItemId_idx" ON "OrderBundleAllocation"("orderItemId");
CREATE INDEX "OrderBundleAllocation_componentProductId_idx" ON "OrderBundleAllocation"("componentProductId");

ALTER TABLE "ProductBundleComponent"
ADD CONSTRAINT "ProductBundleComponent_bundleProductId_fkey"
FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent"
ADD CONSTRAINT "ProductBundleComponent_componentProductId_fkey"
FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderBundleAllocation"
ADD CONSTRAINT "OrderBundleAllocation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderBundleAllocation"
ADD CONSTRAINT "OrderBundleAllocation_componentProductId_fkey"
FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
