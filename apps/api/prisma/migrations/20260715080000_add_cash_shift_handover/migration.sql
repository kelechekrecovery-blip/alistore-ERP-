CREATE TABLE "CashShiftHandover" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fromShiftId" TEXT NOT NULL,
  "toShiftId" TEXT NOT NULL,
  "fromStaffId" TEXT NOT NULL,
  "toStaffId" TEXT NOT NULL,
  "point" TEXT NOT NULL,
  "expectedCash" INTEGER NOT NULL,
  "countedCash" INTEGER NOT NULL,
  "diff" INTEGER NOT NULL,
  "reason" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashShiftHandover_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashShiftHandover_idempotencyKey_key" ON "CashShiftHandover"("idempotencyKey");
CREATE UNIQUE INDEX "CashShiftHandover_fromShiftId_key" ON "CashShiftHandover"("fromShiftId");
CREATE UNIQUE INDEX "CashShiftHandover_toShiftId_key" ON "CashShiftHandover"("toShiftId");
CREATE INDEX "CashShiftHandover_point_createdAt_idx" ON "CashShiftHandover"("point", "createdAt");
CREATE INDEX "CashShiftHandover_toStaffId_createdAt_idx" ON "CashShiftHandover"("toStaffId", "createdAt");
