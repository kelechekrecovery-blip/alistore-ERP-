ALTER TABLE "Order" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Order_isDemo_createdAt_idx" ON "Order"("isDemo", "createdAt");
