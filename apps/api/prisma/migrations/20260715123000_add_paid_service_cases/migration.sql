CREATE TYPE "ServiceCaseType" AS ENUM ('warranty', 'paid');

ALTER TABLE "WarrantyCase"
  ADD COLUMN "serviceType" "ServiceCaseType" NOT NULL DEFAULT 'warranty',
  ADD COLUMN "deviceName" TEXT;

CREATE INDEX "WarrantyCase_serviceType_status_idx" ON "WarrantyCase"("serviceType", "status");
