-- AliStore Business, срез 1: у товара появляется хозяин.
--
-- Миграция строго аддитивна: только CREATE TABLE и ADD COLUMN NULL. Ни одной
-- существующей строки она не трогает — товары AliStore остаются AliStore-овыми
-- просто потому, что колонка пуста. Откат безопасен: DROP COLUMN вернёт
-- прежнее состояние без потери данных о собственных товарах.

CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Seller_slug_key" ON "Seller"("slug");
CREATE INDEX "Seller_active_name_idx" ON "Seller"("active", "name");

ALTER TABLE "Product" ADD COLUMN "sellerId" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "sellerId" TEXT;

CREATE INDEX "Product_sellerId_archived_idx" ON "Product"("sellerId", "archived");
CREATE INDEX "StaffUser_sellerId_idx" ON "StaffUser"("sellerId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
