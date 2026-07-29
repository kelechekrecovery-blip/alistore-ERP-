CREATE TYPE "OrderCancellationStatus" AS ENUM (
  'requested',
  'awaiting_owner',
  'approved',
  'refund_queued',
  'refund_processing',
  'refunded',
  'rejected',
  'refund_failed',
  'cancelled'
);

CREATE TYPE "OrderCancellationPolicy" AS ENUM (
  'automatic_full',
  'owner_resolution'
);

CREATE TYPE "OrderCancellationFaultParty" AS ENUM (
  'customer',
  'supplier',
  'alistore',
  'unknown'
);

CREATE TABLE "OrderCancellation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerIdSnapshot" TEXT NOT NULL,
  "status" "OrderCancellationStatus" NOT NULL DEFAULT 'requested',
  "policySnapshot" "OrderCancellationPolicy" NOT NULL,
  "purchaseOrderSentSnapshot" BOOLEAN NOT NULL,
  "depositPaidSnapshot" INTEGER NOT NULL,
  "requestedRefundAmount" INTEGER NOT NULL,
  "approvedRefundAmount" INTEGER,
  "supplierExpenseAmount" INTEGER NOT NULL DEFAULT 0,
  "faultParty" "OrderCancellationFaultParty",
  "customerReason" TEXT NOT NULL,
  "ownerReason" TEXT,
  "evidence" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "resolvedBy" TEXT,
  "refundId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderCancellation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderCancellation_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderCancellation_amounts_check"
    CHECK (
      "depositPaidSnapshot" >= 0
      AND "requestedRefundAmount" >= 0
      AND "requestedRefundAmount" <= "depositPaidSnapshot"
      AND "supplierExpenseAmount" >= 0
      AND ("approvedRefundAmount" IS NULL OR (
        "approvedRefundAmount" >= 0
        AND "approvedRefundAmount" <= "depositPaidSnapshot"
      ))
    ),
  CONSTRAINT "OrderCancellation_resolution_check"
    CHECK (
      ("resolvedAt" IS NULL AND "resolvedBy" IS NULL)
      OR ("resolvedAt" IS NOT NULL AND "resolvedBy" IS NOT NULL AND length(trim(COALESCE("ownerReason", ''))) > 0)
    ),
  CONSTRAINT "OrderCancellation_fault_full_refund_check"
    CHECK (
      "faultParty" NOT IN ('supplier', 'alistore')
      OR "approvedRefundAmount" IS NULL
      OR "approvedRefundAmount" = "depositPaidSnapshot"
    )
);

CREATE UNIQUE INDEX "OrderCancellation_idempotencyKey_key"
  ON "OrderCancellation"("idempotencyKey");
CREATE UNIQUE INDEX "OrderCancellation_refundId_key"
  ON "OrderCancellation"("refundId");
CREATE INDEX "OrderCancellation_orderId_status_idx"
  ON "OrderCancellation"("orderId", "status");
CREATE INDEX "OrderCancellation_status_createdAt_idx"
  ON "OrderCancellation"("status", "createdAt");
CREATE UNIQUE INDEX "OrderCancellation_one_active_per_order"
  ON "OrderCancellation"("orderId")
  WHERE "status" IN (
    'requested',
    'awaiting_owner',
    'approved',
    'refund_queued',
    'refund_processing',
    'refund_failed'
  );
