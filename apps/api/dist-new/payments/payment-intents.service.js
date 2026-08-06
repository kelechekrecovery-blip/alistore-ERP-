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
exports.PaymentIntentsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const errors_1 = require("../common/errors");
const event_types_1 = require("../audit/event-types");
const orders_service_1 = require("../orders/orders.service");
const prisma_service_1 = require("../prisma/prisma.service");
const payments_service_1 = require("./payments.service");
const payment_gateway_provider_1 = require("./payment-gateway-provider");
const prisma_errors_1 = require("../common/prisma-errors");
let PaymentIntentsService = class PaymentIntentsService {
    constructor(prisma, orders, payments, gateway) {
        this.prisma = prisma;
        this.orders = orders;
        this.payments = payments;
        this.gateway = gateway;
    }
    async create(dto, idempotencyKey) {
        const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
        }
        if (order.status === 'paid') {
            throw new errors_1.ConflictError('order_already_paid', `Заказ ${order.id} уже оплачен`);
        }
        const received = await this.prisma.payment.aggregate({
            where: { orderId: order.id, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
            _sum: { amount: true },
        });
        const due = order.total - (received._sum.amount ?? 0);
        if (due !== dto.amount) {
            throw new errors_1.ValidationError('payment_amount_mismatch', `К оплате ${due}, передано ${dto.amount}`);
        }
        const replay = await this.prisma.onlinePaymentIntentCommand.findFirst({
            where: { orderId: order.id, method: dto.method, amount: dto.amount, response: { not: client_1.Prisma.DbNull } },
            orderBy: { createdAt: 'desc' },
        });
        if (replay?.response)
            return replay.response;
        this.gateway.assertOperational();
        if (order.isDemo) {
            return this.gateway.createIntent({
                idempotencyKey,
                orderId: order.id,
                orderStatus: order.status,
                method: dto.method,
                amount: dto.amount,
                returnUrl: dto.returnUrl,
            });
        }
        let status = order.status;
        if (status === 'created' || status === 'confirmed') {
            const fulfilled = await this.orders.fulfill(order.id, dto.actor ?? 'web_checkout');
            status = fulfilled.order?.status ?? 'reserved';
        }
        if (status === 'reserved') {
            status = (await this.orders.transition(order.id, 'awaiting_payment', dto.actor ?? 'web_checkout')).status;
        }
        if (status !== 'awaiting_payment') {
            throw new errors_1.ConflictError('order_not_payable', `Заказ ${order.id} нельзя оплатить в статусе ${status}`);
        }
        const intent = await this.gateway.createIntent({
            idempotencyKey,
            orderId: order.id,
            orderStatus: status,
            method: dto.method,
            amount: dto.amount,
            returnUrl: dto.returnUrl,
        });
        if (!idempotencyKey) {
            const autoKey = `payment-intent:${order.id}:${dto.method}:${dto.amount}`;
            await this.prisma.onlinePaymentIntentCommand.upsert({
                where: { idempotencyKey: autoKey },
                create: {
                    idempotencyKey: autoKey,
                    customerId: dto.actor ?? 'system:payment-intent',
                    orderId: order.id,
                    method: dto.method,
                    amount: dto.amount,
                    returnUrl: dto.returnUrl,
                    response: intent,
                },
                update: { response: intent },
            });
        }
        return intent;
    }
    async createForCustomer(customerId, dto, idempotencyKey) {
        const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, customerId } });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
        }
        if (!idempotencyKey?.trim())
            return this.create({ ...dto, actor: customerId });
        const key = idempotencyKey.trim();
        if (key.length > 128)
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Idempotency key слишком длинный');
        const existing = await this.prisma.onlinePaymentIntentCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return this.replay(existing, customerId, dto);
        try {
            await this.prisma.onlinePaymentIntentCommand.create({
                data: {
                    idempotencyKey: key,
                    customerId,
                    orderId: dto.orderId,
                    method: dto.method,
                    amount: dto.amount,
                    returnUrl: dto.returnUrl,
                },
            });
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                const raced = await this.prisma.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
                return this.replay(raced, customerId, dto);
            }
            throw error;
        }
        try {
            const response = await this.create({ ...dto, actor: customerId }, key);
            await this.prisma.onlinePaymentIntentCommand.update({
                where: { idempotencyKey: key },
                data: { response: response },
            });
            return response;
        }
        catch (error) {
            await this.prisma.onlinePaymentIntentCommand.deleteMany({ where: { idempotencyKey: key, response: { equals: client_1.Prisma.DbNull } } });
            throw error;
        }
    }
    replay(command, customerId, dto) {
        const matches = command.customerId === customerId && command.orderId === dto.orderId &&
            command.method === dto.method && command.amount === dto.amount && command.returnUrl === (dto.returnUrl ?? null);
        if (!matches)
            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим платежом');
        if (!command.response)
            throw new errors_1.ConflictError('payment_intent_in_progress', 'Платёжный intent ещё создаётся');
        return command.response;
    }
    async confirmSandboxIntent(intentId, expectedProvider) {
        if (this.gateway.name !== 'sandbox') {
            throw new errors_1.ValidationError('sandbox_payment_disabled', 'Sandbox payment отключён');
        }
        const command = await this.prisma.onlinePaymentIntentCommand.findFirst({
            where: { response: { path: ['intentId'], equals: intentId } },
        });
        if (!command?.response)
            throw new errors_1.ValidationError('payment_intent_not_found', 'Платёжный intent не найден');
        const intent = command.response;
        if (expectedProvider && intent.provider !== expectedProvider) {
            throw new errors_1.ValidationError('payment_intent_provider_mismatch', 'Провайдер платежа не совпадает с intent');
        }
        return this.applyWebhookPayload({
            orderId: intent.orderId,
            method: intent.method,
            amount: intent.amount,
            txnId: intent.txnId,
            status: 'succeeded',
            actor: 'sandbox',
        });
    }
    async webhook(dto, request) {
        const verified = await this.gateway.verifyWebhook({
            payload: dto,
            rawBody: request?.rawBody,
            headers: request?.headers ?? {},
        });
        return this.applyWebhookPayload(verified);
    }
    async applyWebhookPayload(verified) {
        if (verified.status === 'failed') {
            throw new errors_1.PaymentFailedError('payment_failed', `Провайдер отклонил платёж ${verified.txnId}`);
        }
        const order = await this.prisma.order.findUnique({ where: { id: verified.orderId } });
        if (!order)
            throw new errors_1.ValidationError('order_not_found', `Заказ ${verified.orderId} не найден`);
        if (!order.isDemo && !['reserved', 'awaiting_payment'].includes(order.status)) {
            return this.parkCancelledOrderPayment(order.id, verified, verified.actor ?? `provider:${verified.method}`);
        }
        try {
            return await this.payments.pay({ orderId: verified.orderId, method: verified.method, amount: verified.amount, txnId: verified.txnId }, verified.actor ?? `provider:${verified.method}`);
        }
        catch (error) {
            if (!order.isDemo && error instanceof errors_1.ConflictError && error.code === 'payment_without_reservation') {
                return this.parkCancelledOrderPayment(order.id, verified, verified.actor ?? `provider:${verified.method}`);
            }
            throw error;
        }
    }
    async parkCancelledOrderPayment(orderId, payload, actor) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.payment.findUnique({ where: { txnId: payload.txnId } });
            if (existing) {
                if (existing.orderId !== orderId || existing.amount !== payload.amount || existing.method !== payload.method) {
                    throw new errors_1.ConflictError('payment_txn_reused', 'Provider txnId уже использован для другого платежа');
                }
                const existingOrder = await tx.order.findUnique({ where: { id: orderId } });
                return { order: existingOrder, payment: existing, parked: true, idempotent: true };
            }
            const payment = await tx.payment.create({
                data: {
                    orderId,
                    amount: payload.amount,
                    method: payload.method,
                    status: 'pending',
                    txnId: payload.txnId,
                    receivedBy: actor,
                },
            });
            const parkedOrder = await tx.order.findUnique({ where: { id: orderId } });
            await tx.auditEvent.create({
                data: {
                    type: event_types_1.EventType.PaymentParked,
                    actor,
                    payload: { orderId, paymentId: payment.id, amount: payload.amount, method: payload.method, txnId: payload.txnId, reason: 'order_cancelled' },
                    refs: [orderId, payment.id],
                },
            });
            return { order: parkedOrder, payment, parked: true, idempotent: false };
        });
    }
};
exports.PaymentIntentsService = PaymentIntentsService;
exports.PaymentIntentsService = PaymentIntentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(payment_gateway_provider_1.PAYMENT_GATEWAY_PROVIDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        orders_service_1.OrdersService,
        payments_service_1.PaymentsService, Object])
], PaymentIntentsService);
function isUniqueViolation(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
//# sourceMappingURL=payment-intents.service.js.map