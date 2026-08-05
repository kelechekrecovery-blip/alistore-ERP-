ALTER TABLE "Customer"
  ADD COLUMN "guestCreateKeyHash" TEXT,
  ADD COLUMN "guestCreateRequestHash" TEXT,
  ADD COLUMN "guestCreateExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Customer_guestCreateKeyHash_key"
  ON "Customer"("guestCreateKeyHash");
