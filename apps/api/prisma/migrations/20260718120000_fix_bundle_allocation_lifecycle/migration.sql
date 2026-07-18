-- A serialized unit may be released and reserved again. The immutable
-- allocation history must therefore be unique only while it is active.
DROP INDEX IF EXISTS "OrderBundleAllocation_imei_key";

CREATE UNIQUE INDEX "OrderBundleAllocation_active_imei_key"
  ON "OrderBundleAllocation"("imei")
  WHERE "active" = true;
