CREATE TYPE "HrPayrollStatus" AS ENUM ('posted', 'paid');

CREATE TABLE "HrPayrollRun" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "status" "HrPayrollStatus" NOT NULL DEFAULT 'posted',
    "baseAmount" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "latePenaltyPerMinute" INTEGER NOT NULL,
    "overtimePayPerMinute" INTEGER NOT NULL,
    "totalBase" INTEGER NOT NULL,
    "totalCommission" INTEGER NOT NULL,
    "totalAdjustments" INTEGER NOT NULL,
    "totalPayout" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrPayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrPayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "plannedShifts" INTEGER NOT NULL,
    "completedShifts" INTEGER NOT NULL,
    "paidAbsenceShifts" INTEGER NOT NULL,
    "workedMinutes" INTEGER NOT NULL,
    "lateMinutes" INTEGER NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL,
    "revenue" INTEGER NOT NULL,
    "sales" INTEGER NOT NULL,
    "baseEarned" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "lateDeduction" INTEGER NOT NULL,
    "overtimePay" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrPayrollLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrPayrollCommand" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "runId" TEXT,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrPayrollCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrPayrollRun_period_point_key" ON "HrPayrollRun"("period", "point");
CREATE INDEX "HrPayrollRun_status_createdAt_idx" ON "HrPayrollRun"("status", "createdAt");
CREATE UNIQUE INDEX "HrPayrollLine_runId_staffId_key" ON "HrPayrollLine"("runId", "staffId");
CREATE INDEX "HrPayrollLine_staffId_createdAt_idx" ON "HrPayrollLine"("staffId", "createdAt");
CREATE UNIQUE INDEX "HrPayrollCommand_idempotencyKey_key" ON "HrPayrollCommand"("idempotencyKey");
CREATE INDEX "HrPayrollCommand_runId_createdAt_idx" ON "HrPayrollCommand"("runId", "createdAt");
ALTER TABLE "HrPayrollLine" ADD CONSTRAINT "HrPayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HrPayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrPayrollLine" ADD CONSTRAINT "HrPayrollLine_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
