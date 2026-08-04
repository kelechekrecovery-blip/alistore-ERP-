ALTER TABLE "InventoryValuationLayer" DROP CONSTRAINT "InventoryValuationLayer_balanceId_fkey";
ALTER TABLE "InventoryValuationLayer" ADD CONSTRAINT "InventoryValuationLayer_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "InventoryBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationIssue" DROP CONSTRAINT "InventoryValuationIssue_productId_fkey";
ALTER TABLE "InventoryValuationIssue" ADD CONSTRAINT "InventoryValuationIssue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationIssue" DROP CONSTRAINT "InventoryValuationIssue_layerId_fkey";
ALTER TABLE "InventoryValuationIssue" ADD CONSTRAINT "InventoryValuationIssue_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "InventoryValuationLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryValuationIssue" DROP CONSTRAINT "InventoryValuationIssue_imei_fkey";
ALTER TABLE "InventoryValuationIssue" ADD CONSTRAINT "InventoryValuationIssue_imei_fkey" FOREIGN KEY ("imei") REFERENCES "DeviceUnit"("imei") ON DELETE CASCADE ON UPDATE CASCADE;
