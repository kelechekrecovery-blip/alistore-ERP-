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
exports.SupplyOperationsService = exports.SUPPLY_OPERATION_QUEUE_KEYS = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
exports.SUPPLY_OPERATION_QUEUE_KEYS = [
    'awaiting_deposit',
    'draft_po',
    'late',
    'received',
    'ready',
    'cancellation_awaiting_owner',
    'refund_failed',
];
const SUPPLY_SELECT = {
    id: true,
    status: true,
    orderedQty: true,
    expectedAt: true,
    createdAt: true,
    updatedAt: true,
    orderItem: {
        select: {
            orderId: true,
            sku: true,
        },
    },
    purchaseOrderItem: {
        select: {
            purchaseOrder: {
                select: { id: true, number: true },
            },
        },
    },
};
let SupplyOperationsService = class SupplyOperationsService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async list(role, now = new Date()) {
        const financialQueuesVisible = role === 'owner' || role === 'admin';
        const [awaitingDeposit, draftPurchaseOrders, lateSupplies, receivedSupplies, readySupplies, cancellations, failedRefunds,] = await Promise.all([
            this.prisma.orderReceivable.findMany({
                where: {
                    kind: 'supply_deposit',
                    status: { in: ['open', 'partially_settled'] },
                    order: { isDemo: false },
                },
                select: {
                    id: true,
                    orderId: true,
                    status: true,
                    amount: true,
                    settledAmount: true,
                    dueAt: true,
                    createdAt: true,
                    updatedAt: true,
                    orderItem: { select: { sku: true, qty: true } },
                },
                orderBy: { createdAt: 'asc' },
                take: 100,
            }),
            this.prisma.purchaseOrder.findMany({
                where: { status: 'draft', sourceOrderId: { not: null }, sourceOrder: { isDemo: false } },
                select: {
                    id: true,
                    number: true,
                    sourceOrderId: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    items: { select: { orderedQty: true, product: { select: { sku: true } } } },
                },
                orderBy: { createdAt: 'asc' },
                take: 100,
            }),
            this.prisma.orderLineSupply.findMany({
                where: {
                    OR: [
                        { status: 'late' },
                        { status: { in: ['ordered', 'in_transit'] }, expectedAt: { lt: now } },
                    ],
                    orderItem: { order: { isDemo: false } },
                },
                select: SUPPLY_SELECT,
                orderBy: [{ expectedAt: 'asc' }, { createdAt: 'asc' }],
                take: 100,
            }),
            this.prisma.orderLineSupply.findMany({
                where: {
                    status: { in: ['received', 'quality_check'] },
                    orderItem: { order: { isDemo: false } },
                },
                select: SUPPLY_SELECT,
                orderBy: { updatedAt: 'asc' },
                take: 100,
            }),
            this.prisma.orderLineSupply.findMany({
                where: {
                    status: 'ready',
                    orderItem: { order: { isDemo: false } },
                },
                select: SUPPLY_SELECT,
                orderBy: { updatedAt: 'asc' },
                take: 100,
            }),
            financialQueuesVisible
                ? this.prisma.orderCancellation.findMany({
                    where: { status: 'awaiting_owner', order: { isDemo: false } },
                    select: {
                        id: true,
                        orderId: true,
                        status: true,
                        requestedRefundAmount: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 100,
                })
                : Promise.resolve([]),
            financialQueuesVisible
                ? this.prisma.orderCancellation.findMany({
                    where: { status: 'refund_failed', order: { isDemo: false } },
                    select: {
                        id: true,
                        orderId: true,
                        status: true,
                        approvedRefundAmount: true,
                        requestedRefundAmount: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                    orderBy: { updatedAt: 'asc' },
                    take: 100,
                })
                : Promise.resolve([]),
        ]);
        const queues = {
            awaiting_deposit: awaitingDeposit.map((receivable) => ({
                id: receivable.id,
                queue: 'awaiting_deposit',
                orderId: receivable.orderId,
                purchaseOrderId: null,
                purchaseOrderNumber: null,
                status: receivable.status,
                amount: financialQueuesVisible
                    ? Math.max(0, receivable.amount - receivable.settledAmount)
                    : null,
                expectedAt: receivable.dueAt,
                createdAt: receivable.createdAt,
                updatedAt: receivable.updatedAt,
                sku: receivable.orderItem?.sku ?? null,
                quantity: receivable.orderItem?.qty ?? null,
                detailHref: orderDetailHref(receivable.orderId),
            })),
            draft_po: draftPurchaseOrders.map((purchaseOrder) => ({
                id: purchaseOrder.id,
                queue: 'draft_po',
                orderId: purchaseOrder.sourceOrderId,
                purchaseOrderId: purchaseOrder.id,
                purchaseOrderNumber: purchaseOrder.number,
                status: purchaseOrder.status,
                amount: null,
                expectedAt: null,
                createdAt: purchaseOrder.createdAt,
                updatedAt: purchaseOrder.updatedAt,
                sku: purchaseOrder.items[0]?.product.sku ?? null,
                quantity: purchaseOrder.items.reduce((sum, item) => sum + item.orderedQty, 0),
                detailHref: purchaseOrderDetailHref(purchaseOrder.id),
            })),
            late: lateSupplies.map((supply) => supplyRow('late', supply)),
            received: receivedSupplies.map((supply) => supplyRow('received', supply)),
            ready: readySupplies.map((supply) => supplyRow('ready', supply)),
            cancellation_awaiting_owner: cancellations.map((cancellation) => ({
                id: cancellation.id,
                queue: 'cancellation_awaiting_owner',
                orderId: cancellation.orderId,
                purchaseOrderId: null,
                purchaseOrderNumber: null,
                status: cancellation.status,
                amount: cancellation.requestedRefundAmount,
                expectedAt: null,
                createdAt: cancellation.createdAt,
                updatedAt: cancellation.updatedAt,
                sku: null,
                quantity: null,
                detailHref: cancellationDetailHref(cancellation.id),
            })),
            refund_failed: failedRefunds.map((cancellation) => ({
                id: cancellation.id,
                queue: 'refund_failed',
                orderId: cancellation.orderId,
                purchaseOrderId: null,
                purchaseOrderNumber: null,
                status: cancellation.status,
                amount: cancellation.approvedRefundAmount ?? cancellation.requestedRefundAmount,
                expectedAt: null,
                createdAt: cancellation.createdAt,
                updatedAt: cancellation.updatedAt,
                sku: null,
                quantity: null,
                detailHref: cancellationDetailHref(cancellation.id),
            })),
        };
        return {
            generatedAt: now,
            flags: {
                checkoutEnabled: enabled(this.config, 'TO_ORDER_CHECKOUT_ENABLED'),
                cancellationEnabled: enabled(this.config, 'SUPPLY_CANCELLATION_ENABLED'),
                autoRefundEnabled: enabled(this.config, 'SUPPLY_AUTO_REFUND_ENABLED'),
                ownerResolutionEnabled: enabled(this.config, 'SUPPLY_OWNER_RESOLUTION_ENABLED'),
            },
            capabilities: {
                financialQueuesVisible,
                ownerResolutionAvailable: role === 'owner' && enabled(this.config, 'SUPPLY_OWNER_RESOLUTION_ENABLED'),
            },
            counts: Object.fromEntries(exports.SUPPLY_OPERATION_QUEUE_KEYS.map((key) => [key, queues[key].length])),
            queues,
        };
    }
};
exports.SupplyOperationsService = SupplyOperationsService;
exports.SupplyOperationsService = SupplyOperationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], SupplyOperationsService);
function supplyRow(queue, supply) {
    const purchaseOrder = supply.purchaseOrderItem?.purchaseOrder ?? null;
    return {
        id: supply.id,
        queue,
        orderId: supply.orderItem.orderId,
        purchaseOrderId: purchaseOrder?.id ?? null,
        purchaseOrderNumber: purchaseOrder?.number ?? null,
        status: supply.status,
        amount: null,
        expectedAt: supply.expectedAt,
        createdAt: supply.createdAt,
        updatedAt: supply.updatedAt,
        sku: supply.orderItem.sku,
        quantity: supply.orderedQty,
        detailHref: purchaseOrder
            ? purchaseOrderDetailHref(purchaseOrder.id)
            : orderDetailHref(supply.orderItem.orderId),
    };
}
function enabled(config, key) {
    return config.get(key)?.trim().toLowerCase() === 'true';
}
function orderDetailHref(orderId) {
    return `/erp?route=reorder&orderId=${encodeURIComponent(orderId)}`;
}
function purchaseOrderDetailHref(purchaseOrderId) {
    return `/erp?route=reorder&purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`;
}
function cancellationDetailHref(cancellationId) {
    return `/erp?route=reorder&cancellationId=${encodeURIComponent(cancellationId)}`;
}
//# sourceMappingURL=supply-operations.service.js.map