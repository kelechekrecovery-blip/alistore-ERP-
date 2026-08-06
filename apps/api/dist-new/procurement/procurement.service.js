"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcurementService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const purchase_order_state_1 = require("./purchase-order-state");
const accounting_journal_1 = require("../finance/accounting-journal");
const prisma_errors_1 = require("../common/prisma-errors");
const store_point_identity_1 = require("../common/store-point-identity");
const DETAIL_INCLUDE = {
    supplier: { select: { id: true, name: true, contact: true } },
    items: {
        include: { product: { select: { id: true, sku: true, name: true } } },
        orderBy: { id: 'asc' },
    },
    receipts: { select: { id: true, idempotencyKey: true, actor: true, accountingEntryId: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
};
let ProcurementService = class ProcurementService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    list(status) {
        const allowed = ['draft', 'sent', 'receiving', 'received', 'cancelled'];
        if (status && !allowed.includes(status)) {
            throw new errors_1.ValidationError('invalid_purchase_order_status', `Неизвестный статус PO: ${status}`);
        }
        return this.prisma.purchaseOrder.findMany({
            where: status ? { status: status } : undefined,
            include: DETAIL_INCLUDE,
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async get(id) {
        const order = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
        if (!order)
            throw new errors_1.ValidationError('purchase_order_not_found', `PO ${id} не найден`);
        return order;
    }
    async create(dto, actor) {
        const location = (await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, dto.location, 'Склад назначения не соответствует активной точке')).inventoryLocation;
        const note = dto.note?.trim() || null;
        if (!location) {
            throw new errors_1.ValidationError('purchase_order_location_required', 'Укажите склад назначения');
        }
        const productIds = dto.items.map((item) => item.productId);
        if (new Set(productIds).size !== productIds.length) {
            throw new errors_1.ValidationError('duplicate_purchase_order_product', 'Один товар нельзя добавить в PO дважды');
        }
        const existing = await this.prisma.purchaseOrder.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: DETAIL_INCLUDE,
        });
        if (existing)
            return replayCreatedOrder(existing, dto, location, note);
        const [supplier, products] = await Promise.all([
            this.prisma.supplier.findUnique({ where: { id: dto.supplierId } }),
            this.prisma.product.findMany({
                where: { id: { in: productIds }, archived: false },
                select: { id: true, sku: true, _count: { select: { bundleComponents: true } } },
            }),
        ]);
        if (!supplier)
            throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
        if (products.length !== productIds.length) {
            throw new errors_1.ValidationError('purchase_order_product_not_found', 'Один или несколько товаров не найдены');
        }
        const virtualBundle = products.find((product) => product._count.bundleComponents > 0);
        if (virtualBundle) {
            throw new errors_1.ValidationError('purchase_order_virtual_bundle_forbidden', `Виртуальный набор ${virtualBundle.sku} нельзя оприходовать напрямую; добавьте его компоненты`);
        }
        const number = purchaseOrderNumber();
        try {
            return await this.audit.transaction(async (tx) => {
                const order = await tx.purchaseOrder.create({
                    data: {
                        number,
                        idempotencyKey: dto.idempotencyKey,
                        supplierId: dto.supplierId,
                        location,
                        note,
                        createdBy: actor,
                        items: { create: dto.items.map((item) => ({ productId: item.productId, orderedQty: item.qty, unitCost: item.unitCost })) },
                    },
                    include: DETAIL_INCLUDE,
                });
                return {
                    result: order,
                    events: [{
                            type: event_types_1.EventType.PurchaseOrderCreated,
                            actor,
                            payload: { purchaseOrderId: order.id, number, supplierId: dto.supplierId, location: order.location, items: dto.items.length },
                            refs: [order.id, dto.supplierId, ...productIds],
                        }],
                };
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const replay = await this.prisma.purchaseOrder.findUnique({
                    where: { idempotencyKey: dto.idempotencyKey },
                    include: DETAIL_INCLUDE,
                });
                if (replay)
                    return replayCreatedOrder(replay, dto, location, note);
            }
            throw error;
        }
    }
    send(id, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
            const order = await tx.purchaseOrder.findUnique({ where: { id } });
            if (!order)
                throw new errors_1.ValidationError('purchase_order_not_found', `PO ${id} не найден`);
            (0, purchase_order_state_1.assertCanSend)(order.status);
            const linkedSupplies = await tx.orderLineSupply.findMany({
                where: { purchaseOrderItem: { purchaseOrderId: id } },
                include: { orderItem: { select: { orderId: true } } },
            });
            const invalidSupply = linkedSupplies.find((supply) => supply.status !== 'procurement_draft');
            if (invalidSupply) {
                throw new errors_1.ConflictError('purchase_order_supply_state_invalid', `Строка ${invalidSupply.orderItemId} не готова к отправке поставщику`);
            }
            const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'sent', sentAt: new Date() }, include: DETAIL_INCLUDE });
            if (linkedSupplies.length > 0) {
                await tx.orderLineSupply.updateMany({
                    where: { id: { in: linkedSupplies.map((supply) => supply.id) }, status: 'procurement_draft' },
                    data: { status: 'ordered', actor },
                });
                await tx.orderItem.updateMany({
                    where: { id: { in: linkedSupplies.map((supply) => supply.orderItemId) } },
                    data: { fulfillmentStatus: 'supplier_ordered' },
                });
            }
            return {
                result: updated,
                events: [
                    { type: event_types_1.EventType.PurchaseOrderSent, actor, payload: { purchaseOrderId: id, number: order.number }, refs: [id, order.supplierId] },
                    ...linkedSupplies.map((supply) => ({
                        type: event_types_1.EventType.OrderLineSupplyOrdered,
                        actor,
                        payload: {
                            orderId: supply.orderItem.orderId,
                            orderItemId: supply.orderItemId,
                            purchaseOrderId: id,
                            purchaseOrderItemId: supply.purchaseOrderItemId,
                            supplierId: order.supplierId,
                            expectedAt: supply.expectedAt?.toISOString() ?? null,
                        },
                        refs: [supply.orderItem.orderId, supply.orderItemId, id, order.supplierId],
                    })),
                ],
            };
        });
    }
    cancel(id, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
            const order = await tx.purchaseOrder.findUnique({ where: { id } });
            if (!order)
                throw new errors_1.ValidationError('purchase_order_not_found', `PO ${id} не найден`);
            (0, purchase_order_state_1.assertCanCancel)(order.status);
            const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'cancelled' }, include: DETAIL_INCLUDE });
            return {
                result: updated,
                events: [{ type: event_types_1.EventType.PurchaseOrderCancelled, actor, payload: { purchaseOrderId: id, from: order.status }, refs: [id, order.supplierId] }],
            };
        });
    }
    async receive(id, dto, actor) {
        const itemIds = dto.lines.map((line) => line.itemId);
        if (new Set(itemIds).size !== itemIds.length) {
            throw new errors_1.ValidationError('duplicate_purchase_order_item', 'Строка PO повторяется в приёмке');
        }
        const normalizedLines = dto.lines.map((line) => ({
            ...line,
            imeis: (line.imeis ?? []).map((imei) => imei.trim()).filter(Boolean),
            qty: line.qty ?? null,
        }));
        const allImeis = normalizedLines.flatMap((line) => line.imeis);
        if (normalizedLines.some((line) => (line.imeis.length > 0) === (line.qty !== null))
            || new Set(allImeis).size !== allImeis.length) {
            throw new errors_1.ValidationError('invalid_purchase_receipt_quantity', 'Для каждой строки укажите либо уникальные IMEI, либо количество qty');
        }
        if (allImeis.length > 200) {
            throw new errors_1.ValidationError('purchase_receipt_too_large', 'За одну приёмку можно принять не более 200 устройств');
        }
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
                const existing = await tx.purchaseReceipt.findUnique({
                    where: { purchaseOrderId_idempotencyKey: { purchaseOrderId: id, idempotencyKey: dto.idempotencyKey } },
                });
                if (existing) {
                    if (receiptPayloadFingerprint(existing.payload) !== receiptPayloadFingerprint(normalizedLines)) {
                        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим составом приёмки');
                    }
                    const replayed = await tx.purchaseOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
                    if (!replayed)
                        throw new errors_1.ValidationError('purchase_order_not_found', `PO ${id} не найден`);
                    return { result: { ...replayed, idempotent: true, receiptId: existing.id }, events: [] };
                }
                const order = await tx.purchaseOrder.findUnique({
                    where: { id },
                    include: {
                        items: {
                            include: {
                                orderLineSupply: {
                                    include: { orderItem: { select: { orderId: true } } },
                                },
                            },
                        },
                    },
                });
                if (!order)
                    throw new errors_1.ValidationError('purchase_order_not_found', `PO ${id} не найден`);
                (0, purchase_order_state_1.assertCanReceive)(order.status);
                const byId = new Map(order.items.map((item) => [item.id, item]));
                for (const line of normalizedLines) {
                    const item = byId.get(line.itemId);
                    if (!item)
                        throw new errors_1.ValidationError('purchase_order_item_not_found', `Строка ${line.itemId} не принадлежит PO`);
                    const receiptQty = line.qty ?? line.imeis.length;
                    if (item.receivedQty + receiptQty > item.orderedQty) {
                        throw new errors_1.ConflictError('purchase_order_over_receipt', `По строке ${line.itemId} принято больше заказанного`);
                    }
                }
                const products = await tx.product.findMany({
                    where: { id: { in: [...new Set(normalizedLines.map((line) => byId.get(line.itemId).productId))] } },
                    select: { id: true, sku: true, name: true, trackingMode: true, supplyMode: true },
                });
                const productById = new Map(products.map((product) => [product.id, product]));
                for (const line of normalizedLines) {
                    const item = byId.get(line.itemId);
                    const product = productById.get(item.productId);
                    const supply = item.orderLineSupply;
                    const serialized = product.trackingMode === 'serialized';
                    if (serialized !== (line.imeis.length > 0)) {
                        throw new errors_1.ValidationError(serialized ? 'serialized_receipt_requires_imei' : 'product_not_serialized', serialized
                            ? `Для серийного товара ${product.sku} нужны IMEI`
                            : `Для количественного товара ${product.sku} нужно поле qty`);
                    }
                    if (!serialized && !supply) {
                        throw new errors_1.ConflictError('quantity_to_order_receipt_requires_allocation', `Количественную строку ${product.sku} этим маршрутом можно принять только в клиентскую поставочную аллокацию`);
                    }
                    if (product.supplyMode === 'to_order' && !supply) {
                        throw new errors_1.ConflictError('to_order_receipt_requires_allocation', `Заказной товар ${product.sku} нельзя принять в свободный склад без клиентской аллокации`);
                    }
                    if (supply && !['in_transit', 'late'].includes(supply.status)) {
                        throw new errors_1.ConflictError('order_line_supply_not_in_transit', `Поставка строки ${supply.orderItemId} должна находиться в пути перед приёмкой`);
                    }
                }
                const duplicateUnits = await tx.deviceUnit.findMany({ where: { imei: { in: allImeis } }, select: { imei: true } });
                if (duplicateUnits.length) {
                    throw new errors_1.ConflictError('imei_already_exists', `IMEI уже есть в базе: ${duplicateUnits.map((unit) => unit.imei).join(', ')}`);
                }
                const receipt = await tx.purchaseReceipt.create({
                    data: { purchaseOrderId: id, idempotencyKey: dto.idempotencyKey, actor, payload: normalizedLines },
                });
                const events = [];
                let receiptValue = 0;
                const nextReceived = new Map(order.items.map((item) => [item.id, item.receivedQty]));
                for (const line of normalizedLines) {
                    const item = byId.get(line.itemId);
                    const product = productById.get(item.productId);
                    const receiptQty = line.qty ?? line.imeis.length;
                    receiptValue += receiptQty * item.unitCost;
                    await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: receiptQty } } });
                    const movement = await tx.inventoryMovement.create({
                        data: { productId: item.productId, qty: receiptQty, type: 'received', to: order.location, reason: order.number, unitCost: item.unitCost, totalValue: receiptQty * item.unitCost },
                    });
                    if (product.trackingMode === 'serialized') {
                        await tx.deviceUnit.createMany({
                            data: line.imeis.map((imei) => ({
                                imei,
                                productId: item.productId,
                                status: item.orderLineSupply ? 'reserved' : 'in_stock',
                                orderId: item.orderLineSupply?.orderItem.orderId ?? null,
                                location: order.location,
                                grade: (line.grade ?? null),
                                acquisitionCost: item.unitCost,
                            })),
                        });
                    }
                    else if (item.orderLineSupply) {
                        await tx.supplyQuantityAllocation.create({
                            data: {
                                orderLineSupplyId: item.orderLineSupply.id,
                                purchaseReceiptId: receipt.id,
                                productId: item.productId,
                                location: order.location,
                                qty: receiptQty,
                                unitCost: item.unitCost,
                            },
                        });
                    }
                    const receivedQty = item.receivedQty + receiptQty;
                    nextReceived.set(item.id, receivedQty);
                    if (item.orderLineSupply) {
                        const supplyComplete = receivedQty === item.orderedQty;
                        await tx.orderLineSupply.update({
                            where: { id: item.orderLineSupply.id },
                            data: {
                                receivedQty,
                                ...(supplyComplete ? { status: 'received', actor } : {}),
                            },
                        });
                        if (supplyComplete) {
                            await tx.orderItem.update({
                                where: { id: item.orderLineSupply.orderItemId },
                                data: {
                                    fulfillmentStatus: 'received',
                                    ...(product.trackingMode === 'serialized' && line.imeis.length === 1
                                        ? { imei: line.imeis[0] }
                                        : {}),
                                },
                            });
                            events.push({
                                type: event_types_1.EventType.OrderLineSupplyReceived,
                                actor,
                                payload: {
                                    orderId: item.orderLineSupply.orderItem.orderId,
                                    orderItemId: item.orderLineSupply.orderItemId,
                                    purchaseOrderId: id,
                                    purchaseOrderItemId: item.id,
                                    receivedQty,
                                },
                                refs: [
                                    item.orderLineSupply.orderItem.orderId,
                                    item.orderLineSupply.orderItemId,
                                    id,
                                    item.id,
                                ],
                            });
                        }
                    }
                    events.push({
                        type: event_types_1.EventType.StockReceived,
                        actor,
                        payload: {
                            purchaseOrderId: id,
                            receiptId: receipt.id,
                            productId: item.productId,
                            qty: receiptQty,
                            location: order.location,
                            movementId: movement.id,
                            availability: item.orderLineSupply ? 'customer_reserved' : 'free_stock',
                            orderId: item.orderLineSupply?.orderItem.orderId ?? null,
                        },
                        refs: [id, receipt.id, item.productId, movement.id],
                    });
                    events.push(...line.imeis.map((imei) => ({
                        type: event_types_1.EventType.UnitReceived,
                        actor,
                        payload: { purchaseOrderId: id, receiptId: receipt.id, productId: item.productId, imei, location: order.location, grade: line.grade ?? null },
                        refs: [id, receipt.id, item.productId, imei],
                    })));
                }
                const accountingEntry = receiptValue > 0
                    ? await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                        idempotencyKey: `accounting:procurement.receipt:${receipt.id}`,
                        sourceType: 'procurement.receipt',
                        sourceRef: receipt.id,
                        description: `Оприходование закупки ${order.number}`,
                        point: order.location,
                        occurredAt: receipt.createdAt,
                        createdBy: actor,
                        lines: [
                            { accountCode: '1200', debit: receiptValue, memo: 'Поступление товарного запаса по PO' },
                            { accountCode: '2000', credit: receiptValue, memo: 'Обязательство перед поставщиком по PO' },
                        ],
                    })
                    : null;
                if (accountingEntry) {
                    await tx.purchaseReceipt.update({ where: { id: receipt.id }, data: { accountingEntryId: accountingEntry.id } });
                    events.push({
                        type: event_types_1.EventType.AccountingEntryPosted,
                        actor,
                        payload: { accountingEntryId: accountingEntry.id, sourceType: 'procurement.receipt', sourceRef: receipt.id, amount: receiptValue, supplierId: order.supplierId },
                        refs: [accountingEntry.id, receipt.id, id, order.supplierId],
                    });
                }
                const complete = order.items.every((item) => nextReceived.get(item.id) === item.orderedQty);
                const status = complete ? 'received' : 'receiving';
                const updated = await tx.purchaseOrder.update({
                    where: { id },
                    data: { status, ...(complete ? { receivedAt: new Date() } : {}) },
                    include: DETAIL_INCLUDE,
                });
                events.push({
                    type: complete ? event_types_1.EventType.PurchaseOrderReceived : event_types_1.EventType.PurchaseOrderReceiving,
                    actor,
                    payload: {
                        purchaseOrderId: id,
                        receiptId: receipt.id,
                        status,
                        units: normalizedLines.reduce((sum, line) => sum + (line.qty ?? line.imeis.length), 0),
                    },
                    refs: [id, receipt.id, order.supplierId, ...allImeis],
                });
                return { result: { ...updated, idempotent: false, receiptId: receipt.id }, events };
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                throw new errors_1.ConflictError('imei_already_exists', 'Один или несколько IMEI уже приняты');
            }
            throw error;
        }
    }
    listInvoices(status) {
        const allowed = ['draft', 'approved', 'partially_paid', 'paid', 'cancelled'];
        if (status && !allowed.includes(status)) {
            throw new errors_1.ValidationError('invalid_supplier_invoice_status', `Неизвестный статус счета поставщика: ${status}`);
        }
        return this.prisma.supplierInvoice.findMany({
            where: status ? { status: status } : undefined,
            include: { supplier: true, purchaseOrder: { select: { id: true, number: true, status: true } }, accountingEntry: { include: { lines: true } }, payments: { orderBy: { paidAt: 'asc' } }, advanceAllocations: { include: { advance: { select: { id: true, paymentReference: true } } }, orderBy: { appliedAt: 'asc' } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async createSupplierInvoice(dto, actor) {
        const existing = await this.prisma.supplierInvoice.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing)
            return replaySupplierInvoice(existing, dto);
        return this.audit.transaction(async (tx) => {
            const [supplier, order] = await Promise.all([
                tx.supplier.findUnique({ where: { id: dto.supplierId } }),
                tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId }, include: { items: true } }),
            ]);
            if (!supplier)
                throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
            if (!order)
                throw new errors_1.ValidationError('purchase_order_not_found', `PO ${dto.purchaseOrderId} не найден`);
            if (order.supplierId !== supplier.id)
                throw new errors_1.ConflictError('supplier_invoice_supplier_mismatch', 'Счёт не соответствует поставщику PO');
            await tx.$queryRaw `SELECT id FROM "PurchaseOrder" WHERE id = ${order.id} FOR UPDATE`;
            const match = receiptMatch(order.items);
            if (match.receivedQty === 0)
                throw new errors_1.ConflictError('supplier_invoice_no_receipt', 'Нельзя сопоставить счёт без принятого товара');
            const invoiced = await tx.supplierInvoice.aggregate({
                _sum: { amount: true },
                where: { purchaseOrderId: order.id, status: { not: 'cancelled' } },
            });
            const alreadyInvoiced = invoiced._sum?.amount ?? 0;
            if (alreadyInvoiced + dto.amount > match.value) {
                throw new errors_1.ConflictError('supplier_invoice_over_receipt', `По поставке уже выставлено ${alreadyInvoiced} из ${match.value} — счёт на ${dto.amount} превышает принятое`);
            }
            if (alreadyInvoiced === 0 && dto.amount !== match.value)
                throw new errors_1.ConflictError('supplier_invoice_three_way_mismatch', `Счёт ${dto.amount} не совпадает с принятой стоимостью ${match.value}`);
            const invoice = await tx.supplierInvoice.create({
                data: {
                    supplierId: supplier.id,
                    purchaseOrderId: order.id,
                    invoiceNumber: dto.invoiceNumber.trim(),
                    idempotencyKey: dto.idempotencyKey,
                    amount: dto.amount,
                    matchedReceiptValue: match.value,
                    dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                    createdBy: actor,
                },
                include: { supplier: true, purchaseOrder: { select: { id: true, number: true, status: true } } },
            });
            return {
                result: invoice,
                events: [{
                        type: 'supplier.invoice.created',
                        actor,
                        payload: { invoiceId: invoice.id, supplierId: supplier.id, purchaseOrderId: order.id, amount: invoice.amount, matchedReceiptValue: match.value },
                        refs: [invoice.id, supplier.id, order.id],
                    }],
            };
        });
    }
    async approveSupplierInvoice(id, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplierInvoice" WHERE id = ${id} FOR UPDATE`;
            const invoice = await tx.supplierInvoice.findUnique({ where: { id }, include: { purchaseOrder: { include: { items: true } } } });
            if (!invoice)
                throw new errors_1.ValidationError('supplier_invoice_not_found', `Счёт ${id} не найден`);
            if (invoice.status === 'approved' || invoice.status === 'paid')
                return { result: invoice, events: [] };
            if (invoice.status !== 'draft')
                throw new errors_1.ConflictError('supplier_invoice_state', 'Счёт нельзя утвердить в текущем статусе');
            const match = receiptMatch(invoice.purchaseOrder.items);
            if (match.value !== invoice.amount)
                throw new errors_1.ConflictError('supplier_invoice_three_way_mismatch', 'После приёмки сумма счёта больше не совпадает');
            const approved = await tx.supplierInvoice.update({ where: { id }, data: { status: 'approved', approvedBy: actor, approvedAt: new Date() } });
            return { result: approved, events: [{ type: 'supplier.invoice.approved', actor, payload: { invoiceId: id, amount: approved.amount }, refs: [id, invoice.supplierId, invoice.purchaseOrderId] }] };
        });
    }
    async paySupplierInvoice(id, dto, actor) {
        return this.recordSupplierInvoicePayment(id, {
            idempotencyKey: `supplier.invoice.payment:${id}:${dto.paymentKey}`,
            paymentKey: dto.paymentKey,
            paymentAccountCode: dto.paymentAccountCode,
            paymentReference: dto.paymentReference,
        }, actor, true);
    }
    async createSupplierInvoicePayment(id, dto, actor) {
        return this.recordSupplierInvoicePayment(id, dto, actor, false);
    }
    async recordSupplierInvoicePayment(id, dto, actor, settleRemaining) {
        const existing = await this.prisma.supplierInvoicePayment.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { invoice: true },
        });
        if (existing)
            return replaySupplierInvoicePayment(existing, dto);
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplierInvoice" WHERE id = ${id} FOR UPDATE`;
            const invoice = await tx.supplierInvoice.findUnique({ where: { id } });
            if (!invoice)
                throw new errors_1.ValidationError('supplier_invoice_not_found', `Счёт ${id} не найден`);
            if (invoice.status === 'paid') {
                if (invoice.paymentKey === dto.paymentKey && invoice.paymentAccountCode === dto.paymentAccountCode && invoice.paymentReference === dto.paymentReference) {
                    return { result: { ...invoice, idempotent: true }, events: [] };
                }
                throw new errors_1.ConflictError('supplier_invoice_not_payable', 'Счёт поставщика уже погашен');
            }
            if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
                throw new errors_1.ConflictError('supplier_invoice_not_approved', 'Оплатить можно только утверждённый счёт');
            }
            const duplicate = await tx.supplierInvoicePayment.findUnique({ where: { paymentKey: dto.paymentKey } });
            if (duplicate)
                throw new errors_1.ConflictError('supplier_invoice_payment_key_reused', 'Ключ оплаты уже использован');
            const [payments, creditNotes, advanceAllocations] = await Promise.all([
                tx.supplierInvoicePayment.findMany({ where: { invoiceId: id }, orderBy: { paidAt: 'asc' } }),
                tx.supplierCreditNote.findMany({ where: { invoiceId: id, status: 'applied' }, select: { amount: true } }),
                tx.supplierInvoiceAdvanceAllocation.findMany({ where: { invoiceId: id }, select: { amount: true } }),
            ]);
            const paidBefore = payments.reduce((sum, payment) => sum + payment.amount, 0);
            const creditApplied = creditNotes.reduce((sum, note) => sum + note.amount, 0);
            const advanceApplied = advanceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
            const remaining = Math.max(0, invoice.amount - paidBefore - creditApplied - advanceApplied);
            const amount = settleRemaining ? remaining : dto.amount;
            if (!amount || amount > remaining) {
                throw new errors_1.ConflictError('supplier_invoice_payment_exceeds_balance', `Оплата превышает остаток счёта: ${remaining}`);
            }
            const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                idempotencyKey: `accounting:supplier-invoice.payment:${id}:${dto.paymentKey}`,
                sourceType: 'supplier.invoice.payment',
                sourceRef: `${id}:${dto.paymentKey}`,
                description: `Оплата счёта поставщика ${id}`,
                occurredAt: new Date(),
                createdBy: actor,
                lines: [
                    { accountCode: '2000', debit: amount, memo: 'Погашение обязательства перед поставщиком' },
                    { accountCode: dto.paymentAccountCode, credit: amount, memo: `Оплата поставщику: ${dto.paymentReference}` },
                ],
            });
            const payment = await tx.supplierInvoicePayment.create({
                data: {
                    invoiceId: id,
                    idempotencyKey: dto.idempotencyKey,
                    paymentKey: dto.paymentKey,
                    amount,
                    paymentAccountCode: dto.paymentAccountCode,
                    paymentReference: dto.paymentReference,
                    paidBy: actor,
                    accountingEntryId: accountingEntry.id,
                },
            });
            const status = paidBefore + creditApplied + advanceApplied + amount >= invoice.amount ? 'paid' : 'partially_paid';
            const paid = await tx.supplierInvoice.update({
                where: { id },
                data: {
                    status,
                    ...(status === 'paid' ? { paymentKey: dto.paymentKey, paymentAccountCode: dto.paymentAccountCode, paymentReference: dto.paymentReference, paidBy: actor, paidAt: payment.paidAt, accountingEntryId: accountingEntry.id } : {}),
                },
            });
            return {
                result: { ...paid, payment, idempotent: false },
                events: [
                    { type: status === 'paid' ? 'supplier.invoice.paid' : 'supplier.invoice.partially_paid', actor, payload: { invoiceId: id, amount, outstanding: invoice.amount - paidBefore - creditApplied - advanceApplied - amount, paymentKey: dto.paymentKey, accountingEntryId: accountingEntry.id }, refs: [id, invoice.supplierId, invoice.purchaseOrderId, payment.id] },
                    { type: event_types_1.EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'supplier.invoice.payment', sourceRef: `${id}:${dto.paymentKey}`, amount }, refs: [accountingEntry.id, id, payment.id] },
                ],
            };
        });
    }
    listSupplierAdvances(supplierId) {
        return this.prisma.supplierAdvance.findMany({
            where: supplierId ? { supplierId } : undefined,
            include: {
                supplier: { select: { id: true, name: true } },
                accountingEntry: { include: { lines: true } },
                allocations: {
                    include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } },
                    orderBy: { appliedAt: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async createSupplierAdvance(dto, actor) {
        const existing = await this.prisma.supplierAdvance.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { accountingEntry: { include: { lines: true } }, allocations: true },
        });
        if (existing)
            return replaySupplierAdvance(existing, dto);
        try {
            return await this.audit.transaction(async (tx) => {
                const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true } });
                if (!supplier)
                    throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
                const paymentKey = await tx.supplierAdvance.findUnique({ where: { paymentKey: dto.paymentKey }, select: { id: true } });
                if (paymentKey)
                    throw new errors_1.ConflictError('supplier_advance_payment_key_reused', 'Ключ аванса уже использован');
                const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:supplier-advance:${dto.idempotencyKey}`,
                    sourceType: 'supplier.advance.created',
                    sourceRef: dto.paymentKey,
                    description: `Аванс поставщику ${dto.paymentReference}`,
                    occurredAt: new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: '1300', debit: dto.amount, memo: 'Аванс поставщику' },
                        { accountCode: dto.paymentAccountCode, credit: dto.amount, memo: `Перечисление аванса: ${dto.paymentReference}` },
                    ],
                });
                const advance = await tx.supplierAdvance.create({
                    data: {
                        supplierId: supplier.id,
                        idempotencyKey: dto.idempotencyKey,
                        paymentKey: dto.paymentKey,
                        amount: dto.amount,
                        paymentAccountCode: dto.paymentAccountCode,
                        paymentReference: dto.paymentReference.trim(),
                        paidBy: actor,
                        accountingEntryId: accountingEntry.id,
                    },
                    include: { supplier: { select: { id: true, name: true } }, accountingEntry: { include: { lines: true } }, allocations: true },
                });
                return {
                    result: { ...advance, idempotent: false },
                    events: [
                        { type: 'supplier.advance.created', actor, payload: { advanceId: advance.id, supplierId: supplier.id, amount: advance.amount, paymentKey: advance.paymentKey, accountingEntryId: accountingEntry.id }, refs: [advance.id, supplier.id, accountingEntry.id] },
                        { type: event_types_1.EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'supplier.advance.created', sourceRef: dto.paymentKey, amount: dto.amount }, refs: [accountingEntry.id, advance.id, supplier.id] },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const replay = await this.prisma.supplierAdvance.findUnique({
                    where: { idempotencyKey: dto.idempotencyKey },
                    include: { accountingEntry: { include: { lines: true } }, allocations: true },
                });
                if (replay)
                    return replaySupplierAdvance(replay, dto);
            }
            throw error;
        }
    }
    async applySupplierAdvance(id, dto, actor) {
        const existing = await this.prisma.supplierInvoiceAdvanceAllocation.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { advance: true, invoice: true, accountingEntry: { include: { lines: true } } },
        });
        if (existing)
            return replaySupplierAdvanceAllocation(existing, id, dto);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "SupplierAdvance" WHERE id = ${id} FOR UPDATE`;
                const advance = await tx.supplierAdvance.findUnique({ where: { id }, include: { allocations: true } });
                if (!advance)
                    throw new errors_1.ValidationError('supplier_advance_not_found', `Аванс ${id} не найден`);
                if (advance.status === 'cancelled')
                    throw new errors_1.ConflictError('supplier_advance_cancelled', 'Отменённый аванс нельзя применить');
                const duplicate = await tx.supplierInvoiceAdvanceAllocation.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
                if (duplicate)
                    throw new errors_1.ConflictError('supplier_advance_allocation_idempotency_reused', 'Ключ зачёта уже использован');
                await tx.$queryRaw `SELECT id FROM "SupplierInvoice" WHERE id = ${dto.invoiceId} FOR UPDATE`;
                const invoice = await tx.supplierInvoice.findUnique({ where: { id: dto.invoiceId } });
                if (!invoice)
                    throw new errors_1.ValidationError('supplier_invoice_not_found', `Счёт ${dto.invoiceId} не найден`);
                if (invoice.supplierId !== advance.supplierId)
                    throw new errors_1.ConflictError('supplier_advance_supplier_mismatch', 'Аванс и счёт принадлежат разным поставщикам');
                if (invoice.status !== 'approved' && invoice.status !== 'partially_paid')
                    throw new errors_1.ConflictError('supplier_invoice_not_payable', 'Применить аванс можно только к утверждённому счёту');
                const [advanceAllocations, payments, creditNotes, invoiceAllocations] = await Promise.all([
                    tx.supplierInvoiceAdvanceAllocation.findMany({ where: { advanceId: id }, select: { amount: true } }),
                    tx.supplierInvoicePayment.findMany({ where: { invoiceId: dto.invoiceId }, select: { amount: true } }),
                    tx.supplierCreditNote.findMany({ where: { invoiceId: dto.invoiceId, status: 'applied' }, select: { amount: true } }),
                    tx.supplierInvoiceAdvanceAllocation.findMany({ where: { invoiceId: dto.invoiceId }, select: { amount: true } }),
                ]);
                const appliedBefore = advanceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
                const invoicePaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
                const creditApplied = creditNotes.reduce((sum, note) => sum + note.amount, 0);
                const invoiceAdvanceApplied = invoiceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
                const advanceRemaining = advance.amount - appliedBefore;
                const invoiceRemaining = invoice.amount - invoicePaid - creditApplied - invoiceAdvanceApplied;
                if (dto.amount > advanceRemaining)
                    throw new errors_1.ConflictError('supplier_advance_exceeds_balance', `Сумма превышает остаток аванса: ${advanceRemaining}`);
                if (dto.amount > invoiceRemaining)
                    throw new errors_1.ConflictError('supplier_advance_exceeds_invoice', `Сумма превышает остаток счёта: ${invoiceRemaining}`);
                const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:supplier-advance.apply:${id}:${dto.idempotencyKey}`,
                    sourceType: 'supplier.advance.applied',
                    sourceRef: `${id}:${dto.invoiceId}:${dto.idempotencyKey}`,
                    description: `Зачёт аванса по счёту ${dto.invoiceId}`,
                    occurredAt: new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: '2000', debit: dto.amount, memo: 'Зачёт аванса в погашение обязательства' },
                        { accountCode: '1300', credit: dto.amount, memo: 'Уменьшение аванса поставщику' },
                    ],
                });
                const allocation = await tx.supplierInvoiceAdvanceAllocation.create({
                    data: { advanceId: id, invoiceId: dto.invoiceId, idempotencyKey: dto.idempotencyKey, amount: dto.amount, accountingEntryId: accountingEntry.id, appliedBy: actor },
                    include: { advance: true, invoice: true, accountingEntry: { include: { lines: true } } },
                });
                const appliedAmount = appliedBefore + dto.amount;
                const nextAdvanceStatus = appliedAmount >= advance.amount ? 'applied' : 'partially_applied';
                const updatedAdvance = await tx.supplierAdvance.update({ where: { id }, data: { appliedAmount, status: nextAdvanceStatus } });
                const nextInvoiceStatus = invoicePaid + creditApplied + invoiceAdvanceApplied + dto.amount >= invoice.amount ? 'paid' : 'partially_paid';
                const updatedInvoice = await tx.supplierInvoice.update({ where: { id: dto.invoiceId }, data: { status: nextInvoiceStatus } });
                return {
                    result: { advance: updatedAdvance, allocation, invoice: updatedInvoice, idempotent: false },
                    events: [
                        { type: 'supplier.advance.applied', actor, payload: { advanceId: id, allocationId: allocation.id, invoiceId: dto.invoiceId, amount: dto.amount, accountingEntryId: accountingEntry.id, outstanding: Math.max(0, invoiceRemaining - dto.amount) }, refs: [id, allocation.id, dto.invoiceId, accountingEntry.id] },
                        { type: event_types_1.EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'supplier.advance.applied', sourceRef: `${id}:${dto.invoiceId}:${dto.idempotencyKey}`, amount: dto.amount }, refs: [accountingEntry.id, id, dto.invoiceId, allocation.id] },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const replay = await this.prisma.supplierInvoiceAdvanceAllocation.findUnique({
                    where: { idempotencyKey: dto.idempotencyKey },
                    include: { advance: true, invoice: true, accountingEntry: { include: { lines: true } } },
                });
                if (replay)
                    return replaySupplierAdvanceAllocation(replay, id, dto);
            }
            throw error;
        }
    }
    listSupplierStatements(supplierId) {
        return this.prisma.supplierStatement.findMany({
            where: supplierId ? { supplierId } : undefined,
            include: {
                supplier: { select: { id: true, name: true } },
                lines: {
                    include: { matchedEntry: { select: { id: true, sourceType: true, sourceRef: true, occurredAt: true } } },
                    orderBy: { occurredAt: 'asc' },
                },
            },
            orderBy: { periodStart: 'desc' },
            take: 120,
        });
    }
    async importSupplierStatement(dto, actor) {
        const periodStart = new Date(dto.periodStart);
        const periodEnd = new Date(dto.periodEnd);
        if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart >= periodEnd) {
            throw new errors_1.ValidationError('invalid_supplier_statement_period', 'Период supplier-выписки некорректен');
        }
        const normalizedLines = dto.lines.map((line) => ({
            externalId: line.externalId.trim(),
            occurredAt: new Date(line.occurredAt),
            amount: line.amount,
            reference: line.reference?.trim() || null,
        }));
        if (normalizedLines.some((line) => !line.externalId || Number.isNaN(line.occurredAt.getTime()) || line.amount === 0) || new Set(normalizedLines.map((line) => line.externalId)).size !== normalizedLines.length) {
            throw new errors_1.ValidationError('invalid_supplier_statement_lines', 'Строки supplier-выписки должны иметь уникальный внешний ID, дату и ненулевую сумму');
        }
        if (dto.openingBalance + normalizedLines.reduce((sum, line) => sum + line.amount, 0) !== dto.closingBalance) {
            throw new errors_1.ConflictError('supplier_statement_balance_mismatch', 'Начальный баланс плюс движения не равен конечному балансу');
        }
        const existing = await this.prisma.supplierStatement.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { lines: true } });
        if (existing)
            return replaySupplierStatement(existing, dto);
        try {
            return await this.audit.transaction(async (tx) => {
                const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true } });
                if (!supplier)
                    throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
                const statement = await tx.supplierStatement.create({
                    data: {
                        supplierId: supplier.id,
                        statementNumber: dto.statementNumber.trim(),
                        idempotencyKey: dto.idempotencyKey,
                        periodStart,
                        periodEnd,
                        openingBalance: dto.openingBalance,
                        closingBalance: dto.closingBalance,
                        createdBy: actor,
                        lines: { create: normalizedLines },
                    },
                    include: { supplier: { select: { id: true, name: true } }, lines: { orderBy: { occurredAt: 'asc' } } },
                });
                return {
                    result: { ...statement, idempotent: false },
                    events: [{ type: 'supplier.statement.imported', actor, payload: { statementId: statement.id, supplierId: supplier.id, statementNumber: statement.statementNumber, lineCount: statement.lines.length, closingBalance: statement.closingBalance }, refs: [statement.id, supplier.id] }],
                };
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const replay = await this.prisma.supplierStatement.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { lines: true } });
                if (replay)
                    return replaySupplierStatement(replay, dto);
            }
            throw error;
        }
    }
    async reconcileSupplierStatementLine(id, dto, actor) {
        const existing = await this.prisma.supplierStatementLine.findUnique({
            where: { reconciliationKey: dto.idempotencyKey },
            include: { statement: true, matchedEntry: true },
        });
        if (existing)
            return replaySupplierStatementLine(existing, id, dto);
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplierStatementLine" WHERE id = ${id} FOR UPDATE`;
            const line = await tx.supplierStatementLine.findUnique({ where: { id }, include: { statement: true } });
            if (!line)
                throw new errors_1.ValidationError('supplier_statement_line_not_found', `Строка supplier-выписки ${id} не найдена`);
            if (line.reconciliationKey === dto.idempotencyKey)
                return { result: { ...line, idempotent: true }, events: [] };
            if (line.status === 'matched')
                throw new errors_1.ConflictError('supplier_statement_line_matched', 'Строка уже сверена другим ключом');
            const entry = await tx.accountingJournalEntry.findUnique({
                where: { id: dto.journalEntryId },
                include: {
                    lines: true,
                    purchaseReceipt: { select: { purchaseOrder: { select: { supplierId: true } } } },
                    supplierInvoicePayment: { select: { invoice: { select: { supplierId: true } } } },
                    supplierAdvanceAllocation: { select: { invoice: { select: { supplierId: true } } } },
                    supplierCreditNote: { select: { supplierId: true } },
                    landedCost: { select: { supplierId: true } },
                },
            });
            if (!entry)
                throw new errors_1.ValidationError('accounting_entry_not_found', `Проводка ${dto.journalEntryId} не найдена`);
            if (entry.occurredAt < line.statement.periodStart || entry.occurredAt >= line.statement.periodEnd)
                throw new errors_1.ConflictError('supplier_statement_entry_outside_period', 'Проводка находится вне периода supplier-выписки');
            const movement = entry.lines.filter((current) => current.accountCode === '2000').reduce((sum, current) => sum + current.debit - current.credit, 0);
            if (movement !== -line.amount)
                throw new errors_1.ConflictError('supplier_statement_amount_mismatch', 'Движение по счету 2000 не совпадает со строкой supplier-выписки');
            const entrySupplierId = entry.purchaseReceipt?.purchaseOrder.supplierId
                ?? entry.supplierInvoicePayment?.invoice.supplierId
                ?? entry.supplierAdvanceAllocation?.invoice.supplierId
                ?? entry.supplierCreditNote?.supplierId
                ?? entry.landedCost?.supplierId;
            if (!entrySupplierId)
                throw new errors_1.ConflictError('supplier_statement_entry_supplier_unknown', 'Нельзя определить поставщика проводки');
            if (entrySupplierId !== line.statement.supplierId)
                throw new errors_1.ConflictError('supplier_statement_supplier_mismatch', 'Проводка принадлежит другому поставщику');
            const duplicate = await tx.supplierStatementLine.findUnique({ where: { matchedEntryId: entry.id }, select: { id: true } });
            if (duplicate && duplicate.id !== id)
                throw new errors_1.ConflictError('accounting_entry_already_reconciled', 'Проводка уже связана с другой строкой supplier-выписки');
            const matched = await tx.supplierStatementLine.update({ where: { id }, data: { status: 'matched', reconciliationKey: dto.idempotencyKey, matchedEntryId: entry.id, matchedBy: actor, matchedAt: new Date() } });
            const remaining = await tx.supplierStatementLine.count({ where: { statementId: line.statementId, status: { not: 'matched' } } });
            const statement = await tx.supplierStatement.update({ where: { id: line.statementId }, data: { status: remaining === 0 ? 'reconciled' : 'imported' } });
            return {
                result: { ...matched, statement, matchedEntry: { id: entry.id, sourceType: entry.sourceType, sourceRef: entry.sourceRef }, idempotent: false },
                events: [{ type: 'supplier.statement.line_reconciled', actor, payload: { lineId: id, statementId: line.statementId, journalEntryId: entry.id, amount: line.amount, supplierId: line.statement.supplierId }, refs: [id, line.statementId, entry.id, line.statement.supplierId] }],
            };
        });
    }
    listLandedCosts(purchaseOrderId) {
        return this.prisma.landedCost.findMany({
            where: purchaseOrderId ? { purchaseOrderId } : undefined,
            include: {
                supplier: { select: { id: true, name: true } },
                purchaseOrder: { select: { id: true, number: true, location: true } },
                accountingEntry: { include: { lines: true } },
                allocations: {
                    include: { unit: { select: { imei: true, status: true, acquisitionCost: true } }, product: { select: { id: true, sku: true, name: true } } },
                    orderBy: { imei: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async createLandedCost(dto, actor) {
        const documentNumber = dto.documentNumber.trim();
        const description = dto.description.trim();
        if (!documentNumber || !description)
            throw new errors_1.ValidationError('landed_cost_fields_required', 'Укажите документ и описание landed cost');
        const existing = await this.prisma.landedCost.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { allocations: true, accountingEntry: { include: { lines: true } } },
        });
        if (existing)
            return replayLandedCost(existing, dto, documentNumber, description);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "PurchaseOrder" WHERE id = ${dto.purchaseOrderId} FOR UPDATE`;
                const replay = await tx.landedCost.findUnique({
                    where: { idempotencyKey: dto.idempotencyKey },
                    include: { allocations: true, accountingEntry: { include: { lines: true } } },
                });
                if (replay)
                    return { result: replayLandedCost(replay, dto, documentNumber, description), events: [] };
                const order = await tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId }, include: { items: true, receipts: true } });
                if (!order)
                    throw new errors_1.ValidationError('purchase_order_not_found', `PO ${dto.purchaseOrderId} не найден`);
                if (order.status === 'cancelled')
                    throw new errors_1.ConflictError('landed_cost_purchase_order_cancelled', 'Нельзя капитализировать расходы отменённого PO');
                const itemsById = new Map(order.items.map((item) => [item.id, item]));
                const received = [];
                for (const receipt of order.receipts) {
                    if (!Array.isArray(receipt.payload))
                        continue;
                    for (const rawLine of receipt.payload) {
                        if (!rawLine || typeof rawLine !== 'object')
                            throw new errors_1.ValidationError('landed_cost_receipt_payload_invalid', 'Найден некорректный payload приёмки');
                        const line = rawLine;
                        const item = typeof line.itemId === 'string' ? itemsById.get(line.itemId) : undefined;
                        if (!item || !Array.isArray(line.imeis))
                            throw new errors_1.ValidationError('landed_cost_receipt_payload_invalid', 'Строка приёмки не соответствует PO');
                        for (const rawImei of line.imeis) {
                            if (typeof rawImei !== 'string' || !rawImei.trim())
                                throw new errors_1.ValidationError('landed_cost_imei_invalid', 'В приёмке найден пустой IMEI');
                            received.push({ imei: rawImei.trim(), productId: item.productId, baseCost: item.unitCost });
                        }
                    }
                }
                if (received.length === 0)
                    throw new errors_1.ConflictError('landed_cost_no_received_units', 'Сначала оприходуйте хотя бы одну позицию PO');
                if (new Set(received.map((unit) => unit.imei)).size !== received.length)
                    throw new errors_1.ConflictError('landed_cost_duplicate_unit', 'Один IMEI повторяется в истории приёмки');
                const imeis = received.map((unit) => unit.imei);
                await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE imei IN (${client_1.Prisma.join(imeis)}) FOR UPDATE`;
                const units = await tx.deviceUnit.findMany({ where: { imei: { in: imeis } }, select: { id: true, imei: true, productId: true, status: true, acquisitionCost: true } });
                const unitsByImei = new Map(units.map((unit) => [unit.imei, unit]));
                if (units.length !== received.length)
                    throw new errors_1.ConflictError('landed_cost_unit_missing', 'Не все принятые единицы найдены в складе');
                const unavailable = units.filter((unit) => unit.status !== 'in_stock' && unit.status !== 'reserved');
                if (unavailable.length)
                    throw new errors_1.ConflictError('landed_cost_unit_not_on_hand', 'Landed cost можно применить только к единицам на остатке');
                if (units.some((unit) => unit.acquisitionCost === null))
                    throw new errors_1.ConflictError('landed_cost_missing_acquisition_cost', 'У единицы отсутствует базовая себестоимость');
                const totalBase = received.reduce((sum, unit) => sum + unit.baseCost, 0);
                if (!Number.isSafeInteger(totalBase) || totalBase <= 0)
                    throw new errors_1.ValidationError('landed_cost_base_invalid', 'База распределения landed cost должна быть положительной');
                const shares = received.map((unit) => ({ ...unit, allocatedAmount: Math.floor((dto.amount * unit.baseCost) / totalBase) }));
                let remainder = dto.amount - shares.reduce((sum, unit) => sum + unit.allocatedAmount, 0);
                for (const share of [...shares].sort((a, b) => a.imei.localeCompare(b.imei))) {
                    if (remainder <= 0)
                        break;
                    share.allocatedAmount += 1;
                    remainder -= 1;
                }
                if (remainder !== 0)
                    throw new errors_1.ValidationError('landed_cost_allocation_failed', 'Не удалось распределить landed cost без потери копеек');
                const landedCostId = (0, node_crypto_1.randomUUID)();
                const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:procurement.landed-cost:${landedCostId}`,
                    sourceType: 'procurement.landed-cost',
                    sourceRef: landedCostId,
                    description,
                    point: order.location,
                    documentAmount: dto.amount,
                    baseAmount: dto.amount,
                    occurredAt: new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: '1200', debit: dto.amount, memo: 'Капитализация дополнительных затрат в товарный запас' },
                        { accountCode: dto.creditAccountCode, credit: dto.amount, memo: 'Источник дополнительных затрат закупки' },
                    ],
                });
                const landedCost = await tx.landedCost.create({
                    data: {
                        id: landedCostId,
                        purchaseOrderId: order.id,
                        supplierId: order.supplierId,
                        idempotencyKey: dto.idempotencyKey,
                        documentNumber,
                        amount: dto.amount,
                        creditAccountCode: dto.creditAccountCode,
                        description,
                        appliedBy: actor,
                        accountingEntryId: accountingEntry.id,
                        allocations: {
                            create: shares.map((share) => {
                                const unit = unitsByImei.get(share.imei);
                                return {
                                    unitId: unit.id,
                                    imei: share.imei,
                                    productId: share.productId,
                                    baseCost: share.baseCost,
                                    allocatedAmount: share.allocatedAmount,
                                    resultingCost: unit.acquisitionCost + share.allocatedAmount,
                                };
                            }),
                        },
                    },
                    include: { allocations: true, accountingEntry: { include: { lines: true } } },
                });
                for (const share of shares) {
                    const unit = unitsByImei.get(share.imei);
                    await tx.deviceUnit.update({ where: { id: unit.id }, data: { acquisitionCost: { increment: share.allocatedAmount } } });
                }
                const productTotals = new Map();
                for (const share of shares)
                    productTotals.set(share.productId, (productTotals.get(share.productId) ?? 0) + share.allocatedAmount);
                for (const [productId, totalValue] of productTotals) {
                    await tx.inventoryMovement.create({
                        data: { productId, qty: 0, valuationQty: 0, type: 'received', to: order.location, reason: `${documentNumber}:landed-cost`, totalValue },
                    });
                }
                return {
                    result: { ...landedCost, idempotent: false },
                    events: [
                        { type: 'procurement.landed_cost.applied', actor, payload: { landedCostId, purchaseOrderId: order.id, supplierId: order.supplierId, amount: dto.amount, allocations: shares.length }, refs: [landedCostId, order.id, order.supplierId, accountingEntry.id] },
                        { type: event_types_1.EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'procurement.landed-cost', sourceRef: landedCostId, amount: dto.amount }, refs: [accountingEntry.id, landedCostId, order.id, order.supplierId] },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const replay = await this.prisma.landedCost.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { allocations: true, accountingEntry: { include: { lines: true } } } });
                if (replay)
                    return replayLandedCost(replay, dto, documentNumber, description);
            }
            throw error;
        }
    }
    listCreditNotes(supplierId) {
        return this.prisma.supplierCreditNote.findMany({
            where: supplierId ? { supplierId } : undefined,
            include: { supplier: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true, status: true } }, accountingEntry: { include: { lines: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async createCreditNote(dto, actor) {
        const existing = await this.prisma.supplierCreditNote.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing)
            return replayCreditNote(existing, dto);
        return this.audit.transaction(async (tx) => {
            const invoice = await tx.supplierInvoice.findUnique({ where: { id: dto.invoiceId }, include: { creditNotes: true } });
            if (!invoice)
                throw new errors_1.ValidationError('supplier_invoice_not_found', `Счёт ${dto.invoiceId} не найден`);
            if (invoice.supplierId !== dto.supplierId)
                throw new errors_1.ConflictError('credit_note_supplier_mismatch', 'Кредит-нота не соответствует поставщику счёта');
            if (invoice.status === 'cancelled')
                throw new errors_1.ConflictError('credit_note_invoice_cancelled', 'Нельзя оформить кредит-ноту по отменённому счёту');
            const committed = invoice.creditNotes.filter((note) => note.status !== 'cancelled').reduce((sum, note) => sum + note.amount, 0);
            if (committed + dto.amount > invoice.amount)
                throw new errors_1.ConflictError('credit_note_exceeds_invoice', 'Сумма кредит-нот превышает сумму счёта');
            const note = await tx.supplierCreditNote.create({
                data: { supplierId: dto.supplierId, invoiceId: dto.invoiceId, noteNumber: dto.noteNumber.trim(), idempotencyKey: dto.idempotencyKey, amount: dto.amount, reason: dto.reason.trim(), createdBy: actor },
                include: { supplier: { select: { id: true, name: true } }, invoice: { select: { id: true, invoiceNumber: true, status: true } } },
            });
            return { result: note, events: [{ type: 'supplier.credit_note.created', actor, payload: { creditNoteId: note.id, invoiceId: note.invoiceId, amount: note.amount }, refs: [note.id, note.invoiceId, note.supplierId] }] };
        });
    }
    async approveCreditNote(id, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplierCreditNote" WHERE id = ${id} FOR UPDATE`;
            const note = await tx.supplierCreditNote.findUnique({ where: { id }, include: { invoice: { include: { creditNotes: true } } } });
            if (!note)
                throw new errors_1.ValidationError('supplier_credit_note_not_found', `Кредит-нота ${id} не найдена`);
            if (note.status === 'approved' || note.status === 'applied')
                return { result: note, events: [] };
            if (note.status !== 'draft')
                throw new errors_1.ConflictError('credit_note_state', 'Кредит-ноту нельзя утвердить в текущем статусе');
            const committed = note.invoice.creditNotes.filter((current) => current.id !== id && current.status !== 'cancelled').reduce((sum, current) => sum + current.amount, 0);
            if (committed + note.amount > note.invoice.amount)
                throw new errors_1.ConflictError('credit_note_exceeds_invoice', 'Сумма кредит-нот превышает сумму счёта');
            const approved = await tx.supplierCreditNote.update({ where: { id }, data: { status: 'approved', approvedBy: actor, approvedAt: new Date() } });
            return { result: approved, events: [{ type: 'supplier.credit_note.approved', actor, payload: { creditNoteId: id, amount: approved.amount }, refs: [id, note.invoiceId, note.supplierId] }] };
        });
    }
    async applyCreditNote(id, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplierCreditNote" WHERE id = ${id} FOR UPDATE`;
            const note = await tx.supplierCreditNote.findUnique({ where: { id }, include: { invoice: true } });
            if (!note)
                throw new errors_1.ValidationError('supplier_credit_note_not_found', `Кредит-нота ${id} не найдена`);
            if (note.status === 'applied')
                return { result: note, events: [] };
            if (note.status !== 'approved')
                throw new errors_1.ConflictError('credit_note_not_approved', 'Применить можно только утверждённую кредит-ноту');
            const accountCode = note.invoice.status === 'paid' ? '1100' : '2000';
            const entry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                idempotencyKey: `accounting:supplier-credit-note:${id}`,
                sourceType: 'supplier.credit-note',
                sourceRef: id,
                description: `Кредит-нота поставщика ${note.id}`,
                occurredAt: new Date(),
                createdBy: actor,
                lines: [
                    { accountCode, debit: note.amount, memo: note.invoice.status === 'paid' ? 'Дебиторская задолженность поставщика' : 'Уменьшение задолженности поставщику' },
                    { accountCode: '1200', credit: note.amount, memo: 'Уменьшение стоимости запасов по кредит-ноте' },
                ],
            });
            const applied = await tx.supplierCreditNote.update({ where: { id }, data: { status: 'applied', appliedBy: actor, appliedAt: new Date(), accountingEntryId: entry.id }, include: { invoice: true, accountingEntry: { include: { lines: true } } } });
            return { result: { ...applied, idempotent: false }, events: [{ type: 'supplier.credit_note.applied', actor, payload: { creditNoteId: id, amount: note.amount, accountingEntryId: entry.id }, refs: [id, note.invoiceId, entry.id] }, { type: event_types_1.EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: entry.id, sourceType: 'supplier.credit-note', sourceRef: id, amount: note.amount }, refs: [entry.id, id] }] };
        });
    }
};
exports.ProcurementService = ProcurementService;
exports.ProcurementService = ProcurementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], ProcurementService);
function receiptMatch(items) {
    return {
        receivedQty: items.reduce((sum, item) => sum + item.receivedQty, 0),
        value: items.reduce((sum, item) => sum + item.receivedQty * item.unitCost, 0),
    };
}
function replaySupplierInvoice(invoice, dto) {
    if (invoice.supplierId !== dto.supplierId || invoice.purchaseOrderId !== dto.purchaseOrderId || invoice.invoiceNumber !== dto.invoiceNumber.trim() || invoice.amount !== dto.amount) {
        throw new errors_1.ConflictError('supplier_invoice_idempotency_mismatch', 'Ключ счёта уже использован с другими данными');
    }
    return { ...invoice, idempotent: true };
}
function replayCreditNote(note, dto) {
    if (note.supplierId !== dto.supplierId || note.invoiceId !== dto.invoiceId || note.noteNumber !== dto.noteNumber.trim() || note.amount !== dto.amount) {
        throw new errors_1.ConflictError('supplier_credit_note_idempotency_mismatch', 'Ключ кредит-ноты уже использован с другими данными');
    }
    return { ...note, idempotent: true };
}
function replaySupplierInvoicePayment(payment, dto) {
    if ((dto.amount !== undefined && payment.amount !== dto.amount)
        || payment.paymentKey !== dto.paymentKey
        || payment.paymentAccountCode !== dto.paymentAccountCode
        || payment.paymentReference !== dto.paymentReference) {
        throw new errors_1.ConflictError('supplier_invoice_payment_idempotency_mismatch', 'Ключ платежа уже использован с другими данными');
    }
    return { ...payment.invoice, payment, idempotent: true };
}
function replaySupplierAdvance(advance, dto) {
    if (advance.supplierId !== dto.supplierId || advance.paymentKey !== dto.paymentKey || advance.amount !== dto.amount || advance.paymentAccountCode !== dto.paymentAccountCode || advance.paymentReference !== dto.paymentReference.trim()) {
        throw new errors_1.ConflictError('supplier_advance_idempotency_mismatch', 'Ключ аванса уже использован с другими данными');
    }
    return { ...advance, idempotent: true };
}
function replaySupplierAdvanceAllocation(allocation, advanceId, dto) {
    if (allocation.advanceId !== advanceId || allocation.invoiceId !== dto.invoiceId || allocation.amount !== dto.amount) {
        throw new errors_1.ConflictError('supplier_advance_allocation_idempotency_mismatch', 'Ключ зачёта уже использован с другими данными');
    }
    return { advance: allocation.advance, allocation, invoice: allocation.invoice, idempotent: true };
}
function replaySupplierStatement(statement, dto) {
    if (statement.supplierId !== dto.supplierId || statement.statementNumber !== dto.statementNumber.trim() || statement.periodStart.toISOString() !== new Date(dto.periodStart).toISOString() || statement.periodEnd.toISOString() !== new Date(dto.periodEnd).toISOString() || statement.openingBalance !== dto.openingBalance || statement.closingBalance !== dto.closingBalance) {
        throw new errors_1.ConflictError('supplier_statement_idempotency_conflict', 'Ключ supplier-выписки уже использован для других данных');
    }
    return { ...statement, idempotent: true };
}
function replaySupplierStatementLine(line, lineId, dto) {
    if (line.id !== lineId || line.matchedEntryId !== dto.journalEntryId) {
        throw new errors_1.ConflictError('supplier_statement_reconciliation_conflict', 'Ключ сверки уже использован для другой строки или проводки');
    }
    return { ...line, idempotent: true };
}
function replayLandedCost(landedCost, dto, documentNumber, description) {
    if (landedCost.purchaseOrderId !== dto.purchaseOrderId
        || landedCost.documentNumber !== documentNumber
        || landedCost.amount !== dto.amount
        || landedCost.creditAccountCode !== dto.creditAccountCode
        || landedCost.description !== description) {
        throw new errors_1.ConflictError('landed_cost_idempotency_conflict', 'Ключ landed cost уже использован для других данных');
    }
    return { ...landedCost, idempotent: true };
}
function purchaseOrderNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `PO-${date}-${(0, node_crypto_1.randomUUID)().slice(0, 6).toUpperCase()}`;
}
function replayCreatedOrder(order, dto, location, note) {
    const expectedItems = dto.items
        .map((item) => `${item.productId}:${item.qty}:${item.unitCost}`)
        .sort();
    const actualItems = order.items
        .map((item) => `${item.productId}:${item.orderedQty}:${item.unitCost}`)
        .sort();
    const samePayload = order.supplierId === dto.supplierId
        && order.location === location
        && order.note === note
        && JSON.stringify(actualItems) === JSON.stringify(expectedItems);
    if (!samePayload) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим Purchase Order');
    }
    return { ...order, idempotent: true };
}
function receiptPayloadFingerprint(payload) {
    if (!Array.isArray(payload))
        return '';
    return JSON.stringify(payload.map((value) => {
        if (!value || typeof value !== 'object')
            return null;
        const line = value;
        return {
            itemId: typeof line.itemId === 'string' ? line.itemId : '',
            grade: typeof line.grade === 'string' ? line.grade : null,
            imeis: Array.isArray(line.imeis) ? line.imeis.filter((imei) => typeof imei === 'string') : [],
            qty: typeof line.qty === 'number' ? line.qty : null,
        };
    }));
}
//# sourceMappingURL=procurement.service.js.map