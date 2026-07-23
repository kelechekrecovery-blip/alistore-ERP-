-- Persist the actual settlement channel so accounting and cash reconciliation
-- cannot infer a bank transfer from an opaque payment key.
ALTER TABLE "ConsignmentPayout"
ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash';
