ALTER TABLE "Payment"
  ADD COLUMN "serviceWorkOrderId" TEXT;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_serviceWorkOrderId_fkey"
  FOREIGN KEY ("serviceWorkOrderId") REFERENCES "ServiceWorkOrder"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_at_most_one_business_target_check"
  CHECK (num_nonnulls("orderId", "serviceWorkOrderId") <= 1);

CREATE INDEX "Payment_serviceWorkOrderId_idx" ON "Payment"("serviceWorkOrderId");
