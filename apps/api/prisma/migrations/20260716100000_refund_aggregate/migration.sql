BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE "RefundStatus" AS ENUM ('requested', 'approved', 'processing', 'partially_succeeded', 'succeeded', 'failed', 'rejected');
CREATE TYPE "RefundAllocationStatus" AS ENUM ('queued', 'processing', 'provider_pending', 'succeeded', 'failed');
CREATE TYPE "GiftCardTransactionType" AS ENUM ('redemption', 'refund');

ALTER TABLE "Payment" ADD COLUMN "giftCardId" TEXT;

-- Keep the old application writable during expand/contract deployment while
-- deriving provenance only from an authoritative key or original payment.
CREATE FUNCTION link_payment_gift_card() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."method" <> 'gift_card' OR NEW."giftCardId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."amount" < 0 AND NEW."originalPaymentId" IS NOT NULL THEN
    SELECT original."giftCardId" INTO NEW."giftCardId"
    FROM "Payment" original
    WHERE original."id" = NEW."originalPaymentId"
      AND original."method" = 'gift_card';
  ELSE
    SELECT card."id" INTO NEW."giftCardId"
    FROM "GiftCard" card
    WHERE NEW."orderId" IS NOT NULL
      AND (
        NEW."txnId" = 'giftcard:' || card."code" || ':' || NEW."orderId"
        OR NEW."idempotencyKey" = 'giftcard:' || card."code" || ':' || NEW."orderId"
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payment_link_gift_card_trigger"
BEFORE INSERT OR UPDATE OF "method", "amount", "giftCardId", "originalPaymentId", "txnId", "idempotencyKey", "orderId" ON "Payment"
FOR EACH ROW EXECUTE FUNCTION link_payment_gift_card();

-- Legacy gift-card payments encoded the normalized card code in txnId/idempotencyKey.
-- Recover that provenance before the FK is installed so existing tenders remain refundable.
UPDATE "Payment" AS payment
SET "giftCardId" = card."id"
FROM "GiftCard" AS card
WHERE payment."method" = 'gift_card'
  AND payment."giftCardId" IS NULL
  AND payment."orderId" IS NOT NULL
  AND (
    payment."txnId" = 'giftcard:' || card."code" || ':' || payment."orderId"
    OR payment."idempotencyKey" = 'giftcard:' || card."code" || ':' || payment."orderId"
  );

-- Recover custom legacy payment provenance only when the immutable redemption
-- event and the payment candidate are both unique for order+amount.
UPDATE "Payment" AS payment
SET "giftCardId" = candidate."giftCardId"
FROM (
  SELECT target."id" AS "paymentId", MIN(card."id") AS "giftCardId"
  FROM "Payment" target
  JOIN "AuditEvent" event
    ON event."type" = 'giftcard.redeemed'
   AND event."payload"->>'orderId' = target."orderId"
   AND event."payload"->>'amount' ~ '^[0-9]+$'
   AND (event."payload"->>'amount')::INTEGER = target."amount"
  JOIN "GiftCard" card ON card."id" = event."payload"->>'giftCardId'
  WHERE target."method" = 'gift_card'
    AND target."amount" > 0
    AND target."giftCardId" IS NULL
    AND (
      SELECT COUNT(*)
      FROM "Payment" peer
      WHERE peer."method" = 'gift_card'
        AND peer."amount" = target."amount"
        AND peer."orderId" = target."orderId"
        AND peer."giftCardId" IS NULL
    ) = 1
  GROUP BY target."id"
  HAVING COUNT(DISTINCT event."payload"->>'giftCardId') = 1
) candidate
WHERE payment."id" = candidate."paymentId";

-- Legacy negative payments inherit immutable tender provenance from the
-- original payment after positive payments have been reconciled.
UPDATE "Payment" AS refund_payment
SET "giftCardId" = original."giftCardId"
FROM "Payment" AS original
WHERE refund_payment."method" = 'gift_card'
  AND refund_payment."amount" < 0
  AND refund_payment."giftCardId" IS NULL
  AND refund_payment."originalPaymentId" = original."id"
  AND original."method" = 'gift_card'
  AND original."giftCardId" IS NOT NULL;

-- Unresolved custom legacy rows remain visible for manual reconciliation. Do
-- not guess, and do not break old writers during the expand release.

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "approvalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "requester" TEXT NOT NULL,
    "approver" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundAllocation" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "originalPaymentId" TEXT NOT NULL,
    "refundPaymentId" TEXT,
    "shiftId" TEXT,
    "accountingEntryId" TEXT,
    "amount" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "methodSnapshot" "PaymentMethod" NOT NULL,
    "status" "RefundAllocationStatus" NOT NULL DEFAULT 'queued',
    "providerRefundId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RefundAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundLine" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "taxBaseAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "revenueAmount" INTEGER NOT NULL,
    "taxCode" TEXT NOT NULL,
    "taxRateBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefundLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "paymentId" TEXT,
    "refundAllocationId" TEXT,
    "type" "GiftCardTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftCardTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_ordinal_nonnegative" CHECK ("ordinal" >= 0);
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_attempts_nonnegative" CHECK ("attempts" >= 0);
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_values_valid" CHECK (
  "qty" > 0 AND "grossAmount" >= 0 AND "taxBaseAmount" >= 0 AND
  "taxAmount" >= 0 AND "revenueAmount" >= 0 AND
  "taxBaseAmount" + "taxAmount" = "grossAmount" AND
  "revenueAmount" = "taxBaseAmount" AND
  "taxRateBps" >= 0 AND "taxRateBps" <= 10000
);
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_balance_nonnegative" CHECK ("balanceAfter" >= 0);
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balances_nonnegative" CHECK ("initialBalance" >= 0 AND "balance" >= 0);
-- Payment provenance remains in expand phase for rolling compatibility. The
-- application writes giftCardId explicitly; a later contract migration may
-- enforce NOT NULL semantics only after old writers are drained and reconciled.
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_source_valid" CHECK (
  ("type" = 'redemption' AND "paymentId" IS NOT NULL AND "refundAllocationId" IS NULL AND "amount" < 0)
  OR
  ("type" = 'refund' AND "paymentId" IS NOT NULL AND "amount" > 0)
) NOT VALID;

