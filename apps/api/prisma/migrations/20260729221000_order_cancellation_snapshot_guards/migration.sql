-- Creation-time policy/amount facts never follow mutable Order/Product/PO data.
-- Once an owner decision is captured, its financial/evidence snapshot is also
-- immutable; the refund saga may still advance status/completedAt.
CREATE FUNCTION protect_order_cancellation_snapshots() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
    OR NEW."customerIdSnapshot" IS DISTINCT FROM OLD."customerIdSnapshot"
    OR NEW."policySnapshot" IS DISTINCT FROM OLD."policySnapshot"
    OR NEW."purchaseOrderSentSnapshot" IS DISTINCT FROM OLD."purchaseOrderSentSnapshot"
    OR NEW."depositPaidSnapshot" IS DISTINCT FROM OLD."depositPaidSnapshot"
    OR NEW."requestedRefundAmount" IS DISTINCT FROM OLD."requestedRefundAmount"
    OR NEW."customerReason" IS DISTINCT FROM OLD."customerReason"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'order cancellation creation snapshot is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."resolutionAction" IS NOT NULL AND (
    NEW."resolutionAction" IS DISTINCT FROM OLD."resolutionAction"
    OR NEW."resolutionIdempotencyKey" IS DISTINCT FROM OLD."resolutionIdempotencyKey"
    OR NEW."resolutionRequestHash" IS DISTINCT FROM OLD."resolutionRequestHash"
    OR NEW."approvedRefundAmount" IS DISTINCT FROM OLD."approvedRefundAmount"
    OR NEW."supplierExpenseAmount" IS DISTINCT FROM OLD."supplierExpenseAmount"
    OR NEW."faultParty" IS DISTINCT FROM OLD."faultParty"
    OR NEW."ownerReason" IS DISTINCT FROM OLD."ownerReason"
    OR NEW."evidence" IS DISTINCT FROM OLD."evidence"
    OR NEW."resolvedBy" IS DISTINCT FROM OLD."resolvedBy"
    OR NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt"
    OR NEW."refundId" IS DISTINCT FROM OLD."refundId"
  ) THEN
    RAISE EXCEPTION 'order cancellation owner resolution snapshot is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderCancellation_snapshot_immutable"
  BEFORE UPDATE ON "OrderCancellation"
  FOR EACH ROW
  EXECUTE FUNCTION protect_order_cancellation_snapshots();
