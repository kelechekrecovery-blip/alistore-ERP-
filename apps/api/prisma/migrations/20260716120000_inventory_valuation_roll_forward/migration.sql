ALTER TABLE "InventoryValuationIssue" ADD COLUMN "location" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "valuationQty" INTEGER;

UPDATE "InventoryMovement"
SET "valuationQty" = qty
WHERE "totalValue" IS NOT NULL
  AND type = 'received'
  AND qty >= 0;

UPDATE "InventoryValuationIssue" issue
SET "location" = COALESCE(
  (SELECT "fulfillmentLocation" FROM "Order" WHERE id = issue."orderId"),
  (SELECT "location" FROM "InventoryValuationLayer" WHERE id = issue."layerId"),
  (SELECT "location" FROM "DeviceUnit" WHERE imei = issue.imei),
  'UNKNOWN'
);

UPDATE "InventoryValuationIssue" issue
SET "createdAt" = entry."occurredAt"
FROM "AccountingJournalEntry" entry
WHERE entry."sourceType" = 'inventory.cogs'
  AND entry."sourceRef" = issue.id;

ALTER TABLE "InventoryValuationIssue"
  ADD CONSTRAINT "InventoryValuationIssue_reversal_bounds"
  CHECK ("reversedQty" >= 0 AND "reversedQty" <= quantity);

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_valuation_quantity_bounds"
  CHECK ("valuationQty" IS NULL OR ("valuationQty" >= 0 AND "valuationQty" <= ABS(qty)));

CREATE INDEX "InventoryValuationIssue_productId_location_createdAt_idx"
  ON "InventoryValuationIssue"("productId", "location", "createdAt");

CREATE TABLE "InventoryValuationReversal" (
  "id" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryValuationReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryValuationReversal_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "InventoryValuationReversal_nonnegative_cost" CHECK ("unitCost" >= 0 AND "totalCost" >= 0),
  CONSTRAINT "InventoryValuationReversal_total_matches" CHECK ("totalCost" = "quantity" * "unitCost")
);

WITH historical_return_entries AS (
  SELECT
    entry.id AS "entryId",
    entry."sourceRef",
    entry."occurredAt",
    issue.id AS "issueId",
    issue."productId",
    issue."unitCost",
    issue."reversedQty",
    ret.id AS "returnId",
    ret."restockLocation",
    split_part(entry."sourceRef", ':', 3)::INTEGER AS "cumulativeQty"
  FROM "AccountingJournalEntry" entry
  JOIN "InventoryValuationIssue" issue
    ON entry."sourceType" = 'inventory.return'
   AND split_part(entry."sourceRef", ':', 2) = issue.id
  JOIN "Return" ret
    ON ret.id = split_part(entry."sourceRef", ':', 1)
  WHERE issue."reversedQty" > 0
    AND split_part(entry."sourceRef", ':', 3) ~ '^[0-9]+$'
), historical_return_deltas AS (
  SELECT
    historical_return_entries.*,
    LAG("cumulativeQty", 1, 0) OVER (
      PARTITION BY "issueId"
      ORDER BY "cumulativeQty", "occurredAt", "entryId"
    ) AS "previousCumulativeQty"
  FROM historical_return_entries
)
INSERT INTO "InventoryValuationReversal" (
  "id", "issueId", "productId", "returnId", "sourceType", "sourceRef",
  "location", "quantity", "unitCost", "totalCost", "createdAt"
)
SELECT
  'backfill-' || history."entryId",
  history."issueId",
  history."productId",
  history."returnId",
  'inventory.return',
  history."sourceRef",
  COALESCE(
    history."restockLocation",
    (SELECT layer.location
     FROM "InventoryValuationLayer" layer
     WHERE layer."sourceType" = 'inventory.return'
       AND layer."sourceRef" LIKE history."returnId" || ':' || history."issueId" || ':%'
     ORDER BY layer."createdAt" DESC
     LIMIT 1),
    'UNKNOWN'
  ),
  LEAST(history."cumulativeQty", history."reversedQty") - history."previousCumulativeQty",
  history."unitCost",
  (LEAST(history."cumulativeQty", history."reversedQty") - history."previousCumulativeQty") * history."unitCost",
  history."occurredAt"
FROM historical_return_deltas history
WHERE history."previousCumulativeQty" < LEAST(history."cumulativeQty", history."reversedQty");

CREATE UNIQUE INDEX "InventoryValuationReversal_sourceType_sourceRef_key"
  ON "InventoryValuationReversal"("sourceType", "sourceRef");