CREATE UNIQUE INDEX "Refund_returnId_key" ON "Refund"("returnId");
CREATE UNIQUE INDEX "Refund_approvalId_key" ON "Refund"("approvalId");
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");
CREATE INDEX "Refund_status_updatedAt_idx" ON "Refund"("status", "updatedAt");

CREATE UNIQUE INDEX "RefundAllocation_refundPaymentId_key" ON "RefundAllocation"("refundPaymentId");
CREATE UNIQUE INDEX "RefundAllocation_accountingEntryId_key" ON "RefundAllocation"("accountingEntryId");
CREATE UNIQUE INDEX "RefundAllocation_providerRefundId_key" ON "RefundAllocation"("providerRefundId");
CREATE UNIQUE INDEX "RefundAllocation_refundId_originalPaymentId_key" ON "RefundAllocation"("refundId", "originalPaymentId");
CREATE UNIQUE INDEX "RefundAllocation_refundId_ordinal_key" ON "RefundAllocation"("refundId", "ordinal");
CREATE INDEX "RefundAllocation_originalPaymentId_idx" ON "RefundAllocation"("originalPaymentId");
CREATE INDEX "RefundAllocation_shiftId_idx" ON "RefundAllocation"("shiftId");
CREATE INDEX "RefundAllocation_status_nextAttemptAt_idx" ON "RefundAllocation"("status", "nextAttemptAt");
CREATE INDEX "RefundAllocation_status_lockedAt_idx" ON "RefundAllocation"("status", "lockedAt");

CREATE UNIQUE INDEX "RefundLine_refundId_returnItemId_key" ON "RefundLine"("refundId", "returnItemId");
CREATE INDEX "RefundLine_returnItemId_idx" ON "RefundLine"("returnItemId");

CREATE INDEX "Payment_giftCardId_idx" ON "Payment"("giftCardId");
CREATE UNIQUE INDEX "GiftCardTransaction_paymentId_key" ON "GiftCardTransaction"("paymentId");
CREATE UNIQUE INDEX "GiftCardTransaction_refundAllocationId_key" ON "GiftCardTransaction"("refundAllocationId");
CREATE UNIQUE INDEX "GiftCardTransaction_sourceRef_key" ON "GiftCardTransaction"("sourceRef");
CREATE INDEX "GiftCardTransaction_giftCardId_createdAt_idx" ON "GiftCardTransaction"("giftCardId", "createdAt");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_originalPaymentId_fkey" FOREIGN KEY ("originalPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_refundPaymentId_fkey" FOREIGN KEY ("refundPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_refundAllocationId_fkey" FOREIGN KEY ("refundAllocationId") REFERENCES "RefundAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  unresolved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM "Payment" payment
  LEFT JOIN "GiftCard" card ON card."id" = payment."giftCardId"
  WHERE payment."method" = 'gift_card'
    AND (payment."giftCardId" IS NULL OR card."id" IS NULL);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'gift-card reconciliation required for % legacy payment(s)', unresolved_count USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO "GiftCardTransaction" (
  "id", "giftCardId", "paymentId", "type", "amount", "balanceAfter", "sourceRef", "actor", "createdAt"
)
SELECT
  'legacy-' || md5(payment."id"),
  payment."giftCardId",
  payment."id",
  CASE WHEN payment."amount" > 0 THEN 'redemption'::"GiftCardTransactionType" ELSE 'refund'::"GiftCardTransactionType" END,
  -payment."amount",
  card."initialBalance" + SUM(-payment."amount") OVER (
    PARTITION BY payment."giftCardId" ORDER BY payment."createdAt", payment."id" ROWS UNBOUNDED PRECEDING
  ),
  'giftcard:legacy-payment:' || payment."id",
  COALESCE(payment."receivedBy", 'system:migration'),
  payment."createdAt"
FROM "Payment" payment
JOIN "GiftCard" card ON card."id" = payment."giftCardId"
WHERE payment."method" = 'gift_card';

DO $$
DECLARE
  mismatched_cards TEXT;
BEGIN
  SELECT STRING_AGG(card."id", ', ' ORDER BY card."id") INTO mismatched_cards
  FROM "GiftCard" card
  WHERE card."balance" <> card."initialBalance" + (
    SELECT COALESCE(SUM(entry."amount"), 0)
    FROM "GiftCardTransaction" entry
    WHERE entry."giftCardId" = card."id"
  );
  IF mismatched_cards IS NOT NULL THEN
    RAISE EXCEPTION 'gift-card balance reconciliation required for card(s): %', mismatched_cards USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION validate_refund_capacity(target_payment_id TEXT) RETURNS VOID AS $$
DECLARE
  original_amount INTEGER;
  reserved_amount BIGINT;
  legacy_amount BIGINT;
