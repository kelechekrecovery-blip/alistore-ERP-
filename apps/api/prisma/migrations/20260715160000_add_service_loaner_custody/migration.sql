ALTER TYPE "UnitStatus" ADD VALUE 'loaner_available';
ALTER TYPE "UnitStatus" ADD VALUE 'loaner_issued';

CREATE TYPE "LoanerLoanStatus" AS ENUM ('prepared', 'issued', 'overdue', 'returned', 'disputed', 'cancelled');

CREATE TABLE "LoanerDevice" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "condition" TEXT NOT NULL,
    "registeredBy" TEXT NOT NULL,
    "registrationIdempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoanerDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanerLoan" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "LoanerLoanStatus" NOT NULL DEFAULT 'prepared',
    "issueCondition" TEXT NOT NULL,
    "returnCondition" TEXT,
    "damageNote" TEXT,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "agreementRef" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "preparedBy" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "returnedBy" TEXT,
    "returnedAt" TIMESTAMP(3),
    "overdueEscalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoanerLoan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoanerLoan_deposit_nonnegative" CHECK ("depositAmount" >= 0),
    CONSTRAINT "LoanerLoan_return_after_issue" CHECK ("returnedAt" IS NULL OR "issuedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "LoanerDevice_unitId_key" ON "LoanerDevice"("unitId");
CREATE UNIQUE INDEX "LoanerDevice_registrationIdempotencyKey_key" ON "LoanerDevice"("registrationIdempotencyKey");
CREATE INDEX "LoanerDevice_active_createdAt_idx" ON "LoanerDevice"("active", "createdAt");
CREATE INDEX "LoanerLoan_deviceId_status_idx" ON "LoanerLoan"("deviceId", "status");
CREATE INDEX "LoanerLoan_workOrderId_status_idx" ON "LoanerLoan"("workOrderId", "status");
CREATE INDEX "LoanerLoan_customerId_createdAt_idx" ON "LoanerLoan"("customerId", "createdAt");
CREATE INDEX "LoanerLoan_status_dueAt_idx" ON "LoanerLoan"("status", "dueAt");
CREATE UNIQUE INDEX "LoanerLoan_active_device_key" ON "LoanerLoan"("deviceId") WHERE "status" IN ('prepared', 'issued', 'overdue');
CREATE UNIQUE INDEX "LoanerLoan_active_work_order_key" ON "LoanerLoan"("workOrderId") WHERE "status" IN ('prepared', 'issued', 'overdue');

ALTER TABLE "LoanerDevice" ADD CONSTRAINT "LoanerDevice_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DeviceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoanerLoan" ADD CONSTRAINT "LoanerLoan_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "LoanerDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoanerLoan" ADD CONSTRAINT "LoanerLoan_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "ServiceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
