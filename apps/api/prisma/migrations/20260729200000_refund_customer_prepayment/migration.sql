CREATE TYPE "RefundPurpose" AS ENUM (
  'return_sale',
  'customer_prepayment'
);

ALTER TABLE "Refund"
  ADD COLUMN "purpose" "RefundPurpose" NOT NULL DEFAULT 'return_sale';

ALTER TABLE "Refund"
  ALTER COLUMN "returnId" DROP NOT NULL;

ALTER TABLE "OrderCancellation"
  ADD CONSTRAINT "OrderCancellation_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_source_check"
  CHECK (
    ("purpose" = 'return_sale' AND "returnId" IS NOT NULL)
    OR ("purpose" = 'customer_prepayment' AND "returnId" IS NULL)
  );
