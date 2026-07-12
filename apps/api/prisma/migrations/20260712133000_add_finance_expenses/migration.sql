CREATE TYPE "ExpenseStatus" AS ENUM ('submitted', 'approved', 'rejected', 'paid');

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "point" TEXT,
    "supplierId" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'submitted',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "rejectionNote" TEXT,
    "paidBy" TEXT,
    "paymentKey" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expense_idempotencyKey_key" ON "Expense"("idempotencyKey");
CREATE UNIQUE INDEX "Expense_paymentKey_key" ON "Expense"("paymentKey");
CREATE INDEX "Expense_status_createdAt_idx" ON "Expense"("status", "createdAt");
CREATE INDEX "Expense_category_incurredAt_idx" ON "Expense"("category", "incurredAt");
CREATE INDEX "Expense_supplierId_idx" ON "Expense"("supplierId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
