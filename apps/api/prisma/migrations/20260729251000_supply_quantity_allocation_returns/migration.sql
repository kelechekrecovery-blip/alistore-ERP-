ALTER TABLE "SupplyQuantityAllocation"
  ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SupplyQuantityAllocation"
  ADD CONSTRAINT "SupplyQuantityAllocation_returned_qty_check"
  CHECK ("returnedQty" >= 0 AND "returnedQty" <= "qty");
