CREATE TYPE "ProtectionStatus" AS ENUM ('requested', 'reviewing', 'offered', 'active', 'rejected', 'cancelled');

CREATE TABLE "DeviceProtectionPolicy" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "imei" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "planType" TEXT NOT NULL,
  "status" "ProtectionStatus" NOT NULL DEFAULT 'requested',
  "deviceValue" INTEGER NOT NULL,
  "premium" INTEGER,
  "coverageMonths" INTEGER NOT NULL,
  "staffNote" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceProtectionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceProtectionPolicy_customerId_createdAt_idx" ON "DeviceProtectionPolicy"("customerId", "createdAt");
CREATE INDEX "DeviceProtectionPolicy_status_createdAt_idx" ON "DeviceProtectionPolicy"("status", "createdAt");
CREATE INDEX "DeviceProtectionPolicy_imei_idx" ON "DeviceProtectionPolicy"("imei");
