ALTER TABLE "Product"
ADD COLUMN "barcode" TEXT,
ADD COLUMN "variantGroup" TEXT;

CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
CREATE INDEX "Product_variantGroup_idx" ON "Product"("variantGroup");
