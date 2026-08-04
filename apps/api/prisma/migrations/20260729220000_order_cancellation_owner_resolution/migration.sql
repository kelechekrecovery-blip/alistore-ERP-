-- Post-PO cancellation decisions are immutable, independently idempotent
-- material actions. Existing cancellation rows remain valid with NULL fields.
CREATE TYPE "OrderCancellationResolutionAction" AS ENUM (
  'approve_full',
  'approve_partial',
  'reject'
);

ALTER TABLE "OrderCancellation"
  ADD COLUMN "resolutionAction" "OrderCancellationResolutionAction",
  ADD COLUMN "resolutionIdempotencyKey" TEXT,
  ADD COLUMN "resolutionRequestHash" TEXT;

CREATE UNIQUE INDEX "OrderCancellation_resolutionIdempotencyKey_key"
  ON "OrderCancellation"("resolutionIdempotencyKey");

ALTER TABLE "OrderCancellation"
  ADD CONSTRAINT "OrderCancellation_resolution_snapshot_check"
  CHECK (
    (
      "resolutionAction" IS NULL
      AND "resolutionIdempotencyKey" IS NULL
      AND "resolutionRequestHash" IS NULL
    )
    OR (
      "resolutionAction" IS NOT NULL
      AND "resolutionIdempotencyKey" IS NOT NULL
      AND length("resolutionIdempotencyKey") BETWEEN 1 AND 128
      AND "resolutionRequestHash" IS NOT NULL
      AND length("resolutionRequestHash") = 64
      AND "resolvedBy" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
      AND "ownerReason" IS NOT NULL
      AND length(btrim("ownerReason")) BETWEEN 3 AND 500
    )
  ),
  ADD CONSTRAINT "OrderCancellation_resolution_amount_check"
  CHECK (
    "approvedRefundAmount" IS NULL
    OR (
      "approvedRefundAmount" >= 0
      AND "approvedRefundAmount" <= "depositPaidSnapshot"
    )
  ),
  ADD CONSTRAINT "OrderCancellation_supplier_expense_check"
  CHECK (
    "supplierExpenseAmount" >= 0
    AND "supplierExpenseAmount" <= "depositPaidSnapshot"
  ),
  ADD CONSTRAINT "OrderCancellation_resolution_action_check"
  CHECK (
    "resolutionAction" IS NULL
    OR (
      "resolutionAction" = 'reject'
      AND "status" = 'rejected'
      AND "approvedRefundAmount" IS NULL
      AND "supplierExpenseAmount" = 0
      AND "faultParty" IS NULL
      AND "refundId" IS NULL
      AND "completedAt" IS NOT NULL
    )
    OR (
      "resolutionAction" = 'approve_full'
      AND "approvedRefundAmount" = "depositPaidSnapshot"
      AND "supplierExpenseAmount" = 0
      AND "faultParty" IS NOT NULL
      AND (
        ("approvedRefundAmount" = 0 AND "refundId" IS NULL)
        OR ("approvedRefundAmount" > 0 AND "refundId" IS NOT NULL)
      )
    )
    OR (
      "resolutionAction" = 'approve_partial'
      AND "faultParty" = 'customer'
      AND "supplierExpenseAmount" > 0
      AND "approvedRefundAmount" > 0
      AND "approvedRefundAmount" < "depositPaidSnapshot"
      AND "approvedRefundAmount" = "depositPaidSnapshot" - "supplierExpenseAmount"
      AND "refundId" IS NOT NULL
      AND jsonb_typeof("evidence") = 'array'
      AND jsonb_array_length("evidence") > 0
    )
  ),
  ADD CONSTRAINT "OrderCancellation_resolution_fault_policy_check"
  CHECK (
    "resolutionAction" IS NULL
    OR "faultParty" IS NULL
    OR "faultParty" = 'customer'
    OR (
      "resolutionAction" = 'approve_full'
      AND "approvedRefundAmount" = "depositPaidSnapshot"
      AND "supplierExpenseAmount" = 0
    )
  );

-- The previous refund invariant intentionally admitted only the automatic
-- pre-PO policy. Extend that exact predicate for owner-approved post-PO
-- refunds while retaining every other proven allocation/accounting check.
DO $migration$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('validate_refund_consistency(text)'::regprocedure)
    INTO function_definition;
  updated_definition := replace(
    function_definition,
    'AND cancellation."policySnapshot" = ''automatic_full''',
    'AND cancellation."policySnapshot" IN (''automatic_full'', ''owner_resolution'')'
  );
  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'validate_refund_consistency policy predicate was not found';
  END IF;
  EXECUTE updated_definition;
END
$migration$;
