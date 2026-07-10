CREATE TYPE "B2BQuoteStatus" AS ENUM ('requested', 'reviewing', 'quoted', 'accepted', 'rejected');

CREATE TABLE "BusinessBuyerProfile" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT,
  "billingAddress" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessBuyerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2BQuote" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "B2BQuoteStatus" NOT NULL DEFAULT 'requested',
  "paymentIntent" TEXT NOT NULL DEFAULT 'invoice',
  "fulfillmentType" TEXT NOT NULL DEFAULT 'delivery',
  "deliveryAddress" TEXT,
  "pickupPoint" TEXT,
  "comment" TEXT,
  "staffNote" TEXT,
  "listTotal" INTEGER NOT NULL,
  "quotedTotal" INTEGER,
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2BQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2BQuoteItem" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "listPrice" INTEGER NOT NULL,
  "targetPrice" INTEGER,
  CONSTRAINT "B2BQuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessBuyerProfile_customerId_key" ON "BusinessBuyerProfile"("customerId");
CREATE INDEX "BusinessBuyerProfile_companyName_idx" ON "BusinessBuyerProfile"("companyName");
CREATE INDEX "B2BQuote_customerId_createdAt_idx" ON "B2BQuote"("customerId", "createdAt");
CREATE INDEX "B2BQuote_status_createdAt_idx" ON "B2BQuote"("status", "createdAt");
CREATE INDEX "B2BQuoteItem_quoteId_idx" ON "B2BQuoteItem"("quoteId");
CREATE INDEX "B2BQuoteItem_sku_idx" ON "B2BQuoteItem"("sku");

ALTER TABLE "B2BQuoteItem"
  ADD CONSTRAINT "B2BQuoteItem_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "B2BQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
