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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderLineSupplyService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const order_line_supply_state_1 = require("./order-line-supply-state");
const units_service_1 = require("../units/units.service");
const order_item_handover_on_tx_1 = require("../orders/order-item-handover-on-tx");
const order_state_machine_1 = require("../orders/order-state-machine");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LEAD_DAYS = 14;
function purchaseOrderNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `PO-${date}-${(0, node_crypto_1.randomUUID)().slice(0, 6).toUpperCase()}`;
}
let OrderLineSupplyService = class OrderLineSupplyService {
    constructor(prisma, audit, units, config) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.config = config;
    }
    async lockOrderForItem(tx, orderItemId) {
        const orderItem = await tx.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
        if (!orderItem)
            throw new errors_1.ValidationError('order_item_not_found', `Строка заказа ${orderItemId} не найдена`);
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'order-supply:' + orderItem.orderId}))::text AS locked`;
        return orderItem.orderId;
    }
    async placeSupplierOrder(orderItemId, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const orderId = await this.lockOrderForItem(tx, orderItemId);
            const orderItem = await tx.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });
            const supply = await tx.orderLineSupply.findUnique({ where: { orderItemId } });
            if (!supply) {
                throw new errors_1.ValidationError('order_line_supply_not_found', `Строка ${orderItemId} не находится «под заказ» — нечего размещать у поставщика`);
            }
            if (supply.status !== 'awaiting_supplier') {
                if (supply.purchaseOrderItemId)
                    return { result: { ...supply, idempotent: true }, events: [] };
                (0, order_line_supply_state_1.assertTransition)(supply.status, 'ordered');
            }
            const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
            if (!supplier)
                throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
            const product = await tx.product.findUnique({ where: { sku: orderItem.sku } });
            if (!product)
                throw new errors_1.ValidationError('product_not_found', `Товар ${orderItem.sku} не найден`);
            const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { fulfillmentLocation: true } });
            if (!order.fulfillmentLocation?.trim()) {
                throw new errors_1.ValidationError('purchase_order_location_required', 'У клиентского заказа не определён склад назначения');
            }
            const expectedAt = dto.expectedAt
                ? new Date(dto.expectedAt)
                : new Date(Date.now() + (product.supplyLeadDays ?? DEFAULT_LEAD_DAYS) * MS_PER_DAY);
            const purchaseOrder = await tx.purchaseOrder.create({
                data: {
                    number: purchaseOrderNumber(),
                    supplierId: supplier.id,
                    location: order.fulfillmentLocation,
                    createdBy: actor,
                    note: `Под заказ покупателя: строка ${orderItemId}`,
                    items: { create: [{ productId: product.id, orderedQty: orderItem.qty, unitCost: dto.unitCost }] },
                },
                include: { items: true },
            });
            const purchaseOrderItem = purchaseOrder.items[0];
            const cas = await tx.orderLineSupply.updateMany({
                where: { orderItemId, status: 'awaiting_supplier' },
                data: { status: 'ordered', purchaseOrderItemId: purchaseOrderItem.id, expectedAt, actor },
            });
            if (cas.count !== 1) {
                throw new errors_1.ConflictError('order_line_supply_race', `Заказ поставщику для строки ${orderItemId} уже размещён параллельно`);
            }
            const updated = await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
            return {
                result: { ...updated, idempotent: false },
                events: [{
                        type: event_types_1.EventType.OrderLineSupplyOrdered,
                        actor,
                        payload: {
                            orderItemId,
                            orderId,
                            purchaseOrderId: purchaseOrder.id,
                            purchaseOrderItemId: purchaseOrderItem.id,
                            supplierId: supplier.id,
                            unitCost: dto.unitCost,
                            expectedAt: expectedAt.toISOString(),
                        },
                        refs: [orderId, orderItemId, purchaseOrder.id, purchaseOrderItem.id, supplier.id],
                    }],
            };
        });
    }
    markInTransit(orderItemId, actor) {
        return this.transition(orderItemId, 'in_transit', actor, event_types_1.EventType.OrderLineSupplyInTransit);
    }
    markReceived(orderItemId, actor) {
        return this.transition(orderItemId, 'received', actor, event_types_1.EventType.OrderLineSupplyReceived);
    }
    markQualityChecked(orderItemId, actor) {
        return this.transition(orderItemId, 'quality_check', actor, event_types_1.EventType.OrderLineSupplyQualityChecked);
    }
    markReady(orderItemId, actor) {
        return this.transition(orderItemId, 'ready', actor, event_types_1.EventType.OrderLineSupplyReady);
    }
    markHandedOver(orderItemId, actor) {
        if (this.config?.get('SUPPLY_PARTIAL_HANDOVER_ENABLED')?.trim().toLowerCase() !== 'true') {
            throw new errors_1.ConflictError('supply_partial_handover_disabled', 'Построчная выдача пока не включена');
        }
        return this.transition(orderItemId, 'handed_over', actor, event_types_1.EventType.OrderLineSupplyHandedOver);
    }
    async cancel(orderItemId, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const orderId = await this.lockOrderForItem(tx, orderItemId);
            const supply = await tx.orderLineSupply.findUnique({ where: { orderItemId } });
            if (!supply) {
                throw new errors_1.ValidationError('order_line_supply_not_found', `Строка ${orderItemId} не находится «под заказ»`);
            }
            if (supply.status === 'cancelled')
                return { result: { ...supply, idempotent: true }, events: [] };
            (0, order_line_supply_state_1.assertTransition)(supply.status, 'cancelled');
            const cas = await tx.orderLineSupply.updateMany({
                where: { orderItemId, status: supply.status },
                data: { status: 'cancelled', actor },
            });
            if (cas.count !== 1)
                throw new errors_1.ConflictError('order_line_supply_race', `Статус поставки строки ${orderItemId} изменился параллельно`);
            const updated = await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
            return {
                result: { ...updated, idempotent: false },
                events: [{
                        type: event_types_1.EventType.OrderLineSupplyCancelled,
                        actor,
                        payload: { orderItemId, orderId, from: supply.status, reason: dto.reason?.trim() || null },
                        refs: [orderId, orderItemId],
                    }],
            };
        });
    }
    async transition(orderItemId, to, actor, eventType) {
        return this.audit.transaction(async (tx) => {
            const orderId = await this.lockOrderForItem(tx, orderItemId);
            const supply = await tx.orderLineSupply.findUnique({ where: { orderItemId } });
            if (!supply) {
                throw new errors_1.ValidationError('order_line_supply_not_found', `Строка ${orderItemId} не находится «под заказ»`);
            }
            if (supply.status === to)
                return { result: { ...supply, idempotent: true }, events: [] };
            (0, order_line_supply_state_1.assertTransition)(supply.status, to);
            if (to === 'received' && supply.receivedQty !== supply.orderedQty) {
                throw new errors_1.ConflictError('order_line_supply_receipt_incomplete', 'Нельзя подтвердить поступление до фактической приёмки всего количества');
            }
            if (to === 'handed_over') {
                const order = await tx.order.findUniqueOrThrow({
                    where: { id: orderId },
                    select: { paymentMode: true, status: true },
                });
                const events = [];
                const outcome = await (0, order_item_handover_on_tx_1.handOverReadyOrderItemOnTx)(tx, {
                    orderId,
                    orderItemId,
                    paymentMode: order.paymentMode,
                    actor,
                    units: this.units,
                    events,
                });
                const orderItems = await tx.orderItem.findMany({
                    where: { orderId },
                    select: { fulfillmentStatus: true },
                });
                const projectedStatus = (0, order_state_machine_1.deriveOrderStatusFromLineFulfillment)(orderItems.map((item) => item.fulfillmentStatus));
                if (projectedStatus === 'completed' && ['ready_for_pickup', 'delivered'].includes(order.status)) {
                    await tx.order.update({ where: { id: orderId }, data: { status: 'completed' } });
                }
                return {
                    result: {
                        ...(await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } })),
                        idempotent: false,
                    },
                    events,
                };
            }
            const cas = await tx.orderLineSupply.updateMany({
                where: { orderItemId, status: supply.status },
                data: { status: to, actor },
            });
            if (cas.count !== 1)
                throw new errors_1.ConflictError('order_line_supply_race', `Статус поставки строки ${orderItemId} изменился параллельно`);
            const fulfillmentStatus = fulfillmentStatusForSupply(to);
            await tx.orderItem.update({
                where: { id: orderItemId },
                data: {
                    fulfillmentStatus,
                    ...(to === 'ready' ? { readyAt: new Date() } : {}),
                },
            });
            if (to === 'ready') {
                const orderItems = await tx.orderItem.findMany({
                    where: { orderId },
                    select: { fulfillmentStatus: true },
                });
                const projectedStatus = (0, order_state_machine_1.deriveOrderStatusFromLineFulfillment)(orderItems.map((item) => item.fulfillmentStatus));
                if (projectedStatus === 'ready_for_pickup') {
                    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
                    if (order.status === 'confirmed') {
                        await tx.order.update({ where: { id: orderId }, data: { status: 'ready_for_pickup' } });
                    }
                }
            }
            const updated = await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
            return {
                result: { ...updated, idempotent: false },
                events: [{
                        type: eventType,
                        actor,
                        payload: { orderItemId, orderId, from: supply.status, to },
                        refs: [orderId, orderItemId],
                    }],
            };
        });
    }
};
exports.OrderLineSupplyService = OrderLineSupplyService;
exports.OrderLineSupplyService = OrderLineSupplyService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        config_1.ConfigService])
], OrderLineSupplyService);
function fulfillmentStatusForSupply(status) {
    const statuses = {
        awaiting_deposit: 'awaiting_deposit',
        awaiting_supplier: 'awaiting_deposit',
        procurement_draft: 'procurement_draft',
        ordered: 'supplier_ordered',
        in_transit: 'in_transit',
        received: 'received',
        quality_check: 'quality_check',
        ready: 'ready',
        handed_over: 'handed_over',
        supplier_rejected: 'supplier_rejected',
        late: 'late',
        customer_cancelled: 'customer_cancelled',
        quarantined: 'quarantined',
        cancelled: 'cancelled',
    };
    return statuses[status];
}
//# sourceMappingURL=order-line-supply.service.js.map