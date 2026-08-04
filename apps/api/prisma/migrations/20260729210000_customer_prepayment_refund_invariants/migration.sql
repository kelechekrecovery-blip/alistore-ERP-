-- Keep the proven return-sale validator intact and route the new refund purpose
-- through a dedicated set of invariants. This is forward-only: no applied
-- migration is rewritten.
ALTER FUNCTION validate_refund_consistency(TEXT)
  RENAME TO validate_return_refund_consistency;

CREATE FUNCTION validate_refund_consistency(target_refund_id TEXT) RETURNS VOID AS $$
DECLARE
  refund_row "Refund"%ROWTYPE;
  allocation_count INTEGER;
  allocation_total BIGINT;
  original_payment RECORD;
BEGIN
  SELECT * INTO refund_row
  FROM "Refund"
  WHERE "id" = target_refund_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF refund_row."purpose" = 'return_sale' THEN
    PERFORM validate_return_refund_consistency(target_refund_id);
    RETURN;
  END IF;

  IF refund_row."purpose" <> 'customer_prepayment' THEN
    RAISE EXCEPTION 'refund % has unsupported purpose', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF refund_row."returnId" IS NOT NULL THEN
    RAISE EXCEPTION 'customer prepayment refund % must not reference a return', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "OrderCancellation" cancellation
    WHERE cancellation."refundId" = refund_row."id"
      AND cancellation."orderId" = refund_row."orderId"
      AND cancellation."approvedRefundAmount" = refund_row."amount"
      AND cancellation."policySnapshot" = 'automatic_full'
  ) THEN
    RAISE EXCEPTION 'customer prepayment refund % cancellation/order/amount mismatch', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*), COALESCE(SUM("amount"), 0)
  INTO allocation_count, allocation_total
  FROM "RefundAllocation"
  WHERE "refundId" = target_refund_id;

  IF allocation_count = 0 OR allocation_total <> refund_row."amount" THEN
    RAISE EXCEPTION 'refund % allocation total mismatch', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "RefundLine" WHERE "refundId" = target_refund_id
  ) THEN
    RAISE EXCEPTION 'customer prepayment refund % must not contain return lines', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" = 'succeeded' AND (
    refund_row."completedAt" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "RefundAllocation"
      WHERE "refundId" = target_refund_id
        AND "status" <> 'succeeded'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM "OrderCancellation"
      WHERE "refundId" = target_refund_id
        AND "status" = 'refunded'
        AND "completedAt" IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'customer prepayment refund % is not fully completed', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" <> 'succeeded' AND refund_row."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'unfinished refund % cannot have completedAt', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundAllocation" allocation
    JOIN "Payment" payment ON payment."id" = allocation."originalPaymentId"
    WHERE allocation."refundId" = target_refund_id
      AND (
        payment."orderId" IS DISTINCT FROM refund_row."orderId"
        OR payment."amount" <= 0
        OR allocation."methodSnapshot" IS DISTINCT FROM payment."method"
        OR (allocation."methodSnapshot" = 'cash' AND allocation."shiftId" IS NULL)
        OR (allocation."methodSnapshot" <> 'cash' AND allocation."shiftId" IS NOT NULL)
        OR (allocation."methodSnapshot" = 'gift_card' AND payment."giftCardId" IS NULL)
      )
  ) THEN
    RAISE EXCEPTION 'refund % contains invalid original payment', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundAllocation" allocation
    LEFT JOIN "Payment" refund_payment ON refund_payment."id" = allocation."refundPaymentId"
    WHERE allocation."refundId" = target_refund_id
      AND (
        (allocation."status" = 'succeeded' AND (
          allocation."refundPaymentId" IS NULL
          OR allocation."accountingEntryId" IS NULL
          OR refund_payment."amount" IS DISTINCT FROM -allocation."amount"
          OR refund_payment."method" IS DISTINCT FROM allocation."methodSnapshot"
          OR refund_payment."orderId" IS DISTINCT FROM refund_row."orderId"
          OR refund_payment."originalPaymentId" IS DISTINCT FROM allocation."originalPaymentId"
          OR refund_payment."shiftId" IS DISTINCT FROM allocation."shiftId"
          OR refund_payment."accountingEntryId" IS DISTINCT FROM allocation."accountingEntryId"
        ))
        OR (allocation."status" <> 'succeeded' AND (
          allocation."refundPaymentId" IS NOT NULL
          OR allocation."accountingEntryId" IS NOT NULL
        ))
      )
  ) THEN
    RAISE EXCEPTION 'refund % contains invalid execution provenance', target_refund_id
      USING ERRCODE = '23514';
  END IF;

  FOR original_payment IN
    SELECT DISTINCT "originalPaymentId"
    FROM "RefundAllocation"
    WHERE "refundId" = target_refund_id
  LOOP
    PERFORM validate_refund_capacity(original_payment."originalPaymentId");
  END LOOP;
END;
$$ LANGUAGE plpgsql;
