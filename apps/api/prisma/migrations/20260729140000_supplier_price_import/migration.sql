-- Слайс 4 плана docs/SUPPLY-TO-ORDER-PLAN.md: импорт прайс-листа поставщика.
--
-- Двухшаговый flow (stage → apply) над одними и теми же неизменяемыми данными:
-- "rows" считается один раз при создании батча и apply читает именно его, а не
-- парсит файл заново. Идемпотентность apply — не check-then-write в коде, а
-- UNIQUE("batchId") на SupplierPriceImportApplication: применить батч дважды
-- физически нельзя, вторая попытка упрётся в констрейнт (сервис ловит это как
-- "уже применено", не как ошибку).

CREATE TABLE "SupplierPriceImportBatch" (
  "id"         TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "mapping"    JSONB NOT NULL,
  "rows"       JSONB NOT NULL,
  "summary"    JSONB NOT NULL,
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierPriceImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceImportBatch_supplierId_idx" ON "SupplierPriceImportBatch"("supplierId");
CREATE INDEX "SupplierPriceImportBatch_createdAt_idx" ON "SupplierPriceImportBatch"("createdAt");

ALTER TABLE "SupplierPriceImportBatch"
  ADD CONSTRAINT "SupplierPriceImportBatch_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupplierPriceImportApplication" (
  "id"        TEXT NOT NULL,
  "batchId"   TEXT NOT NULL,
  "appliedBy" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "summary"   JSONB NOT NULL,

  CONSTRAINT "SupplierPriceImportApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierPriceImportApplication_batchId_key" ON "SupplierPriceImportApplication"("batchId");
CREATE INDEX "SupplierPriceImportApplication_appliedAt_idx" ON "SupplierPriceImportApplication"("appliedAt");

ALTER TABLE "SupplierPriceImportApplication"
  ADD CONSTRAINT "SupplierPriceImportApplication_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "SupplierPriceImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