BEGIN
  SELECT "amount" INTO original_amount FROM "Payment" WHERE "id" = target_payment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(allocation."amount"), 0)
  INTO reserved_amount
  FROM "RefundAllocation" allocation
  JOIN "Refund" refund ON refund."id" = allocation."refundId"
  WHERE allocation."originalPaymentId" = target_payment_id
    AND (refund."status" <> 'rejected' OR allocation."refundPaymentId" IS NOT NULL);

  SELECT COALESCE(-SUM(payment."amount"), 0)
  INTO legacy_amount
  FROM "Payment" payment
  LEFT JOIN "RefundAllocation" allocation ON allocation."refundPaymentId" = payment."id"
  WHERE payment."originalPaymentId" = target_payment_id
    AND payment."amount" < 0
    AND allocation."id" IS NULL;

  IF reserved_amount + legacy_amount > 0
     AND reserved_amount + legacy_amount > original_amount THEN
    RAISE EXCEPTION 'refunds exceed original payment % capacity', target_payment_id USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION expected_refund_line_tax(target_line_id TEXT) RETURNS INTEGER AS $$
DECLARE
  line_row "RefundLine"%ROWTYPE;
  item_row "ReturnItem"%ROWTYPE;
  order_item_row "OrderItem"%ROWTYPE;
  previous_qty INTEGER;
  legacy_qty INTEGER;
  item_gross BIGINT;
  before_gross BIGINT;
  after_gross BIGINT;
  before_tax BIGINT;
  after_tax BIGINT;
  posted_order_tax BIGINT;
  preceding_refund_tax BIGINT;
  remaining_order_tax BIGINT;
  item_tax BIGINT;
BEGIN
  SELECT * INTO line_row FROM "RefundLine" WHERE "id" = target_line_id;
  SELECT * INTO item_row FROM "ReturnItem" WHERE "id" = line_row."returnItemId";
  SELECT * INTO order_item_row FROM "OrderItem" WHERE "id" = item_row."orderItemId";

  SELECT COALESCE(SUM(previous_line."qty"), 0) INTO previous_qty
  FROM "RefundLine" previous_line
  JOIN "Refund" previous_refund ON previous_refund."id" = previous_line."refundId"
  JOIN "ReturnItem" previous_item ON previous_item."id" = previous_line."returnItemId"
  WHERE previous_item."orderItemId" = item_row."orderItemId"
    AND previous_refund."status" <> 'rejected'
    AND (previous_line."createdAt", previous_line."id") < (line_row."createdAt", line_row."id");

  SELECT COALESCE(SUM(legacy_item."qty"), 0) INTO legacy_qty
  FROM "ReturnItem" legacy_item
  JOIN "Return" legacy_return ON legacy_return."id" = legacy_item."returnId"
  WHERE legacy_item."orderItemId" = item_row."orderItemId"
    AND legacy_return."status" = 'paid'
    AND NOT EXISTS (
      SELECT 1 FROM "RefundLine" represented WHERE represented."returnItemId" = legacy_item."id"
    );

  previous_qty := previous_qty + legacy_qty;
  item_gross := order_item_row."price"::BIGINT * order_item_row."qty" - order_item_row."discountAmount";
  IF item_gross = 0 THEN RETURN 0; END IF;
  before_gross := item_gross * previous_qty / order_item_row."qty";
  IF previous_qty + line_row."qty" = order_item_row."qty" THEN
    after_gross := item_gross;
  ELSE
    after_gross := item_gross * (previous_qty + line_row."qty") / order_item_row."qty";
  END IF;
  before_tax := order_item_row."taxAmount"::BIGINT * before_gross / item_gross;
  IF after_gross = item_gross THEN
    after_tax := order_item_row."taxAmount";
  ELSE
    after_tax := order_item_row."taxAmount"::BIGINT * after_gross / item_gross;
  END IF;
  item_tax := after_tax - before_tax;

  SELECT COALESCE(SUM(entry."taxAmount"), 0)
  INTO posted_order_tax
  FROM "AccountingJournalEntry" entry
  JOIN "Payment" payment
    ON payment."id" = entry."sourceRef"
   AND entry."sourceType" = 'payment.refund'
  LEFT JOIN "RefundAllocation" allocation
    ON allocation."refundPaymentId" = payment."id"
  WHERE payment."orderId" = (
      SELECT refund."orderId" FROM "Refund" refund WHERE refund."id" = line_row."refundId"
    )
    AND payment."amount" < 0
    AND (allocation."refundId" IS NULL OR allocation."refundId" <> line_row."refundId");

  SELECT COALESCE(SUM(previous_line."taxAmount"), 0)
  INTO preceding_refund_tax
  FROM "RefundLine" previous_line
  JOIN "ReturnItem" previous_item ON previous_item."id" = previous_line."returnItemId"
  WHERE previous_line."refundId" = line_row."refundId"
    AND (previous_item."orderItemId", previous_item."id")
      < (item_row."orderItemId", item_row."id");

  SELECT GREATEST(refund_order."taxAmount"::BIGINT - posted_order_tax - preceding_refund_tax, 0)
  INTO remaining_order_tax
  FROM "Refund" refund
  JOIN "Order" refund_order ON refund_order."id" = refund."orderId"
  WHERE refund."id" = line_row."refundId";

  RETURN LEAST(item_tax, remaining_order_tax)::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE FUNCTION validate_refund_consistency(target_refund_id TEXT) RETURNS VOID AS $$
DECLARE
  refund_row "Refund"%ROWTYPE;
  original_payment RECORD;
  allocation_count INTEGER;
  allocation_total BIGINT;
  line_count INTEGER;
  line_total BIGINT;
