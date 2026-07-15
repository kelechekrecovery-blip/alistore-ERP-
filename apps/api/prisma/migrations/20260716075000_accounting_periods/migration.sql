-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('open', 'soft_closed', 'hard_closed');

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'open',
    "lastCloseIdempotencyKey" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_period_key" ON "AccountingPeriod"("period");
CREATE UNIQUE INDEX "AccountingPeriod_lastCloseIdempotencyKey_key" ON "AccountingPeriod"("lastCloseIdempotencyKey");
CREATE INDEX "AccountingPeriod_status_period_idx" ON "AccountingPeriod"("status", "period");
