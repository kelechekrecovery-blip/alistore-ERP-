-- DropIndex
DROP INDEX "AuditEvent_refs_idx";

-- CreateIndex
CREATE INDEX "AuditEvent_refs_idx" ON "AuditEvent" USING GIN ("refs");

-- CreateIndex
CREATE INDEX "CashShift_staffId_closedAt_idx" ON "CashShift"("staffId", "closedAt");

-- CreateIndex
CREATE INDEX "CashShift_diff_closedAt_idx" ON "CashShift"("diff", "closedAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
