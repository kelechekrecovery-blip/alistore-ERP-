CREATE TYPE "PromotionStatus" AS ENUM ('draft', 'active', 'paused');
CREATE TYPE "PromotionDiscountType" AS ENUM ('fixed', 'percent');

CREATE TABLE "PromotionCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "PromotionStatus" NOT NULL DEFAULT 'draft',
  "discountType" "PromotionDiscountType" NOT NULL,
  "discountValue" INTEGER NOT NULL,
  "maxDiscount" INTEGER,
  "minimumSubtotal" INTEGER NOT NULL DEFAULT 0,
  "eligibleProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "eligibleCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "totalLimit" INTEGER,
  "perCustomerLimit" INTEGER,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromotionCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionRedemption" (
  "id" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "discountAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionCode_code_key" ON "PromotionCode"("code");
CREATE INDEX "PromotionCode_status_startsAt_endsAt_idx" ON "PromotionCode"("status", "startsAt", "endsAt");
CREATE INDEX "PromotionCode_createdAt_idx" ON "PromotionCode"("createdAt");
CREATE UNIQUE INDEX "PromotionRedemption_orderId_key" ON "PromotionRedemption"("orderId");
CREATE INDEX "PromotionRedemption_promotionId_createdAt_idx" ON "PromotionRedemption"("promotionId", "createdAt");
CREATE INDEX "PromotionRedemption_promotionId_customerId_createdAt_idx" ON "PromotionRedemption"("promotionId", "customerId", "createdAt");

ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "PromotionCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
