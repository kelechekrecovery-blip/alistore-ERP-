-- CreateEnum
CREATE TYPE "RmaStatus" AS ENUM ('created', 'shipped', 'accepted', 'repaired', 'replaced', 'refunded', 'rejected', 'closed');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRma" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "defect" TEXT NOT NULL,
    "status" "RmaStatus" NOT NULL DEFAULT 'created',
    "sla" TIMESTAMP(3) NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "SupplierRma_supplierId_idx" ON "SupplierRma"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierRma_imei_idx" ON "SupplierRma"("imei");

-- CreateIndex
CREATE INDEX "SupplierRma_status_idx" ON "SupplierRma"("status");

-- AddForeignKey
ALTER TABLE "SupplierRma" ADD CONSTRAINT "SupplierRma_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