BEGIN
  SELECT * INTO refund_row FROM "Refund" WHERE "id" = target_refund_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Return"
    WHERE "id" = refund_row."returnId"
      AND "orderId" = refund_row."orderId"
      AND "refundAmount" = refund_row."amount"
  ) THEN
    RAISE EXCEPTION 'refund % return/order/amount mismatch', target_refund_id USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*), COALESCE(SUM("amount"), 0)
  INTO allocation_count, allocation_total
  FROM "RefundAllocation"
  WHERE "refundId" = target_refund_id;

  IF allocation_count = 0 OR allocation_total <> refund_row."amount" THEN
    RAISE EXCEPTION 'refund % allocation total mismatch', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" = 'rejected' AND EXISTS (
    SELECT 1 FROM "RefundAllocation"
    WHERE "refundId" = target_refund_id
      AND ("refundPaymentId" IS NOT NULL OR "accountingEntryId" IS NOT NULL OR "status" = 'succeeded')
  ) THEN
    RAISE EXCEPTION 'executed refund % cannot be rejected', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" = 'rejected' AND NOT EXISTS (
    SELECT 1 FROM "Return"
    WHERE "id" = refund_row."returnId" AND "status" = 'rejected'
  ) THEN
    RAISE EXCEPTION 'rejected refund % requires a rejected return', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" <> 'rejected' AND EXISTS (
    SELECT 1 FROM "Return"
    WHERE "id" = refund_row."returnId" AND "status" = 'rejected'
  ) THEN
    RAISE EXCEPTION 'rejected return requires rejected refund %', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" = 'succeeded' AND (
    refund_row."completedAt" IS NULL
    OR EXISTS (
      SELECT 1 FROM "RefundAllocation"
      WHERE "refundId" = target_refund_id AND "status" <> 'succeeded'
    )
    OR NOT EXISTS (
      SELECT 1 FROM "Return"
      WHERE "id" = refund_row."returnId" AND "status" IN ('paid', 'reconciled')
    )
  ) THEN
    RAISE EXCEPTION 'succeeded refund % is not fully completed', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" <> 'succeeded' AND refund_row."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'unfinished refund % cannot have completedAt', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" <> 'succeeded' AND EXISTS (
    SELECT 1 FROM "Return"
    WHERE "id" = refund_row."returnId" AND "status" IN ('paid', 'reconciled')
  ) THEN
    RAISE EXCEPTION 'return for unfinished refund % cannot be completed', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" = 'partially_succeeded' AND NOT (
    EXISTS (
      SELECT 1 FROM "RefundAllocation"
      WHERE "refundId" = target_refund_id AND "status" = 'succeeded'
    )
    AND EXISTS (
      SELECT 1 FROM "RefundAllocation"
      WHERE "refundId" = target_refund_id AND "status" <> 'succeeded'
    )
  ) THEN
    RAISE EXCEPTION 'partially succeeded refund % has invalid allocation state', target_refund_id USING ERRCODE = '23514';
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
    RAISE EXCEPTION 'refund % contains invalid original payment', target_refund_id USING ERRCODE = '23514';
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
          OR (allocation."methodSnapshot" = 'gift_card' AND refund_payment."giftCardId" IS DISTINCT FROM (
            SELECT original."giftCardId" FROM "Payment" original WHERE original."id" = allocation."originalPaymentId"
          ))
        ))
        OR (allocation."status" <> 'succeeded' AND (
          allocation."refundPaymentId" IS NOT NULL OR allocation."accountingEntryId" IS NOT NULL
        ))
      )
  ) THEN
    RAISE EXCEPTION 'refund % contains invalid execution provenance', target_refund_id USING ERRCODE = '23514';
  END IF;

  FOR original_payment IN
    SELECT DISTINCT "originalPaymentId"
    FROM "RefundAllocation"
    WHERE "refundId" = target_refund_id
  LOOP
    PERFORM validate_refund_capacity(original_payment."originalPaymentId");
  END LOOP;

  SELECT COUNT(*), COALESCE(SUM("grossAmount"), 0)
  INTO line_count, line_total
  FROM "RefundLine"
  WHERE "refundId" = target_refund_id;

  IF line_count = 0 OR line_total <> refund_row."amount" THEN
    RAISE EXCEPTION 'refund % line total mismatch', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundLine" line
    JOIN "ReturnItem" item ON item."id" = line."returnItemId"
    JOIN "OrderItem" order_item ON order_item."id" = item."orderItemId"
    WHERE line."refundId" = target_refund_id
      AND (
        item."returnId" IS DISTINCT FROM refund_row."returnId"
        OR line."qty" IS DISTINCT FROM item."qty"
        OR line."grossAmount" IS DISTINCT FROM item."refundAmount"
        OR line."taxCode" IS DISTINCT FROM order_item."taxCode"
        OR line."taxRateBps" IS DISTINCT FROM order_item."taxRateBps"
      )
  ) THEN
    RAISE EXCEPTION 'refund % line does not exactly match its return item', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF refund_row."status" <> 'rejected' AND EXISTS (
    SELECT 1 FROM "RefundLine" line
    WHERE line."refundId" = target_refund_id
      AND line."taxAmount" IS DISTINCT FROM expected_refund_line_tax(line."id")
  ) THEN
    RAISE EXCEPTION 'refund % contains invalid tax snapshot', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ReturnItem" item
    WHERE item."returnId" = refund_row."returnId"
      AND NOT EXISTS (
        SELECT 1 FROM "RefundLine" line
        WHERE line."refundId" = target_refund_id
          AND line."returnItemId" = item."id"
      )
  ) THEN
    RAISE EXCEPTION 'refund % does not cover every return item', target_refund_id USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundLine" target_line
    JOIN "ReturnItem" target_item ON target_item."id" = target_line."returnItemId"
    JOIN "OrderItem" order_item ON order_item."id" = target_item."orderItemId"
    WHERE target_line."refundId" = target_refund_id
      AND (
        (
          SELECT COALESCE(SUM(other_line."qty"), 0)
          FROM "RefundLine" other_line
          JOIN "Refund" other_refund ON other_refund."id" = other_line."refundId"
          JOIN "ReturnItem" other_item ON other_item."id" = other_line."returnItemId"
          WHERE other_item."orderItemId" = target_item."orderItemId"
            AND other_refund."status" <> 'rejected'
        ) + (
          SELECT COALESCE(SUM(legacy_item."qty"), 0)
          FROM "ReturnItem" legacy_item
          JOIN "Return" legacy_return ON legacy_return."id" = legacy_item."returnId"
          WHERE legacy_item."orderItemId" = target_item."orderItemId"
            AND legacy_return."status" = 'paid'
            AND NOT EXISTS (
              SELECT 1 FROM "RefundLine" represented_line
              WHERE represented_line."returnItemId" = legacy_item."id"
            )
        ) > order_item."qty"
      )
  ) THEN
    RAISE EXCEPTION 'refund % exceeds return line capacity', target_refund_id USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_gift_card_balance(target_card_id TEXT) RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "GiftCard" card
    WHERE card."id" = target_card_id
      AND card."balance" <> card."initialBalance" + (
        SELECT COALESCE(SUM(entry."amount"), 0)
        FROM "GiftCardTransaction" entry
        WHERE entry."giftCardId" = card."id"
      )
  ) THEN
    RAISE EXCEPTION 'gift-card % balance does not match append-only journal', target_card_id USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GiftCardTransaction" entry
    JOIN "GiftCard" card ON card."id" = entry."giftCardId"
    WHERE entry."giftCardId" = target_card_id
      AND entry."balanceAfter" <> card."initialBalance" + (
        SELECT COALESCE(SUM(previous."amount"), 0)
        FROM "GiftCardTransaction" previous
        WHERE previous."giftCardId" = entry."giftCardId"
          AND (previous."createdAt", previous."id") <= (entry."createdAt", entry."id")
      )
  ) THEN
    RAISE EXCEPTION 'gift-card % journal contains invalid running balance', target_card_id USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_gift_card_transaction(target_transaction_id TEXT) RETURNS VOID AS $$
