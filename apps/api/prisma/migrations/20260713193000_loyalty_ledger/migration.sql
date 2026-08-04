ALTER TABLE "LoyaltyEntry"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'adjustment',
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "paymentId" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promoCode" TEXT,
  ADD COLUMN "promoDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyRedeemed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyEarned" INTEGER NOT NULL DEFAULT 0;

UPDATE "Order" SET "subtotal" = "total" WHERE "subtotal" = 0;

CREATE INDEX "LoyaltyEntry_orderId_idx" ON "LoyaltyEntry"("orderId");
CREATE INDEX "LoyaltyEntry_paymentId_idx" ON "LoyaltyEntry"("paymentId");
