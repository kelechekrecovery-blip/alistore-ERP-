ALTER TABLE "StaffUser"
  ADD COLUMN "point" TEXT NOT NULL DEFAULT 'BISHKEK-1';

ALTER TABLE "ServiceWorkOrder"
  ADD COLUMN "point" TEXT;

UPDATE "ServiceWorkOrder" AS work_order
SET "point" = COALESCE(
  (
    SELECT shift."point"
    FROM "CashShift" AS shift
    WHERE shift."staffId" = work_order."createdBy"
      AND shift."openedAt" <= work_order."createdAt"
      AND (shift."closedAt" IS NULL OR shift."closedAt" >= work_order."createdAt")
    ORDER BY shift."openedAt" DESC
    LIMIT 1
  ),
  (
    SELECT schedule."point"
    FROM "HrSchedule" AS schedule
    WHERE schedule."staffId" = work_order."createdBy"
      AND schedule."shiftDate" = work_order."createdAt"::date
      AND schedule."cancelledAt" IS NULL
    ORDER BY schedule."startsAt" DESC
    LIMIT 1
  ),
  staff."point",
  'BISHKEK-1'
)
FROM "StaffUser" AS staff
WHERE staff."id" = work_order."createdBy";

UPDATE "ServiceWorkOrder"
SET "point" = 'BISHKEK-1'
WHERE "point" IS NULL;

ALTER TABLE "ServiceWorkOrder"
  ALTER COLUMN "point" SET NOT NULL;

ALTER TABLE "Payment"
  ADD COLUMN "originalPaymentId" TEXT;

UPDATE "Payment" AS refund
SET "originalPaymentId" = event."payload"->>'originalPaymentId'
FROM "AuditEvent" AS event
WHERE event."type" = 'payment.refunded'
  AND event."payload"->>'refundId' = refund."id"
  AND event."payload"->>'originalPaymentId' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Payment" AS original
    WHERE original."id" = event."payload"->>'originalPaymentId'
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_originalPaymentId_fkey"
  FOREIGN KEY ("originalPaymentId") REFERENCES "Payment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Payment_originalPaymentId_idx" ON "Payment"("originalPaymentId");
CREATE INDEX "ServiceWorkOrder_point_createdAt_idx" ON "ServiceWorkOrder"("point", "createdAt");
