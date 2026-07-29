-- Supply commerce foundation. Forward-only extension of the earlier display
-- and line-supply slices; existing migrations are intentionally untouched.

ALTER TABLE "OrderLineSupply"
  DROP CONSTRAINT "OrderLineSupply_purchase_order_item_required_check";
ALTER TABLE "OrderLineSupply"
  ADD CONSTRAINT "OrderLineSupply_purchase_order_item_required_check"
  CHECK (
    "purchaseOrderItemId" IS NOT NULL
    OR "status" IN (
      'awaiting_deposit',
      'awaiting_supplier',
      'procurement_draft',
      'customer_cancelled',
      'cancelled'
    )
  );

CREATE TYPE "OrderLineFulfillmentStatus" AS ENUM (
  'pending_payment',
  'reserved',
  'ready',
  'awaiting_deposit',
  'procurement_draft',
  'supplier_ordered',
  'in_transit',
  'received',
  'quality_check',
  'handed_over',
  'reservation_expired',
  'supplier_rejected',
  'late',
  'customer_cancelled',
  'quarantined',
  'cancelled'
);

CREATE TYPE "OrderReceivableKind" AS ENUM (
  'supply_deposit',
  'stock_sale',
  'supply_balance',
  'delivery'
);

CREATE TYPE "OrderReceivableStatus" AS ENUM (
  'open',
  'partially_settled',
  'settled',
  'cancelled'
);

ALTER TABLE "OrderItem"
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "supplyModeSnapshot" "SupplyMode" NOT NULL DEFAULT 'own_stock',
  ADD COLUMN "supplierIdSnapshot" TEXT,
  ADD COLUMN "supplyLeadDaysSnapshot" INTEGER,
  ADD COLUMN "promisedDate" DATE,
  ADD COLUMN "fulfillmentStatus" "OrderLineFulfillmentStatus" NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "handedOverAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_supply_snapshot_check"
  CHECK (
    ("supplyModeSnapshot" = 'own_stock' AND "supplyLeadDaysSnapshot" IS NULL)
    OR
    ("supplyModeSnapshot" = 'to_order' AND "supplyLeadDaysSnapshot" BETWEEN 1 AND 180)
  );

CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "OrderItem_fulfillmentStatus_idx" ON "OrderItem"("fulfillmentStatus");

CREATE TABLE "SupplierOffer" (
  "id"           TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "supplierId"   TEXT NOT NULL,
  "supplierSku"  TEXT,
  "unitCost"     INTEGER NOT NULL,
  "availableQty" INTEGER NOT NULL,
  "leadDays"     INTEGER NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'KGS',
  "checkedAt"    TIMESTAMP(3) NOT NULL,
  "validUntil"   TIMESTAMP(3) NOT NULL,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "updatedBy"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierOffer_values_check" CHECK (
    "unitCost" >= 0
    AND "availableQty" >= 0
    AND "leadDays" BETWEEN 1 AND 180
    AND "validUntil" > "checkedAt"
  )
);

ALTER TABLE "SupplierOffer"
  ADD CONSTRAINT "SupplierOffer_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierOffer"
  ADD CONSTRAINT "SupplierOffer_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SupplierOffer_one_active_per_product_key"
  ON "SupplierOffer"("productId") WHERE "active" = true;
CREATE INDEX "SupplierOffer_productId_active_idx" ON "SupplierOffer"("productId", "active");
CREATE INDEX "SupplierOffer_supplierId_active_idx" ON "SupplierOffer"("supplierId", "active");
CREATE INDEX "SupplierOffer_validUntil_active_idx" ON "SupplierOffer"("validUntil", "active");

