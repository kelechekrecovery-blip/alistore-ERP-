-- PostgreSQL requires new enum values to commit before a later migration can
-- reference them from CHECK constraints.
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'awaiting_deposit';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'procurement_draft';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'quality_check';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'supplier_rejected';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'late';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'customer_cancelled';
ALTER TYPE "OrderLineSupplyStatus" ADD VALUE IF NOT EXISTS 'quarantined';
