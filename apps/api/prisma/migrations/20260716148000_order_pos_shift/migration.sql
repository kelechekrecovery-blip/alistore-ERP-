ALTER TABLE "Order"
ADD COLUMN "posShiftId" TEXT;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_posShiftId_fkey"
FOREIGN KEY ("posShiftId") REFERENCES "CashShift"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Order_posShiftId_idx" ON "Order"("posShiftId");
