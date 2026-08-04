CREATE TABLE "WarrantyOpenCommand" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "warrantyCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyOpenCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarrantyOpenCommand_idempotencyKey_key" ON "WarrantyOpenCommand"("idempotencyKey");
CREATE INDEX "WarrantyOpenCommand_customerId_createdAt_idx" ON "WarrantyOpenCommand"("customerId", "createdAt");
CREATE INDEX "WarrantyOpenCommand_imei_idx" ON "WarrantyOpenCommand"("imei");
