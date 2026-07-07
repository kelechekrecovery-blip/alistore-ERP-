-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('open', 'settled', 'written_off');

-- CreateTable
CREATE TABLE "DebtPlan" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtPlan_customerId_idx" ON "DebtPlan"("customerId");

-- CreateIndex
CREATE INDEX "DebtPlan_status_idx" ON "DebtPlan"("status");

-- CreateIndex
CREATE INDEX "DebtPlan_orderId_idx" ON "DebtPlan"("orderId");
