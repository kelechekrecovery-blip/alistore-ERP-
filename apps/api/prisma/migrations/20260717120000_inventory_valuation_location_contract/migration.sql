DO $$
DECLARE
  unknown_issue_count BIGINT;
  unknown_reversal_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO unknown_issue_count
  FROM "InventoryValuationIssue"
  WHERE "location" IS NULL OR btrim("location") = '' OR btrim("location") = 'UNKNOWN';

  SELECT COUNT(*) INTO unknown_reversal_count
  FROM "InventoryValuationReversal"
  WHERE "location" IS NULL OR btrim("location") = '' OR btrim("location") = 'UNKNOWN';

  IF unknown_issue_count > 0 OR unknown_reversal_count > 0 THEN
    RAISE EXCEPTION
      'inventory valuation location contract blocked: issue_count=%, reversal_count=%',
      unknown_issue_count,
      unknown_reversal_count;
  END IF;
END $$;

ALTER TABLE "InventoryValuationIssue"
  ALTER COLUMN "location" SET NOT NULL;

ALTER TABLE "InventoryValuationIssue"
  ADD CONSTRAINT "InventoryValuationIssue_location_contract"
  CHECK (btrim("location") <> '' AND btrim("location") <> 'UNKNOWN');

ALTER TABLE "InventoryValuationReversal"
  ADD CONSTRAINT "InventoryValuationReversal_location_contract"
  CHECK (btrim("location") <> '' AND btrim("location") <> 'UNKNOWN');
