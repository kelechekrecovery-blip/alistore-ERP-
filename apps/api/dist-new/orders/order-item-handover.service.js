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
exports.OrderItemHandoverService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const units_service_1 = require("../units/units.service");
const order_item_handover_on_tx_1 = require("./order-item-handover-on-tx");
const order_state_machine_1 = require("./order-state-machine");
let OrderItemHandoverService = class OrderItemHandoverService {
    constructor(prisma, audit, units, config) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.config = config;
    }
    async handOver(orderId, orderItemId, actor, idempotencyKey) {
        if (this.config?.get('SUPPLY_PARTIAL_HANDOVER_ENABLED')?.trim().toLowerCase() !== 'true') {
            throw new errors_1.ConflictError('supply_partial_handover_disabled', 'Построчная выдача пока не включена');
        }
        const key = idempotencyKey.trim();
        if (!key || key.length > 128) {
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
        }
        const fingerprint = JSON.stringify({ actor, orderId, orderItemId });
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${'order-item-handover:' + key}))`;
            const replay = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            if (replay) {
                if (replay.resourceType !== 'order-item.handover'
                    || replay.resourceId !== orderItemId
                    || replay.fingerprint !== fingerprint) {
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой операцией');
                }
                return { result: replay.response, events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
            const order = await tx.order.findUnique({
                where: { id: orderId },
                select: { status: true, fulfillmentType: true, paymentMode: true, isDemo: true },
            });
            if (!order)
                throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
            if (order.isDemo)
                throw new errors_1.ValidationError('demo_order_blocked', 'Демо-заказ нельзя выдать');
            if (!['pickup', 'store'].includes(order.fulfillmentType)) {
                throw new errors_1.ConflictError('order_item_handover_pickup_only', 'Построчная выдача доступна только для самовывоза');
            }
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
            const orderStatus = (0, order_state_machine_1.deriveOrderStatusFromLineFulfillment)(orderItems.map((item) => item.fulfillmentStatus));
            if (orderStatus !== order.status) {
                await tx.order.update({ where: { id: orderId }, data: { status: orderStatus } });
            }
            const result = {
                orderId,
                orderItemId,
                fulfillmentStatus: 'handed_over',
                handedOverAt: outcome.item.handedOverAt.toISOString(),
                orderStatus,
                accountingEntryId: outcome.accountingEntry.id,
            };
            await tx.storeOperationCommand.create({
                data: {
                    idempotencyKey: key,
                    resourceType: 'order-item.handover',
                    resourceId: orderItemId,
                    fingerprint,
                    response: JSON.parse(JSON.stringify(result)),
                },
            });
            return { result, events };
        });
    }
};
exports.OrderItemHandoverService = OrderItemHandoverService;
exports.OrderItemHandoverService = OrderItemHandoverService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        config_1.ConfigService])
], OrderItemHandoverService);
//# sourceMappingURL=order-item-handover.service.js.map