DECLARE
  transaction_row "GiftCardTransaction"%ROWTYPE;
BEGIN
  SELECT * INTO transaction_row FROM "GiftCardTransaction" WHERE "id" = target_transaction_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF transaction_row."type" = 'redemption' AND NOT EXISTS (
    SELECT 1 FROM "Payment" payment
    WHERE payment."id" = transaction_row."paymentId"
      AND payment."giftCardId" = transaction_row."giftCardId"
      AND payment."method" = 'gift_card'
      AND payment."amount" = -transaction_row."amount"
  ) THEN
    RAISE EXCEPTION 'gift-card transaction % has invalid redemption provenance', target_transaction_id USING ERRCODE = '23514';
  END IF;

  IF transaction_row."type" = 'refund' AND transaction_row."refundAllocationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "RefundAllocation" allocation
    JOIN "Payment" original ON original."id" = allocation."originalPaymentId"
    JOIN "Payment" refund_payment ON refund_payment."id" = allocation."refundPaymentId"
    WHERE allocation."id" = transaction_row."refundAllocationId"
      AND allocation."methodSnapshot" = 'gift_card'
      AND allocation."refundPaymentId" = transaction_row."paymentId"
      AND original."giftCardId" = transaction_row."giftCardId"
      AND refund_payment."giftCardId" = transaction_row."giftCardId"
      AND refund_payment."amount" = -transaction_row."amount"
      AND allocation."amount" = transaction_row."amount"
  ) THEN
    RAISE EXCEPTION 'gift-card transaction % has invalid refund allocation provenance', target_transaction_id USING ERRCODE = '23514';
  END IF;

  IF transaction_row."type" = 'refund' AND transaction_row."refundAllocationId" IS NULL AND NOT EXISTS (
    SELECT 1
    FROM "Payment" refund_payment
    JOIN "Payment" original ON original."id" = refund_payment."originalPaymentId"
    WHERE refund_payment."id" = transaction_row."paymentId"
      AND refund_payment."method" = 'gift_card'
      AND refund_payment."giftCardId" = transaction_row."giftCardId"
      AND original."giftCardId" = transaction_row."giftCardId"
      AND refund_payment."amount" = -transaction_row."amount"
  ) THEN
    RAISE EXCEPTION 'gift-card transaction % has invalid legacy refund provenance', target_transaction_id USING ERRCODE = '23514';
  END IF;

  IF transaction_row."type" = 'refund' AND transaction_row."refundAllocationId" IS NULL AND EXISTS (
    SELECT 1 FROM "RefundAllocation" allocation
    WHERE allocation."refundPaymentId" = transaction_row."paymentId"
  ) THEN
    RAISE EXCEPTION 'gift-card transaction % omits aggregate allocation provenance', target_transaction_id USING ERRCODE = '23514';
  END IF;

  PERFORM validate_gift_card_balance(transaction_row."giftCardId");
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_refund_row_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."id" IS DISTINCT FROM NEW."id" THEN
    PERFORM validate_refund_consistency(OLD."id");
  END IF;
  PERFORM validate_refund_consistency(COALESCE(NEW."id", OLD."id"));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_refund_child_trigger() RETURNS TRIGGER AS $$
