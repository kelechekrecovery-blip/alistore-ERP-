-- CreateEnum
CREATE TYPE "Role" AS ENUM ('seller', 'senior_seller', 'cashier', 'warehouse', 'courier', 'marketer', 'admin', 'owner', 'franchise');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment', 'paid', 'picking', 'packed', 'ready_for_pickup', 'courier_assigned', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'return_requested', 'returned', 'exchanged', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'received', 'reconciled', 'disputed', 'refunded');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('in_stock', 'reserved', 'sold', 'returned', 'in_repair', 'written_off');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('requested', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('requested', 'under_review', 'approved', 'rejected', 'processing', 'paid', 'reconciled');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('created', 'received', 'diagnostics', 'waiting_supplier', 'approved', 'rejected', 'repaired', 'replaced', 'closed');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('new', 'in_progress', 'waiting', 'resolved', 'closed');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "segments" TEXT[],
    "ltv" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "attrs" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceUnit" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'in_stock',
    "grade" "Grade",
    "location" TEXT NOT NULL,
    "orderId" TEXT,

    CONSTRAINT "DeviceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "channel" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "imei" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "shiftId" TEXT,
    "txnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "openCash" INTEGER NOT NULL,
    "closeCash" INTEGER,
    "diff" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "imei" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'requested',
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyCase" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'created',
    "sla" TIMESTAMP(3) NOT NULL,
    "assignee" TEXT,

    CONSTRAINT "WarrantyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeInDevice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "grade" "Grade" NOT NULL,
    "price" INTEGER NOT NULL,
    "contractId" TEXT,
    "sellerPassport" TEXT NOT NULL,

    CONSTRAINT "TradeInDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierRun" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "codTotal" INTEGER NOT NULL,
    "handedOver" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requester" TEXT NOT NULL,
    "approver" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "refs" TEXT[],

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "sla" TIMESTAMP(3) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'new',

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_archived_idx" ON "Product"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUnit_imei_key" ON "DeviceUnit"("imei");

-- CreateIndex
CREATE INDEX "DeviceUnit_productId_idx" ON "DeviceUnit"("productId");

-- CreateIndex
CREATE INDEX "DeviceUnit_status_idx" ON "DeviceUnit"("status");

-- CreateIndex
CREATE INDEX "DeviceUnit_orderId_idx" ON "DeviceUnit"("orderId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txnId_key" ON "Payment"("txnId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_shiftId_idx" ON "Payment"("shiftId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");

-- CreateIndex
CREATE INDEX "Reservation_orderId_idx" ON "Reservation"("orderId");

-- CreateIndex
CREATE INDEX "Reservation_imei_idx" ON "Reservation"("imei");

-- CreateIndex
CREATE INDEX "Reservation_active_idx" ON "Reservation"("active");

-- CreateIndex
CREATE INDEX "Return_orderId_idx" ON "Return"("orderId");

-- CreateIndex
CREATE INDEX "Return_status_idx" ON "Return"("status");

-- CreateIndex
CREATE INDEX "WarrantyCase_imei_idx" ON "WarrantyCase"("imei");

-- CreateIndex
CREATE INDEX "WarrantyCase_status_idx" ON "WarrantyCase"("status");

-- CreateIndex
CREATE INDEX "TradeInDevice_customerId_idx" ON "TradeInDevice"("customerId");

-- CreateIndex
CREATE INDEX "CourierRun_courierId_idx" ON "CourierRun"("courierId");

-- CreateIndex
CREATE INDEX "CourierRun_handedOver_idx" ON "CourierRun"("handedOver");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE INDEX "Approval_action_idx" ON "Approval"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_type_idx" ON "AuditEvent"("type");

-- CreateIndex
CREATE INDEX "AuditEvent_actor_idx" ON "AuditEvent"("actor");

-- CreateIndex
CREATE INDEX "AuditEvent_refs_idx" ON "AuditEvent"("refs");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_idx" ON "SupportTicket"("customerId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeInDevice" ADD CONSTRAINT "TradeInDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
