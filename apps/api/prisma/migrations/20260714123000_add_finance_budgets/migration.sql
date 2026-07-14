CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "point" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceBudgetCommand" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "budgetId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBudgetCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceBudget_period_category_point_key" ON "FinanceBudget"("period", "category", "point");
CREATE INDEX "FinanceBudget_period_point_idx" ON "FinanceBudget"("period", "point");
CREATE UNIQUE INDEX "FinanceBudgetCommand_idempotencyKey_key" ON "FinanceBudgetCommand"("idempotencyKey");
CREATE INDEX "FinanceBudgetCommand_period_point_createdAt_idx" ON "FinanceBudgetCommand"("period", "point", "createdAt");
CREATE INDEX "FinanceBudgetCommand_budgetId_idx" ON "FinanceBudgetCommand"("budgetId");
