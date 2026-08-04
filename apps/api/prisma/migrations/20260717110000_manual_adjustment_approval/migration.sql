ALTER TABLE "Approval"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "sourceRef" TEXT;

CREATE UNIQUE INDEX "Approval_idempotencyKey_key" ON "Approval"("idempotencyKey");
CREATE UNIQUE INDEX "Approval_sourceRef_key" ON "Approval"("sourceRef");
