-- AliStore Business, срез 2: у партнёра своя личность.
--
-- Правка предыдущего среза. `StaffUser.sellerId` подразумевал, что партнёр —
-- разновидность сотрудника AliStore. Это неверно и опасно: общая таблица
-- означает общий контур прав, где одна забытая проверка роли открывает
-- партнёру склад и деньги. Колонка удаляется — данных в ней нет, она прожила
-- один срез и ни разу не читалась.

ALTER TABLE "StaffUser" DROP CONSTRAINT IF EXISTS "StaffUser_sellerId_fkey";
DROP INDEX IF EXISTS "StaffUser_sellerId_idx";
ALTER TABLE "StaffUser" DROP COLUMN IF EXISTS "sellerId";

CREATE TABLE "SellerUser" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SellerUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerUser_username_key" ON "SellerUser"("username");
CREATE INDEX "SellerUser_sellerId_active_idx" ON "SellerUser"("sellerId", "active");

ALTER TABLE "SellerUser" ADD CONSTRAINT "SellerUser_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
