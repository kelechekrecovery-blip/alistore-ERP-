-- Reconcile historical DDL with the current Prisma contract so a clean
-- deployment and an introspected deployment produce the same schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "Campaign" ALTER COLUMN "updatedAt" DROP DEFAULT;

DROP INDEX IF EXISTS "DebtPlan_orderId_idx";

ALTER INDEX "InventoryValuationLayer_balanceId_quantityRemaining_createdAt_i"
  RENAME TO "InventoryValuationLayer_balanceId_quantityRemaining_created_idx";

ALTER TABLE "PromotionCode"
  ALTER COLUMN "eligibleProductIds" DROP DEFAULT,
  ALTER COLUMN "eligibleCategories" DROP DEFAULT;

ALTER INDEX "QuantityConsignmentAllocation_orderQuantityAllocationId_lotId_k"
  RENAME TO "QuantityConsignmentAllocation_orderQuantityAllocationId_lot_key";

COMMIT;
