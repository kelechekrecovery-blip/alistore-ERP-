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
exports.OrderItemReservationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const consignment_accounting_1 = require("../inventory/consignment-accounting");
const order_inventory_sale_1 = require("../inventory/order-inventory-sale");
const customer_notifications_1 = require("../outbox/customer-notifications");
const outbox_service_1 = require("../outbox/outbox.service");
const prisma_service_1 = require("../prisma/prisma.service");
const units_service_1 = require("../units/units.service");
const order_state_machine_1 = require("./order-state-machine");
const READY_RESERVATION_TTL_MS = 72 * 60 * 60 * 1000;
let OrderItemReservationService = class OrderItemReservationService {
    constructor(prisma, audit, units, outbox, config) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.outbox = outbox;
        this.config = config;
    }
    reserve(orderId, orderItemId, actor, key) {
        this.assertEnabled();
        return this.command(orderId, orderItemId, actor, key, 'reserve', async (tx, order, item, events) => {
            if (item.fulfillmentStatus === 'reserved' || item.fulfillmentStatus === 'ready') {
                return item;
            }
            if (item.fulfillmentStatus !== 'pending_payment') {
                throw new errors_1.ConflictError('order_item_not_reservable', `Строка нельзя зарезервировать из статуса ${item.fulfillmentStatus}`);
            }
            const product = item.product;
            const snapshot = (0, order_inventory_sale_1.resolveOrderInventorySnapshot)(item.inventorySnapshot, product ? {
                productId: product.id,
                trackingMode: product.trackingMode,
                components: [],
            } : null);
            if (!snapshot || snapshot.components.length > 0) {
                throw new errors_1.ConflictError('order_item_inventory_snapshot_unsupported', 'Для построчного резерва нужен обычный складской товар');
            }
            const expiresAt = new Date(Date.now() + READY_RESERVATION_TTL_MS);
            if (snapshot.trackingMode === 'serialized') {
                if (item.qty !== 1) {
                    throw new errors_1.ConflictError('serialized_line_split_required', 'Серийная строка количеством больше одной должна быть разделена до построчного резерва');
                }
                const unit = await tx.deviceUnit.findFirst({
                    where: { productId: snapshot.productId, location: order.fulfillmentLocation, status: 'in_stock' },
                    orderBy: { id: 'asc' },
                });
                if (!unit)
                    throw new errors_1.ConflictError('insufficient_stock', `Нет доступной единицы ${item.sku}`);
                await this.units.reserveOnTx(tx, unit.imei, orderId);
                await tx.reservation.create({ data: { orderId, imei: unit.imei, expiresAt, active: true } });
                await tx.orderItem.update({ where: { id: item.id }, data: { imei: unit.imei } });
                events.push({
                    type: event_types_1.EventType.StockReserved,
                    actor,
                    payload: { orderId, orderItemId, imei: unit.imei, location: order.fulfillmentLocation },
                    refs: [orderId, orderItemId, unit.imei],
                });
            }
            else {
                const balances = await tx.inventoryBalance.findMany({
                    where: { productId: snapshot.productId, location: order.fulfillmentLocation },
                    orderBy: { id: 'asc' },
                });
                await (0, order_inventory_sale_1.lockInventoryBalancesOnTx)(tx, balances.map((balance) => balance.id));
                let remaining = item.qty;
                for (const balance of balances) {
                    if (remaining === 0)
                        break;
                    const qty = Math.min(remaining, Math.max(0, balance.onHand - balance.reserved));
                    if (qty === 0)
                        continue;
                    const claimed = await tx.inventoryBalance.updateMany({
                        where: { id: balance.id, onHand: { gte: balance.reserved + qty } },
                        data: { reserved: { increment: qty } },
                    });
                    if (claimed.count !== 1)
                        continue;
                    const allocation = await tx.orderQuantityAllocation.create({
                        data: {
                            orderId,
                            orderItemId,
                            productId: snapshot.productId,
                            balanceId: balance.id,
                            sku: item.sku,
                            location: balance.location,
                            qty,
                        },
                    });
                    await (0, consignment_accounting_1.reserveQuantityConsignmentOnTx)(tx, {
                        orderQuantityAllocationId: allocation.id,
                        balanceId: balance.id,
                        qty,
                    });
                    await tx.reservation.create({
                        data: { orderId, quantityAllocationId: allocation.id, expiresAt, active: true },
                    });
                    remaining -= qty;
                    events.push({
                        type: event_types_1.EventType.StockReserved,
                        actor,
                        payload: { orderId, orderItemId, sku: item.sku, qty, location: balance.location },
                        refs: [orderId, orderItemId, allocation.id],
                    });
                }
                if (remaining > 0)
                    throw new errors_1.ConflictError('insufficient_stock', `Недостаточно товара ${item.sku}`);
            }
            return tx.orderItem.update({
                where: { id: item.id },
                data: { fulfillmentStatus: 'reserved' },
            });
        });
    }
    ready(orderId, orderItemId, actor, key) {
        this.assertEnabled();
        return this.command(orderId, orderItemId, actor, key, 'ready', async (tx, order, item, events) => {
            if (item.fulfillmentStatus === 'ready')
                return item;
            if (item.fulfillmentStatus !== 'reserved') {
                throw new errors_1.ConflictError('order_item_not_readyable', `Строка нельзя подготовить из статуса ${item.fulfillmentStatus}`);
            }
            const reservations = await tx.reservation.findMany({
                where: {
                    orderId,
                    active: true,
                    OR: [
                        ...(item.imei ? [{ imei: item.imei }] : []),
                        { quantityAllocation: { is: { orderItemId } } },
                    ],
                },
                select: { id: true },
            });
            if (reservations.length === 0) {
                throw new errors_1.ConflictError('order_item_reservation_incomplete', 'Активный резерв строки не найден');
            }
            const readyAt = new Date();
            const expiresAt = new Date(readyAt.getTime() + READY_RESERVATION_TTL_MS);
            await tx.reservation.updateMany({
                where: { id: { in: reservations.map((row) => row.id) }, active: true },
                data: { expiresAt },
            });
            const updated = await tx.orderItem.update({
                where: { id: orderItemId },
                data: { fulfillmentStatus: 'ready', readyAt },
            });
            const orderItems = await tx.orderItem.findMany({
                where: { orderId },
                select: { fulfillmentStatus: true },
            });
            const projectedStatus = (0, order_state_machine_1.deriveOrderStatusFromLineFulfillment)(orderItems.map((item) => item.fulfillmentStatus));
            if (projectedStatus === 'ready_for_pickup' && order.status === 'confirmed') {
                await tx.order.update({ where: { id: orderId }, data: { status: 'ready_for_pickup' } });
            }
            await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                customerId: order.customerId,
                template: 'order_ready_for_pickup',
                payload: { orderId, orderItemId, expiresAt: expiresAt.toISOString() },
                transactional: true,
            });
            events.push({
                type: event_types_1.EventType.OrderItemReady,
                actor,
                payload: { orderId, orderItemId, readyAt: readyAt.toISOString(), expiresAt: expiresAt.toISOString() },
                refs: [orderId, orderItemId],
            });
            return updated;
        });
    }
    assertEnabled() {
        if (this.config?.get('SUPPLY_PARTIAL_HANDOVER_ENABLED')?.trim().toLowerCase() !== 'true') {
            throw new errors_1.ConflictError('supply_partial_handover_disabled', 'Построчная выдача пока не включена');
        }
    }
    command(orderId, orderItemId, actor, idempotencyKey, action, work) {
        const key = idempotencyKey.trim();
        if (!key || key.length > 128)
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
        const fingerprint = JSON.stringify({ action, actor, orderId, orderItemId });
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${'order-item-lifecycle:' + key}))`;
            const replay = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            if (replay) {
                if (replay.resourceType !== `order-item.${action}` || replay.resourceId !== orderItemId || replay.fingerprint !== fingerprint) {
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой операцией');
                }
                return { result: replay.response, events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
            const order = await tx.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    customerId: true,
                    status: true,
                    isDemo: true,
                    fulfillmentType: true,
                    fulfillmentLocation: true,
                    storePoint: { select: { active: true, inventoryLocation: true } },
                },
            });
            if (!order)
                throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
            if (order.isDemo)
                throw new errors_1.ValidationError('demo_order_blocked', 'Демо-заказ нельзя резервировать');
            if (!['pickup', 'store'].includes(order.fulfillmentType)) {
                throw new errors_1.ConflictError('order_item_reservation_pickup_only', 'Построчный резерв доступен только для самовывоза');
            }
            const activeLocation = order.storePoint?.active
                && order.storePoint.inventoryLocation === order.fulfillmentLocation;
            if (!activeLocation)
                throw new errors_1.ConflictError('store_point_inactive', 'Точка исполнения неактивна или изменилась');
            const item = await tx.orderItem.findFirst({
                where: { id: orderItemId, orderId },
                include: { product: true },
            });
            if (!item)
                throw new errors_1.ValidationError('order_item_not_found', `Строка ${orderItemId} не найдена`);
            if (item.supplyModeSnapshot !== 'own_stock') {
                throw new errors_1.ConflictError('order_item_supply_managed', 'Заказная строка управляется поставочным процессом');
            }
            const events = [];
            const result = await work(tx, order, item, events);
            const response = JSON.parse(JSON.stringify(result));
            await tx.storeOperationCommand.create({
                data: { idempotencyKey: key, resourceType: `order-item.${action}`, resourceId: orderItemId, fingerprint, response },
            });
            return { result, events };
        });
    }
};
exports.OrderItemReservationService = OrderItemReservationService;
exports.OrderItemReservationService = OrderItemReservationService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        outbox_service_1.OutboxService,
        config_1.ConfigService])
], OrderItemReservationService);
//# sourceMappingURL=order-item-reservation.service.js.map