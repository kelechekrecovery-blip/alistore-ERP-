CREATE TABLE "CustomerAddress" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "comment" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPreferences" (
  "customerId" TEXT NOT NULL,
  "push" BOOLEAN NOT NULL DEFAULT true,
  "whatsapp" BOOLEAN NOT NULL DEFAULT true,
  "service" BOOLEAN NOT NULL DEFAULT true,
  "promos" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerPreferences_pkey" PRIMARY KEY ("customerId")
);

CREATE TABLE "LoyaltyEntry" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "sourceRef" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerCoupon" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "valueLabel" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCoupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAddress_idempotencyKey_key" ON "CustomerAddress"("idempotencyKey");
CREATE INDEX "CustomerAddress_customerId_isPrimary_idx" ON "CustomerAddress"("customerId", "isPrimary");
CREATE UNIQUE INDEX "LoyaltyEntry_sourceRef_key" ON "LoyaltyEntry"("sourceRef");
CREATE INDEX "LoyaltyEntry_customerId_createdAt_idx" ON "LoyaltyEntry"("customerId", "createdAt");
CREATE UNIQUE INDEX "CustomerCoupon_customerId_code_key" ON "CustomerCoupon"("customerId", "code");
CREATE INDEX "CustomerCoupon_customerId_active_idx" ON "CustomerCoupon"("customerId", "active");

ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPreferences" ADD CONSTRAINT "CustomerPreferences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
