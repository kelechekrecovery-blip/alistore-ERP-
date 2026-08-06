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
exports.ReservationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const units_service_1 = require("../units/units.service");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const consignment_accounting_1 = require("../inventory/consignment-accounting");
const errors_1 = require("../common/errors");
const EXPIRABLE_ORDER_STATUSES = ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment'];
let ReservationsService = class ReservationsService {
    constructor(prisma, audit, units, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.outbox = outbox;
    }
    async releaseExpired(now = new Date()) {
        const expired = await this.prisma.reservation.findMany({
            where: { active: true, expiresAt: { lte: now } },
        });
        let released = 0;
        for (const orderId of [...new Set(expired.map((reservation) => reservation.orderId))].sort()) {
            const releasedForOrder = await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
                const lockedOrder = await tx.order.findUnique({
                    where: { id: orderId },
                    select: { status: true },
                });
                const activeReservations = await tx.reservation.findMany({
                    where: { orderId, active: true, expiresAt: { lte: now } },
                    include: { quantityAllocation: true },
                    orderBy: { id: 'asc' },
                });
                if (!lockedOrder
                    || !EXPIRABLE_ORDER_STATUSES.includes(lockedOrder.status)
                    || activeReservations.length === 0) {
                    return { result: 0, events: [] };
                }
                activeReservations.sort((left, right) => {
                    const leftKey = left.quantityAllocation?.balanceId ?? left.imei ?? left.id;
                    const rightKey = right.quantityAllocation?.balanceId ?? right.imei ?? right.id;
                    return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
                });
                const balanceIds = [...new Set(activeReservations.flatMap((reservation) => (reservation.quantityAllocation?.balanceId ? [reservation.quantityAllocation.balanceId] : [])))].sort();
                if (balanceIds.length > 0) {
                    await tx.$queryRaw(client_1.Prisma.sql `
            SELECT id
            FROM "InventoryBalance"
            WHERE id IN (${client_1.Prisma.join(balanceIds)})
            ORDER BY id
            FOR UPDATE
          `);
                }
                const events = [];
                const order = await tx.order.findUnique({ where: { id: orderId } });
                const expiredOrderItemIds = new Set();
                for (const fresh of activeReservations) {
                    await tx.reservation.update({ where: { id: fresh.id }, data: { active: false } });
                    if (fresh.imei) {
                        const item = await tx.orderItem.findFirst({
                            where: { orderId: fresh.orderId, imei: fresh.imei, supplyModeSnapshot: 'own_stock' },
                            select: { id: true },
                        });
                        if (item)
                            expiredOrderItemIds.add(item.id);
                        const freed = await this.units.releaseOnTx(tx, fresh.imei, fresh.orderId);
                        if (freed) {
                            events.push({
                                type: event_types_1.EventType.StockReleased,
                                actor: 'system',
                                payload: { orderId: fresh.orderId, imei: fresh.imei, reason: 'reservation_expired' },
                                refs: [fresh.orderId, fresh.imei],
                            });
                        }
                    }
                    if (fresh.quantityAllocationId) {
                        const allocation = fresh.quantityAllocation;
                        if (allocation?.active) {
                            expiredOrderItemIds.add(allocation.orderItemId);
                            const releasedBalance = await tx.inventoryBalance.updateMany({
                                where: { id: allocation.balanceId, reserved: { gte: allocation.qty } },
                                data: { reserved: { decrement: allocation.qty } },
                            });
                            if (releasedBalance.count !== 1) {
                                throw new errors_1.ConflictError('quantity_reservation_release_failed', `Резерв ${allocation.id} нельзя освободить атомарно`);
                            }
                            await (0, consignment_accounting_1.releaseQuantityConsignmentOnTx)(tx, allocation.id);
                            await tx.orderQuantityAllocation.update({ where: { id: allocation.id }, data: { active: false } });
                            events.push({
                                type: event_types_1.EventType.StockReleased,
                                actor: 'system',
                                payload: { orderId: fresh.orderId, sku: allocation.sku, qty: allocation.qty, reason: 'reservation_expired' },
                                refs: [fresh.orderId, allocation.productId, allocation.id],
                            });
                        }
                    }
                    events.push({
                        type: event_types_1.EventType.ReservationExpired,
                        actor: 'system',
                        payload: { reservationId: fresh.id, orderId: fresh.orderId, expiresAt: fresh.expiresAt.toISOString() },
                        refs: fresh.imei
                            ? [fresh.orderId, fresh.imei]
                            : fresh.quantityAllocationId
                                ? [fresh.orderId, fresh.quantityAllocationId]
                                : [fresh.orderId],
                    });
                    if (order) {
                        await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                            customerId: order.customerId,
                            template: 'reservation_expired',
                            payload: { orderId: fresh.orderId, imei: fresh.imei ?? null },
                        });
                    }
                }
                if (expiredOrderItemIds.size > 0) {
                    await tx.orderItem.updateMany({
                        where: {
                            id: { in: [...expiredOrderItemIds] },
                            supplyModeSnapshot: 'own_stock',
                            fulfillmentStatus: { in: ['reserved', 'ready'] },
                        },
                        data: { fulfillmentStatus: 'reservation_expired', readyAt: null },
                    });
                }
                const expiredImeis = activeReservations.flatMap((reservation) => (reservation.imei ? [reservation.imei] : []));
                if (expiredImeis.length > 0) {
                    await tx.orderBundleAllocation.updateMany({
                        where: { orderId, active: true, imei: { in: expiredImeis } },
                        data: { active: false, releasedAt: now },
                    });
                }
                if (lockedOrder.status === 'reserved' || lockedOrder.status === 'awaiting_payment') {
                    await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
                    events.push({
                        type: 'order.confirmed',
                        actor: 'system',
                        payload: { orderId, from: lockedOrder.status, to: 'confirmed', reason: 'reservation_expired' },
                        refs: [orderId],
                    });
                }
                return { result: activeReservations.length, events };
            });
            released += releasedForOrder;
        }
        return { released };
    }
};
exports.ReservationsService = ReservationsService;
exports.ReservationsService = ReservationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        outbox_service_1.OutboxService])
], ReservationsService);
//# sourceMappingURL=reservations.service.js.map