-- Preserve the newly introduced Product.supplierId association as an expired,
-- inactive historical offer. It cannot accidentally make a product orderable.
INSERT INTO "SupplierOffer" (
  "id", "productId", "supplierId", "unitCost", "availableQty", "leadDays",
  "checkedAt", "validUntil", "active", "updatedBy", "updatedAt"
)
SELECT
  'offer_backfill_' || p."id",
  p."id",
  p."supplierId",
  p."cost",
  0,
  p."supplyLeadDays",
  CURRENT_TIMESTAMP - INTERVAL '25 hours',
  CURRENT_TIMESTAMP - INTERVAL '1 hour',
  false,
  'system:migration',
  CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."supplierId" IS NOT NULL
  AND p."supplyMode" = 'to_order'
  AND p."supplyLeadDays" IS NOT NULL;

ALTER TABLE "OrderLineSupply"
  ADD COLUMN "supplierOfferId" TEXT,
  ADD COLUMN "orderedQty" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "receivedQty" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OrderLineSupply"
  ADD CONSTRAINT "OrderLineSupply_supplierOfferId_fkey"
  FOREIGN KEY ("supplierOfferId") REFERENCES "SupplierOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLineSupply"
  ADD CONSTRAINT "OrderLineSupply_quantities_check"
  CHECK ("orderedQty" > 0 AND "receivedQty" >= 0 AND "receivedQty" <= "orderedQty");
CREATE INDEX "OrderLineSupply_supplierOfferId_status_idx"
  ON "OrderLineSupply"("supplierOfferId", "status");

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "sourceOrderId" TEXT,
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "sourceVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_sourceOrderId_fkey"
  FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "PurchaseOrder_sourceKey_key" ON "PurchaseOrder"("sourceKey");
CREATE INDEX "PurchaseOrder_sourceOrderId_supplierId_status_idx"
  ON "PurchaseOrder"("sourceOrderId", "supplierId", "status");

CREATE TABLE "OrderReceivable" (
  "id"            TEXT NOT NULL,
  "orderId"       TEXT NOT NULL,
  "orderItemId"   TEXT,
  "kind"          "OrderReceivableKind" NOT NULL,
  "amount"        INTEGER NOT NULL,
  "settledAmount" INTEGER NOT NULL DEFAULT 0,
  "status"        "OrderReceivableStatus" NOT NULL DEFAULT 'open',
  "dueAt"         TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderReceivable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderReceivable_amount_check"
    CHECK ("amount" >= 0 AND "settledAmount" >= 0 AND "settledAmount" <= "amount")
);

ALTER TABLE "OrderReceivable"
  ADD CONSTRAINT "OrderReceivable_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReceivable"
  ADD CONSTRAINT "OrderReceivable_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "OrderReceivable_orderId_status_idx" ON "OrderReceivable"("orderId", "status");
CREATE INDEX "OrderReceivable_orderItemId_kind_idx" ON "OrderReceivable"("orderItemId", "kind");

CREATE TABLE "PaymentReceivableAllocation" (
  "id"           TEXT NOT NULL,
  "paymentId"    TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "amount"       INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentReceivableAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReceivableAllocation_amount_check" CHECK ("amount" > 0)
);

ALTER TABLE "PaymentReceivableAllocation"
  ADD CONSTRAINT "PaymentReceivableAllocation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReceivableAllocation"
  ADD CONSTRAINT "PaymentReceivableAllocation_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "OrderReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "PaymentReceivableAllocation_paymentId_receivableId_key"
  ON "PaymentReceivableAllocation"("paymentId", "receivableId");
CREATE INDEX "PaymentReceivableAllocation_receivableId_createdAt_idx"
  ON "PaymentReceivableAllocation"("receivableId", "createdAt");

-- Supply checkout did not exist for historical rows. Never infer a historical
-- promise from today's mutable Product policy; only the stable product FK is
-- backfilled by the SKU snapshot already stored on OrderItem. Keep this DML
-- after all DDL: on populated databases the FK trigger events generated by the
-- UPDATE otherwise make a later ALTER TABLE fail with PostgreSQL 55006.
UPDATE "OrderItem" oi
SET "productId" = p."id"
FROM "Product" p
WHERE oi."productId" IS NULL AND oi."sku" = p."sku";