DECLARE
  linked_transaction RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."refundId" IS DISTINCT FROM NEW."refundId" THEN
    PERFORM validate_refund_consistency(OLD."refundId");
  END IF;
  PERFORM validate_refund_consistency(COALESCE(NEW."refundId", OLD."refundId"));
  FOR linked_transaction IN
    SELECT "id" FROM "GiftCardTransaction"
    WHERE "refundAllocationId" = COALESCE(NEW."id", OLD."id")
  LOOP
    PERFORM validate_gift_card_transaction(linked_transaction."id");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_gift_card_transaction_trigger() RETURNS TRIGGER AS $$
BEGIN
  PERFORM validate_gift_card_transaction(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_gift_card_balance_trigger() RETURNS TRIGGER AS $$
BEGIN
  PERFORM validate_gift_card_balance(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_gift_card_initial_balance_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."initialBalance" IS DISTINCT FROM NEW."initialBalance" THEN
    RAISE EXCEPTION 'GiftCard initialBalance is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION journal_legacy_gift_card_payment() RETURNS TRIGGER AS $$
DECLARE
  resolved_card_id TEXT;
  card_balance INTEGER;
  journal_type "GiftCardTransactionType";
  journal_amount INTEGER;
BEGIN
  IF NEW."method" <> 'gift_card' OR NEW."amount" = 0 THEN
    RETURN NULL;
  END IF;

  resolved_card_id := NEW."giftCardId";
  IF resolved_card_id IS NULL AND NEW."orderId" IS NOT NULL AND (
    SELECT COUNT(*) FROM "Payment" candidate
    WHERE candidate."method" = 'gift_card'
      AND candidate."giftCardId" IS NULL
      AND candidate."orderId" = NEW."orderId"
      AND candidate."amount" = NEW."amount"
  ) = 1 THEN
    SELECT MIN(event."payload"->>'giftCardId')
    INTO resolved_card_id
    FROM "AuditEvent" event
    WHERE event."type" = 'giftcard.redeemed'
      AND event."payload"->>'orderId' = NEW."orderId"
      AND event."payload"->>'amount' ~ '^[0-9]+$'
      AND (event."payload"->>'amount')::INTEGER = NEW."amount"
    HAVING COUNT(*) = 1 AND COUNT(DISTINCT event."payload"->>'giftCardId') = 1;

    IF resolved_card_id IS NOT NULL THEN
      UPDATE "Payment" SET "giftCardId" = resolved_card_id
      WHERE "id" = NEW."id" AND "giftCardId" IS NULL;
    END IF;
  END IF;

  IF resolved_card_id IS NULL OR EXISTS (
    SELECT 1 FROM "GiftCardTransaction" WHERE "paymentId" = NEW."id"
  ) THEN
    RETURN NULL;
  END IF;

  SELECT "balance" INTO card_balance FROM "GiftCard" WHERE "id" = resolved_card_id FOR UPDATE;
  IF NEW."amount" < 0 THEN
    journal_type := 'refund';
    journal_amount := -NEW."amount";
    UPDATE "GiftCard"
    SET "balance" = "balance" + journal_amount,
        "status" = CASE WHEN "status" = 'redeemed' THEN 'active' ELSE "status" END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = resolved_card_id
    RETURNING "balance" INTO card_balance;
  ELSE
    journal_type := 'redemption';
    journal_amount := -NEW."amount";
  END IF;
  INSERT INTO "GiftCardTransaction" (
    "id", "giftCardId", "paymentId", "type", "amount", "balanceAfter", "sourceRef", "actor", "createdAt"
  ) VALUES (
    'legacy-' || md5(random()::TEXT || clock_timestamp()::TEXT || NEW."id"),
    resolved_card_id, NEW."id", journal_type, journal_amount, card_balance,
    'giftcard:legacy-payment:' || NEW."id", COALESCE(NEW."receivedBy", 'system:legacy-writer'), CURRENT_TIMESTAMP
  ) ON CONFLICT ("paymentId") DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_gift_card_transaction_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'GiftCardTransaction is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_refund_line_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'RefundLine is immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_payment_refund_capacity_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_original_id TEXT;
  new_original_id TEXT;
  target_payment RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_original_id := OLD."originalPaymentId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_original_id := NEW."originalPaymentId"; END IF;

  -- A common parent-row lock serializes legacy payments and allocations.
  FOR target_payment IN
    SELECT payment."id" FROM "Payment" payment
    WHERE payment."id" IN (old_original_id, new_original_id)
    ORDER BY payment."id" FOR UPDATE
  LOOP
    NULL;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_allocation_refund_capacity_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_original_id TEXT;
  new_original_id TEXT;
  target_payment RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_original_id := OLD."originalPaymentId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_original_id := NEW."originalPaymentId"; END IF;

  FOR target_payment IN
    SELECT payment."id" FROM "Payment" payment
    WHERE payment."id" IN (old_original_id, new_original_id)
    ORDER BY payment."id" FOR UPDATE
  LOOP
    NULL;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_refund_capacity_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_refund_id TEXT;
  new_refund_id TEXT;
  target_payment RECORD;
  target_order_item RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_refund_id := OLD."id"; END IF;
  IF TG_OP <> 'DELETE' THEN new_refund_id := NEW."id"; END IF;

  FOR target_payment IN
    SELECT payment."id"
    FROM "Payment" payment
    JOIN "RefundAllocation" allocation ON allocation."originalPaymentId" = payment."id"
    WHERE allocation."refundId" IN (old_refund_id, new_refund_id)
    ORDER BY payment."id" FOR UPDATE OF payment
  LOOP
    NULL;
  END LOOP;

  FOR target_order_item IN
    SELECT order_item."id"
    FROM "OrderItem" order_item
    JOIN "ReturnItem" return_item ON return_item."orderItemId" = order_item."id"
    JOIN "RefundLine" line ON line."returnItemId" = return_item."id"
    WHERE line."refundId" IN (old_refund_id, new_refund_id)
    ORDER BY order_item."id" FOR UPDATE OF order_item
  LOOP
    NULL;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_refund_line_capacity_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_return_item_id TEXT;
  new_return_item_id TEXT;
  target_order_item RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_return_item_id := OLD."returnItemId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_return_item_id := NEW."returnItemId"; END IF;

  FOR target_order_item IN
    SELECT order_item."id"
    FROM "OrderItem" order_item
    JOIN "ReturnItem" return_item ON return_item."orderItemId" = order_item."id"
    WHERE return_item."id" IN (old_return_item_id, new_return_item_id)
    ORDER BY order_item."id" FOR UPDATE OF order_item
  LOOP
    NULL;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_return_item_capacity_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_order_item_id TEXT;
  new_order_item_id TEXT;
  target_order_item RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_order_item_id := OLD."orderItemId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_order_item_id := NEW."orderItemId"; END IF;

  FOR target_order_item IN
    SELECT order_item."id" FROM "OrderItem" order_item
    WHERE order_item."id" IN (old_order_item_id, new_order_item_id)
    ORDER BY order_item."id" FOR UPDATE
  LOOP
    NULL;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_return_capacity_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_return_id TEXT;
  new_return_id TEXT;
  target_order_item RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_return_id := OLD."id"; END IF;
  IF TG_OP <> 'DELETE' THEN new_return_id := NEW."id"; END IF;

  FOR target_order_item IN
    SELECT order_item."id"
    FROM "OrderItem" order_item
    JOIN "ReturnItem" return_item ON return_item."orderItemId" = order_item."id"
    WHERE return_item."returnId" IN (old_return_id, new_return_id)
    ORDER BY order_item."id" FOR UPDATE OF order_item
  LOOP
    NULL;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_payment_refund_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_payment_id TEXT;
  new_payment_id TEXT;
  old_original_id TEXT;
  new_original_id TEXT;
  target_payment RECORD;
  linked_refund RECORD;
  linked_transaction RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_payment_id := OLD."id";
    old_original_id := OLD."originalPaymentId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_payment_id := NEW."id";
    new_original_id := NEW."originalPaymentId";
  END IF;

  FOR target_payment IN
    SELECT DISTINCT payment."id" FROM "Payment" payment
    WHERE payment."id" IN (old_payment_id, new_payment_id, old_original_id, new_original_id)
  LOOP
    PERFORM validate_refund_capacity(target_payment."id");
  END LOOP;

  FOR linked_refund IN
    SELECT DISTINCT "refundId" FROM "RefundAllocation"
    WHERE "originalPaymentId" IN (old_payment_id, new_payment_id, old_original_id, new_original_id)
  LOOP
    PERFORM validate_refund_consistency(linked_refund."refundId");
  END LOOP;

  -- Legacy refund Payments contribute to posted_order_tax by order. Revalidate
  -- both sides of a mutation so moving, resizing or deleting one cannot stale
  -- an immutable RefundLine tax snapshot.
  FOR linked_refund IN
    SELECT DISTINCT refund."id"
    FROM "Refund" refund
    WHERE refund."orderId" IN (
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."orderId" END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."orderId" END
    )
  LOOP
    PERFORM validate_refund_consistency(linked_refund."id");
  END LOOP;

  FOR linked_transaction IN
    SELECT transaction."id"
    FROM "GiftCardTransaction" transaction
    LEFT JOIN "RefundAllocation" allocation ON allocation."id" = transaction."refundAllocationId"
    WHERE transaction."paymentId" IN (old_payment_id, new_payment_id)
      OR allocation."originalPaymentId" IN (old_payment_id, new_payment_id, old_original_id, new_original_id)
  LOOP
    PERFORM validate_gift_card_transaction(linked_transaction."id");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_return_refund_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_return_id TEXT;
  new_return_id TEXT;
  linked_refund RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_return_id := OLD."id"; END IF;
  IF TG_OP <> 'DELETE' THEN new_return_id := NEW."id"; END IF;

  FOR linked_refund IN
    SELECT DISTINCT refund."id"
    FROM "Refund" refund
    LEFT JOIN "RefundLine" line ON line."refundId" = refund."id"
    LEFT JOIN "ReturnItem" refunded_item ON refunded_item."id" = line."returnItemId"
    WHERE refund."returnId" IN (old_return_id, new_return_id)
      OR refunded_item."orderItemId" IN (
        SELECT item."orderItemId" FROM "ReturnItem" item
        WHERE item."returnId" IN (old_return_id, new_return_id)
      )
  LOOP
    PERFORM validate_refund_consistency(linked_refund."id");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_return_item_refund_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_item_id TEXT;
  new_item_id TEXT;
  old_return_id TEXT;
  new_return_id TEXT;
  old_order_item_id TEXT;
  new_order_item_id TEXT;
  linked_refund RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_item_id := OLD."id";
    old_return_id := OLD."returnId";
    old_order_item_id := OLD."orderItemId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_item_id := NEW."id";
    new_return_id := NEW."returnId";
    new_order_item_id := NEW."orderItemId";
  END IF;

  FOR linked_refund IN
    SELECT DISTINCT refund."id"
    FROM "Refund" refund
    LEFT JOIN "RefundLine" line ON line."refundId" = refund."id"
    LEFT JOIN "ReturnItem" item ON item."id" = line."returnItemId"
    WHERE refund."returnId" IN (old_return_id, new_return_id)
      OR line."returnItemId" IN (old_item_id, new_item_id)
      OR item."orderItemId" IN (old_order_item_id, new_order_item_id)
  LOOP
    PERFORM validate_refund_consistency(linked_refund."id");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_order_item_refund_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_order_item_id TEXT;
  new_order_item_id TEXT;
  linked_refund RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_order_item_id := OLD."id"; END IF;
  IF TG_OP <> 'DELETE' THEN new_order_item_id := NEW."id"; END IF;

  FOR linked_refund IN
    SELECT DISTINCT line."refundId"
    FROM "RefundLine" line
    JOIN "ReturnItem" item ON item."id" = line."returnItemId"
    WHERE item."orderItemId" IN (old_order_item_id, new_order_item_id)
  LOOP
    PERFORM validate_refund_consistency(linked_refund."refundId");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_order_refunds_trigger() RETURNS TRIGGER AS $$
DECLARE
  linked_refund RECORD;
BEGIN
  FOR linked_refund IN
    SELECT refund."id"
    FROM "Refund" refund
    WHERE refund."orderId" = COALESCE(NEW."id", OLD."id")
  LOOP
    PERFORM validate_refund_consistency(linked_refund."id");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_accounting_refunds_trigger() RETURNS TRIGGER AS $$
DECLARE
  old_source_ref TEXT;
  new_source_ref TEXT;
  linked_refund RECORD;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."sourceType" = 'payment.refund' THEN old_source_ref := OLD."sourceRef"; END IF;
  IF TG_OP <> 'DELETE' AND NEW."sourceType" = 'payment.refund' THEN new_source_ref := NEW."sourceRef"; END IF;

  FOR linked_refund IN
    SELECT DISTINCT refund."id"
    FROM "Refund" refund
    JOIN "Payment" payment ON payment."orderId" = refund."orderId"
    WHERE payment."id" IN (old_source_ref, new_source_ref)
  LOOP
    PERFORM validate_refund_consistency(linked_refund."id");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GiftCardTransaction_append_only_trigger"
BEFORE UPDATE OR DELETE ON "GiftCardTransaction"
FOR EACH ROW EXECUTE FUNCTION reject_gift_card_transaction_mutation();

CREATE TRIGGER "GiftCard_initial_balance_immutable_trigger"
BEFORE UPDATE OF "initialBalance" ON "GiftCard"
FOR EACH ROW EXECUTE FUNCTION reject_gift_card_initial_balance_mutation();

CREATE TRIGGER "RefundLine_immutable_trigger"
BEFORE UPDATE OR DELETE ON "RefundLine"
FOR EACH ROW EXECUTE FUNCTION reject_refund_line_mutation();

CREATE TRIGGER "Payment_refund_capacity_lock_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION lock_payment_refund_capacity_trigger();

CREATE TRIGGER "RefundAllocation_capacity_lock_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "RefundAllocation"
FOR EACH ROW EXECUTE FUNCTION lock_allocation_refund_capacity_trigger();

CREATE TRIGGER "Refund_capacity_lock_trigger"
BEFORE UPDATE OR DELETE ON "Refund"
FOR EACH ROW EXECUTE FUNCTION lock_refund_capacity_trigger();

CREATE TRIGGER "RefundLine_capacity_lock_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "RefundLine"
FOR EACH ROW EXECUTE FUNCTION lock_refund_line_capacity_trigger();

CREATE TRIGGER "ReturnItem_capacity_lock_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "ReturnItem"
FOR EACH ROW EXECUTE FUNCTION lock_return_item_capacity_trigger();

CREATE TRIGGER "Return_capacity_lock_trigger"
BEFORE UPDATE OR DELETE ON "Return"
FOR EACH ROW EXECUTE FUNCTION lock_return_capacity_trigger();

CREATE CONSTRAINT TRIGGER "Refund_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "Refund"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_refund_row_trigger();

CREATE CONSTRAINT TRIGGER "RefundAllocation_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "RefundAllocation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_refund_child_trigger();

CREATE CONSTRAINT TRIGGER "RefundLine_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "RefundLine"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_refund_child_trigger();

CREATE CONSTRAINT TRIGGER "GiftCardTransaction_consistency_trigger"
AFTER INSERT ON "GiftCardTransaction"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_gift_card_transaction_trigger();

CREATE CONSTRAINT TRIGGER "GiftCard_balance_consistency_trigger"
AFTER INSERT OR UPDATE ON "GiftCard"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_gift_card_balance_trigger();

CREATE CONSTRAINT TRIGGER "Payment_legacy_gift_card_journal_trigger"
AFTER INSERT OR UPDATE OF "giftCardId", "method" ON "Payment"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_legacy_gift_card_payment();

CREATE CONSTRAINT TRIGGER "Payment_refund_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "Payment"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payment_refund_trigger();

CREATE CONSTRAINT TRIGGER "Return_refund_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "Return"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_return_refund_trigger();

CREATE CONSTRAINT TRIGGER "ReturnItem_refund_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "ReturnItem"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_return_item_refund_trigger();

CREATE CONSTRAINT TRIGGER "OrderItem_refund_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "OrderItem"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_item_refund_trigger();

CREATE CONSTRAINT TRIGGER "Order_refund_consistency_trigger"
AFTER UPDATE OF "taxAmount" ON "Order"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_refunds_trigger();

CREATE CONSTRAINT TRIGGER "AccountingJournalEntry_refund_consistency_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "AccountingJournalEntry"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_accounting_refunds_trigger();

COMMIT;