CREATE INDEX "InventoryValuationReversal_issueId_createdAt_idx"
  ON "InventoryValuationReversal"("issueId", "createdAt");
CREATE INDEX "InventoryValuationReversal_productId_location_createdAt_idx"
  ON "InventoryValuationReversal"("productId", "location", "createdAt");
CREATE INDEX "InventoryValuationReversal_returnId_idx"
  ON "InventoryValuationReversal"("returnId");

ALTER TABLE "InventoryValuationReversal"
  ADD CONSTRAINT "InventoryValuationReversal_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "InventoryValuationIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationReversal"
  ADD CONSTRAINT "InventoryValuationReversal_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationReversal"
  ADD CONSTRAINT "InventoryValuationReversal_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_inventory_valuation_reversal()
RETURNS trigger AS $$
DECLARE
  linked_issue "InventoryValuationIssue"%ROWTYPE;
  linked_return "Return"%ROWTYPE;
  covered_quantity INTEGER;
BEGIN
  SELECT * INTO linked_issue
  FROM "InventoryValuationIssue"
  WHERE id = NEW."issueId";

  SELECT * INTO linked_return
  FROM "Return"
  WHERE id = NEW."returnId";

  IF linked_issue.id IS NULL OR linked_return.id IS NULL THEN
    RAISE EXCEPTION 'inventory valuation reversal provenance is missing';
  END IF;
  IF NEW."productId" <> linked_issue."productId"
     OR NEW."unitCost" <> linked_issue."unitCost"
     OR linked_issue."orderId" IS NULL
     OR linked_return."orderId" <> linked_issue."orderId" THEN
    RAISE EXCEPTION 'inventory valuation reversal provenance mismatch';
  END IF;
  IF NEW."sourceType" <> 'inventory.return'
     OR split_part(NEW."sourceRef", ':', 1) <> NEW."returnId"
     OR split_part(NEW."sourceRef", ':', 2) <> NEW."issueId" THEN
    RAISE EXCEPTION 'inventory valuation reversal source mismatch';
  END IF;

  SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO covered_quantity
  FROM "InventoryValuationReversal"
  WHERE "issueId" = NEW."issueId";

  IF covered_quantity <> linked_issue."reversedQty"
     OR covered_quantity > linked_issue.quantity THEN
    RAISE EXCEPTION 'inventory valuation reversal quantity mismatch';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "InventoryValuationReversal_provenance_guard"
AFTER INSERT ON "InventoryValuationReversal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inventory_valuation_reversal();

CREATE OR REPLACE FUNCTION reject_inventory_valuation_reversal_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory valuation reversals are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryValuationReversal_update_guard"
BEFORE UPDATE ON "InventoryValuationReversal"
FOR EACH ROW EXECUTE FUNCTION reject_inventory_valuation_reversal_update();

CREATE OR REPLACE FUNCTION validate_inventory_valuation_issue_coverage()
RETURNS trigger AS $$
DECLARE
  covered_quantity INTEGER;
BEGIN
  SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO covered_quantity
  FROM "InventoryValuationReversal"
  WHERE "issueId" = NEW.id;

  IF covered_quantity <> NEW."reversedQty" THEN
    RAISE EXCEPTION 'inventory valuation issue reversal coverage mismatch';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Old API instances do not write immutable reversal rows. During a rolling
-- deployment their return transaction fails at commit and can be safely retried
-- against the new version instead of leaving an uncovered cost reversal.
CREATE CONSTRAINT TRIGGER "InventoryValuationIssue_coverage_guard"
AFTER UPDATE OF "reversedQty" ON "InventoryValuationIssue"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inventory_valuation_issue_coverage();

CREATE OR REPLACE FUNCTION validate_inventory_valuation_reversal_delete()
RETURNS trigger AS $$
DECLARE
  covered_quantity INTEGER;
  expected_quantity INTEGER;
BEGIN
  SELECT "reversedQty" INTO expected_quantity
  FROM "InventoryValuationIssue"
  WHERE id = OLD."issueId";

  IF expected_quantity IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO covered_quantity
  FROM "InventoryValuationReversal"
  WHERE "issueId" = OLD."issueId";

  IF covered_quantity <> expected_quantity THEN
    RAISE EXCEPTION 'inventory valuation reversal deletion breaks coverage';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "InventoryValuationReversal_delete_guard"
AFTER DELETE ON "InventoryValuationReversal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_inventory_valuation_reversal_delete();
