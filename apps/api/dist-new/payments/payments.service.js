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
exports.PaymentsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const units_service_1 = require("../units/units.service");
const errors_1 = require("../common/errors");
const order_state_machine_1 = require("../orders/order-state-machine");
const orders_service_1 = require("../orders/orders.service");
const approvals_service_1 = require("../approvals/approvals.service");
const giftcards_service_1 = require("../giftcards/giftcards.service");
const campaign_attribution_service_1 = require("../campaigns/campaign-attribution.service");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const accounting_journal_1 = require("../finance/accounting-journal");
const sales_tax_1 = require("../finance/sales-tax");
const order_inventory_sale_1 = require("../inventory/order-inventory-sale");
const PAYABLE_STATUSES = new Set(['reserved', 'awaiting_payment']);
const PROVIDER_TENDERS = new Set(['card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment']);
let PaymentsService = class PaymentsService {
    constructor(prisma, audit, units, approvals, giftcards, orders, campaignAttribution, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.approvals = approvals;
        this.giftcards = giftcards;
        this.orders = orders;
        this.campaignAttribution = campaignAttribution;
        this.outbox = outbox;
    }
    get(id) {
        return this.prisma.payment.findUnique({ where: { id } });
    }
    settleReceivable(receivableId, dto, actor, context) {
        const idempotencyKey = context.idempotencyKey?.trim();
        if (!idempotencyKey) {
            throw new errors_1.ValidationError('idempotency_key_required', 'Для платежа обязателен Idempotency-Key');
        }
        if (dto.method === 'gift_card' || dto.method === 'installment') {
            throw new errors_1.ValidationError('receivable_payment_method_forbidden', 'Начисление нельзя оплатить подарочной картой или рассрочкой');
        }
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'receivable-payment:' + receivableId}))::text AS locked`;
            const replay = await tx.payment.findUnique({
                where: { idempotencyKey },
                include: { receivableAllocations: true },
            });
            if (replay) {
                const allocation = replay.receivableAllocations.find((row) => row.receivableId === receivableId);
                if (!allocation
                    || replay.amount !== dto.amount
                    || replay.method !== dto.method
                    || (dto.txnId && replay.txnId !== dto.txnId)) {
                    throw new errors_1.ConflictError('payment_idempotency_conflict', 'Idempotency-Key уже использован для другого платежа');
                }
                return { result: { payment: replay, allocation, idempotent: true }, events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "OrderReceivable" WHERE id = ${receivableId} FOR UPDATE`;
            const receivable = await tx.orderReceivable.findUnique({
                where: { id: receivableId },
                include: {
                    order: {
                        include: {
                            storePoint: { select: { inventoryLocation: true } },
                        },
                    },
                },
            });
            if (!receivable) {
                throw new errors_1.ValidationError('order_receivable_not_found', `Начисление ${receivableId} не найдено`);
            }
            if (receivable.status === 'cancelled' || receivable.status === 'settled') {
                throw new errors_1.ConflictError('receivable_not_open', 'Начисление уже закрыто');
            }
            const remaining = receivable.amount - receivable.settledAmount;
            if (dto.amount > remaining) {
                throw new errors_1.ValidationError('payment_exceeds_receivable', 'Сумма превышает остаток начисления');
            }
            const point = receivable.order.fulfillmentLocation?.trim()
                || receivable.order.storePoint?.inventoryLocation.trim();
            if (!point) {
                throw new errors_1.ValidationError('payment_point_required', 'У заказа должна быть определена точка исполнения');
            }
            const cashShift = dto.method === 'cash'
                ? await this.resolveCashShiftOnTx(tx, dto.shiftId, context.staffId, point)
                : null;
            const accountCode = (0, accounting_journal_1.paymentAccountCode)(dto.method);
            const revenueRecognized = await isOrderReceivableRecognizedOnTx(tx, receivable);
            const accountingSourceType = revenueRecognized
                ? 'order_receivable.receipt'
                : 'customer_prepayment.receipt';
            const offsetAccountCode = revenueRecognized ? '1100' : '2400';
            const payment = await tx.payment.create({
                data: {
                    orderId: receivable.orderId,
                    amount: dto.amount,
                    method: dto.method,
                    status: 'received',
                    txnId: dto.txnId?.trim() || null,
                    shiftId: cashShift?.id ?? null,
                    accountCode,
                    idempotencyKey,
                    receivedBy: actor,
                    point,
                },
            });
            const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                idempotencyKey: `accounting:${idempotencyKey}`,
                sourceType: accountingSourceType,
                sourceRef: payment.id,
                description: revenueRecognized
                    ? `Погашение дебиторской задолженности ${receivable.kind} по заказу ${receivable.orderId}`
                    : `Получение предоплаты ${receivable.kind} по заказу ${receivable.orderId}`,
                point,
                documentAmount: dto.amount,
                baseAmount: dto.amount,
                occurredAt: payment.createdAt,
                createdBy: actor,
                lines: [
                    { accountCode, debit: dto.amount, memo: `Поступление оплаты ${receivable.kind}` },
                    {
                        accountCode: offsetAccountCode,
                        credit: dto.amount,
                        memo: revenueRecognized
                            ? 'Погашение дебиторской задолженности'
                            : 'Обязательство перед покупателем',
                    },
                ],
            });
            const postedPayment = await tx.payment.update({
                where: { id: payment.id },
                data: { accountingEntryId: accountingEntry.id },
            });
            const allocation = await tx.paymentReceivableAllocation.create({
                data: { paymentId: payment.id, receivableId, amount: dto.amount },
            });
            const settledAmount = receivable.settledAmount + dto.amount;
            const status = settledAmount === receivable.amount ? 'settled' : 'partially_settled';
            await tx.orderReceivable.update({
                where: { id: receivableId },
                data: { settledAmount, status },
            });
            const events = [
                {
                    type: event_types_1.EventType.PaymentReceived,
                    actor,
                    payload: {
                        orderId: receivable.orderId,
                        receivableId,
                        kind: receivable.kind,
                        amount: dto.amount,
                        method: dto.method,
                        accountCode,
                        accountingEntryId: accountingEntry.id,
                    },
                    refs: [receivable.orderId, receivableId, payment.id],
                },
                {
                    type: event_types_1.EventType.AccountingEntryPosted,
                    actor,
                    payload: {
                        accountingEntryId: accountingEntry.id,
                        sourceType: accountingSourceType,
                        sourceRef: payment.id,
                    },
                    refs: [accountingEntry.id, payment.id, receivable.orderId],
                },
            ];
            if (status === 'settled') {
                events.push({
                    type: event_types_1.EventType.OrderReceivableSettled,
                    actor,
                    payload: { orderId: receivable.orderId, receivableId, kind: receivable.kind },
                    refs: [receivable.orderId, receivableId],
                });
            }
            const openDeposits = await tx.orderReceivable.count({
                where: {
                    orderId: receivable.orderId,
                    kind: 'supply_deposit',
                    status: { not: 'settled' },
                },
            });
            if (receivable.kind === 'supply_deposit' && openDeposits === 0) {
                await this.activateSupplyProcurementOnTx(tx, receivable.orderId, actor, events);
            }
            return {
                result: { payment: postedPayment, allocation, idempotent: false },
                events,
            };
        });
    }
    async voidPending(paymentId, reason, actor, idempotencyKey) {
        const normalizedReason = reason.trim();
        if (!normalizedReason)
            throw new errors_1.ValidationError('void_reason_required', 'Причина отмены платежа обязательна');
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
            const payment = await tx.payment.findUnique({ where: { id: paymentId } });
            if (!payment)
                throw new errors_1.ValidationError('payment_not_found', `Платёж ${paymentId} не найден`);
            const keyOwner = await tx.payment.findUnique({ where: { idempotencyKey } });
            if (keyOwner && keyOwner.id !== paymentId) {
                throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован для другого платежа');
            }
            if (payment.idempotencyKey && payment.idempotencyKey === idempotencyKey && payment.status === 'voided') {
                return { result: payment, events: [] };
            }
            if (payment.status !== 'pending') {
                throw new errors_1.ConflictError('payment_not_voidable', 'Отменить можно только незавершённый pending-платёж');
            }
            if (payment.amount <= 0 || payment.originalPaymentId || payment.accountingEntryId) {
                throw new errors_1.ConflictError('payment_not_voidable', 'Платёж уже имеет финансовое проведение и не может быть voided');
            }
            const existing = await tx.auditEvent.findFirst({
                where: { type: event_types_1.EventType.PaymentVoided, refs: { has: paymentId }, payload: { path: ['idempotencyKey'], equals: idempotencyKey } },
            });
            if (existing)
                return { result: payment, events: [] };
            const voided = await tx.payment.update({
                where: { id: paymentId },
                data: { status: 'voided', idempotencyKey },
            });
            return {
                result: voided,
                events: [{
                        type: event_types_1.EventType.PaymentVoided,
                        actor,
                        payload: { paymentId, orderId: payment.orderId, amount: payment.amount, reason: normalizedReason, idempotencyKey },
                        refs: [paymentId, payment.orderId].filter((ref) => Boolean(ref)),
                    }],
            };
        });
    }
    async refund(paymentId, amount, reason, requester, returnId, settlement = {}) {
        const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
        if (!payment) {
            throw new errors_1.ValidationError('payment_not_found', `Платёж ${paymentId} не найден`);
        }
        if (payment.amount <= 0) {
            throw new errors_1.ConflictError('not_refundable', 'Нельзя вернуть по возвратному платежу');
        }
        if (amount <= 0) {
            throw new errors_1.ValidationError('invalid_refund_amount', 'Сумма возврата должна быть больше 0');
        }
        if (!settlement.allocations?.length && amount > payment.amount) {
            throw new errors_1.ValidationError('invalid_refund_amount', `Сумма возврата должна быть 0 < amount ≤ ${payment.amount}`);
        }
        const allocations = settlement.allocations?.length
            ? settlement.allocations.map((allocation) => ({
                paymentId: allocation.paymentId.trim(),
                amount: allocation.amount,
                shiftId: allocation.shiftId?.trim() || null,
                externalReference: allocation.externalReference?.trim() || null,
            }))
            : [{
                    paymentId: payment.id,
                    amount,
                    shiftId: settlement.shiftId?.trim() || null,
                    externalReference: settlement.externalReference?.trim() || null,
                }];
        if (new Set(allocations.map((allocation) => allocation.paymentId)).size !== allocations.length) {
            throw new errors_1.ValidationError('duplicate_refund_tender', 'Исходный платёж нельзя указать в возврате дважды');
        }
        if (!allocations.some((allocation) => allocation.paymentId === payment.id)) {
            throw new errors_1.ValidationError('refund_anchor_missing', 'Аллокации должны включать платёж из URL');
        }
        if (allocations.some((allocation) => !allocation.paymentId || !Number.isInteger(allocation.amount) || allocation.amount <= 0)) {
            throw new errors_1.ValidationError('invalid_refund_allocation', 'Каждая аллокация возврата должна иметь платёж и положительную целую сумму');
        }
        if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) !== amount) {
            throw new errors_1.ValidationError('refund_allocation_total_mismatch', 'Сумма аллокаций не совпадает с общей суммой возврата');
        }
        const originals = await this.prisma.payment.findMany({ where: { id: { in: allocations.map((allocation) => allocation.paymentId) } } });
        if (originals.length !== allocations.length || originals.some((original) => original.amount <= 0)) {
            throw new errors_1.ValidationError('refund_allocation_payment_invalid', 'Все аллокации должны ссылаться на существующие положительные платежи');
        }
        const target = `${payment.orderId ?? ''}:${payment.serviceWorkOrderId ?? ''}`;
        if (originals.some((original) => `${original.orderId ?? ''}:${original.serviceWorkOrderId ?? ''}` !== target)) {
            throw new errors_1.ConflictError('refund_allocation_target_mismatch', 'Все платежи возврата должны относиться к одному документу');
        }
        const originalById = new Map(originals.map((original) => [original.id, original]));
        for (const allocation of allocations) {
            const original = originalById.get(allocation.paymentId);
            const prior = await this.prisma.payment.aggregate({
                where: { originalPaymentId: original.id },
                _sum: { amount: true },
            });
            if (allocation.amount > original.amount + (prior._sum.amount ?? 0)) {
                throw new errors_1.ValidationError('refund_exceeds_tender', `Возврат превышает остаток платежа ${original.id}`);
            }
        }
        if (returnId) {
            const ret = await this.prisma.return.findUnique({ where: { id: returnId } });
            if (!ret)
                throw new errors_1.ValidationError('return_not_found', `Возврат ${returnId} не найден`);
            if (!payment.orderId || ret.orderId !== payment.orderId) {
                throw new errors_1.ConflictError('refund_return_order_mismatch', 'Возврат и платёж относятся к разным заказам');
            }
            if (ret.status !== 'processing') {
                throw new errors_1.ConflictError('return_not_processing', `Refund можно запросить только для возврата processing (сейчас ${ret.status})`);
            }
            if (amount !== ret.refundAmount) {
                throw new errors_1.ValidationError('refund_return_amount_mismatch', `Сумма refund должна совпадать с расчётом возврата: ${ret.refundAmount}`);
            }
        }
        return this.approvals.request({
            action: 'refund',
            requester,
            reason,
            payload: {
                paymentId,
                amount,
                returnId: returnId ?? null,
                shiftId: settlement.shiftId?.trim() || null,
                externalReference: settlement.externalReference?.trim() || null,
                cashierStaffId: requester,
                allocations,
            },
        });
    }
    async findForStaff(staffId, where) {
        const ownOpenShift = await this.prisma.cashShift.findFirst({
            where: { staffId, closedAt: null },
            select: { id: true },
        });
        return this.prisma.payment.findMany({
            where: ownOpenShift
                ? {
                    AND: [
                        where,
                        {
                            OR: [
                                { shiftId: null },
                                { shiftId: { not: ownOpenShift.id } },
                            ],
                        },
                    ],
                }
                : where,
            orderBy: { createdAt: 'desc' },
        });
    }
    findByTxnId(txnId) {
        return this.prisma.payment.findUnique({ where: { txnId } });
    }
    async payForCustomer(customerId, dto, actor) {
        const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, customerId }, select: { id: true } });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
        }
        return this.pay(dto, actor);
    }
    async pay(dto, actor, context = {}) {
        const idempotencyKey = context.idempotencyKey?.trim() || dto.txnId?.trim();
        if (idempotencyKey) {
            const existing = await this.prisma.payment.findUnique({
                where: { idempotencyKey },
            });
            if (existing) {
                this.assertPaymentReplay(existing, dto, dto.orderId);
                const order = await this.prisma.order.findUnique({
                    where: { id: existing.orderId ?? dto.orderId },
                });
                return { order, payment: existing, idempotent: true };
            }
        }
        const paid = await this.payMany({
            orderId: dto.orderId,
            shiftId: dto.shiftId,
            payments: [
                {
                    method: dto.method,
                    amount: dto.amount,
                    txnId: dto.txnId,
                    idempotencyKey,
                    giftCardCode: dto.giftCardCode,
                },
            ],
        }, actor, context);
        return { ...paid, payment: paid.payments[0] };
    }
    async payMany(dto, actor, context = {}) {
        const tenders = dto.payments.map((payment) => {
            const normalized = this.normalizeTender(payment, dto.orderId);
            return { ...normalized, idempotencyKey: normalized.idempotencyKey?.trim() || normalized.txnId?.trim() };
        });
        if (tenders.length === 0) {
            throw new errors_1.ValidationError('payment_required', 'Нужен хотя бы один платёж');
        }
        const invalid = tenders.find((payment) => payment.amount <= 0);
        if (invalid) {
            throw new errors_1.ValidationError('invalid_payment_amount', 'Сумма платежа должна быть больше 0');
        }
        const missingGiftCard = tenders.find((payment) => payment.method === 'gift_card' && !payment.giftCardCode);
        if (missingGiftCard) {
            throw new errors_1.ValidationError('giftcard_code_required', 'Для оплаты подарочной картой нужен код');
        }
        const missingIdempotency = tenders.find((payment) => !payment.idempotencyKey);
        if (missingIdempotency) {
            throw new errors_1.ValidationError('payment_idempotency_required', 'Для каждого платежа нужен постоянный Idempotency-Key');
        }
        const missingProviderTxn = tenders.find((payment) => PROVIDER_TENDERS.has(payment.method) && !payment.txnId?.trim());
        if (missingProviderTxn) {
            throw new errors_1.ValidationError('payment_provider_txn_required', 'Электронный платёж требует provider txnId для сверки и возврата');
        }
        const idempotencyKeys = tenders.map((payment) => payment.idempotencyKey);
        if (new Set(idempotencyKeys).size !== idempotencyKeys.length) {
            throw new errors_1.ValidationError('duplicate_payment_idempotency', 'Idempotency-Key платежей не должны повторяться');
        }
        const txnIds = tenders.map((payment) => payment.txnId).filter((id) => Boolean(id));
        if (new Set(txnIds).size !== txnIds.length)
            throw new errors_1.ValidationError('duplicate_payment_txn', 'txnId платежей не должны повторяться');
        if (idempotencyKeys[0]) {
            const existing = await this.prisma.payment.findUnique({
                where: { idempotencyKey: idempotencyKeys[0] },
            });
            if (existing) {
                this.assertPaymentReplay(existing, tenders[0], dto.orderId);
                const [order, payments] = await Promise.all([
                    this.prisma.order.findUnique({ where: { id: existing.orderId ?? dto.orderId } }),
                    this.prisma.payment.findMany({
                        where: { idempotencyKey: { in: idempotencyKeys } },
                        orderBy: { createdAt: 'asc' },
                    }),
                ]);
                return { order, payment: existing, payments, idempotent: true };
            }
        }
        if (tenders.some((payment) => payment.method === 'gift_card') && this.orders) {
            const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
            if (order?.status === 'created' || order?.status === 'confirmed') {
                await this.orders.fulfill(order.id, actor);
            }
        }
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${dto.orderId} FOR UPDATE`;
            const order = await tx.order.findUnique({
                where: { id: dto.orderId },
                include: { items: true, storePoint: { select: { inventoryLocation: true } } },
            });
            if (!order) {
                throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
            }
            if (order.isDemo) {
                throw new errors_1.ConflictError('demo_payment_forbidden', `Демо-заказ ${order.id} не создаёт платёж и не меняет остатки`);
            }
            if (await tx.orderReceivable.count({ where: { orderId: order.id } }) > 0) {
                throw new errors_1.ConflictError('order_uses_receivable_schedule', 'Этот заказ оплачивается по отдельным начислениям; используйте receivable payment');
            }
            if (!PAYABLE_STATUSES.has(order.status)) {
                throw new errors_1.ConflictError('payment_without_reservation', `Заказ ${order.id} нельзя оплатить без резерва (статус: ${order.status})`);
            }
            const supplyByOrderItemId = new Map((await tx.orderLineSupply.findMany({
                where: { orderItemId: { in: order.items.map((item) => item.id) } },
                select: { orderItemId: true, status: true },
            })).map((row) => [row.orderItemId, row]));
            (0, order_inventory_sale_1.assertOrderLineSupplyReceived)(order.id, order.items, supplyByOrderItemId);
            let point = order.fulfillmentLocation?.trim() || order.storePoint?.inventoryLocation.trim();
            if (!point) {
                const imeis = order.items.map((item) => item.imei).filter((imei) => Boolean(imei));
                if (imeis.length > 0) {
                    const locations = await tx.deviceUnit.findMany({
                        where: { imei: { in: imeis } },
                        select: { location: true },
                        distinct: ['location'],
                    });
                    if (locations.length === 1)
                        point = locations[0].location.trim();
                }
            }
            if (!point) {
                throw new errors_1.ValidationError('payment_point_required', 'У заказа должна быть определена точка исполнения');
            }
            const received = await tx.payment.aggregate({
                where: { orderId: order.id, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
                _sum: { amount: true },
            });
            const alreadyReceived = received._sum.amount ?? 0;
            const batchTotal = tenders.reduce((sum, payment) => sum + payment.amount, 0);
            if (alreadyReceived + batchTotal > order.total) {
                throw new errors_1.ValidationError('payment_exceeds_order_total', 'Сумма платежей превышает итог заказа');
            }
            const cashShift = tenders.some((payment) => payment.method === 'cash')
                ? await this.resolveCashShiftOnTx(tx, dto.shiftId, context.staffId, point)
                : null;
            const events = [];
            const payments = [];
            const taxMetadata = (0, sales_tax_1.outputTaxMetadata)(order.items);
            let processedAmount = alreadyReceived;
            for (const tender of tenders) {
                let redeemedGiftCard = null;
                if (tender.method === 'gift_card') {
                    if (!this.giftcards || !tender.giftCardCode) {
                        throw new errors_1.ValidationError('giftcard_unavailable', 'Gift-card сервис недоступен');
                    }
                    redeemedGiftCard = await this.giftcards.redeemOnTx(tx, tender.giftCardCode, order.id, tender.amount, actor, events);
                }
                const payment = await tx.payment.create({
                    data: {
                        orderId: order.id,
                        amount: tender.amount,
                        method: tender.method,
                        status: 'received',
                        txnId: tender.txnId,
                        shiftId: tender.method === 'cash' ? cashShift?.id : null,
                        accountCode: (0, accounting_journal_1.paymentAccountCode)(tender.method),
                        idempotencyKey: tender.idempotencyKey,
                        receivedBy: actor,
                        point,
                        giftCardId: redeemedGiftCard?.id,
                    },
                });
                if (redeemedGiftCard) {
                    await tx.giftCardTransaction.create({
                        data: {
                            giftCardId: redeemedGiftCard.id,
                            paymentId: payment.id,
                            type: 'redemption',
                            amount: -tender.amount,
                            balanceAfter: redeemedGiftCard.balance,
                            sourceRef: `giftcard:payment:${payment.id}`,
                            actor,
                        },
                    });
                }
                const accountingEntry = await (0, accounting_journal_1.postPaymentEntryOnTx)(tx, {
                    payment,
                    idempotencyKey: tender.idempotencyKey,
                    point,
                    actor,
                    tax: {
                        ...taxMetadata,
                        taxAmount: (0, sales_tax_1.cumulativeTaxDelta)(order.taxAmount, order.total, processedAmount, tender.amount),
                    },
                });
                processedAmount += tender.amount;
                const postedPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
                payments.push(postedPayment);
                events.push({
                    type: event_types_1.EventType.PaymentReceived,
                    actor,
                    payload: {
                        orderId: order.id,
                        amount: tender.amount,
                        method: tender.method,
                        point,
                        accountCode: postedPayment.accountCode,
                        shiftId: postedPayment.shiftId,
                        accountingEntryId: accountingEntry.id,
                        taxAmount: accountingEntry.taxAmount,
                    },
                    refs: [order.id, payment.id],
                });
                events.push({
                    type: event_types_1.EventType.AccountingEntryPosted,
                    actor,
                    payload: { accountingEntryId: accountingEntry.id, sourceType: 'payment.receipt', sourceRef: payment.id },
                    refs: [accountingEntry.id, payment.id, order.id],
                });
            }
            if (alreadyReceived + batchTotal < order.total) {
                return { result: { order, payment: payments[0], payments, idempotent: false }, events };
            }
            if (await (0, order_inventory_sale_1.orderHasTrackedInventoryOnTx)(tx, order.id)) {
                await (0, order_inventory_sale_1.assertOrderReservationCoverageOnTx)(tx, order.id);
            }
            await (0, order_inventory_sale_1.finalizeOrderInventorySaleOnTx)(tx, {
                orderId: order.id,
                actor,
                units: this.units,
                events,
            });
            (0, order_state_machine_1.assertTransition)(order.status, 'paid');
            const paid = await tx.order.update({
                where: { id: order.id },
                data: { status: 'paid' },
            });
            events.push({
                type: event_types_1.EventType.OrderPaid,
                actor,
                payload: { orderId: order.id, total: order.total },
                refs: [order.id],
            });
            await this.campaignAttribution?.convertPaidOrderOnTx(tx, order.id, actor, events);
            if (this.outbox) {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: order.customerId,
                    template: 'payment_received',
                    payload: { orderId: order.id, amount: batchTotal, total: order.total },
                    transactional: true,
                });
            }
            return { result: { order: paid, payment: payments[0], payments, idempotent: false }, events };
        });
    }
    normalizeTender(payment, orderId) {
        if (payment.method !== 'gift_card' || !payment.giftCardCode || payment.txnId) {
            return payment;
        }
        const code = (0, giftcards_service_1.normalizeCode)(payment.giftCardCode);
        const key = `giftcard:${code}:${orderId}`;
        return { ...payment, giftCardCode: code, txnId: key, idempotencyKey: key };
    }
    assertPaymentReplay(existing, tender, orderId) {
        if (existing.orderId !== orderId ||
            existing.method !== tender.method ||
            existing.amount !== tender.amount ||
            (tender.txnId && existing.txnId !== tender.txnId)) {
            throw new errors_1.ConflictError('payment_idempotency_conflict', 'Idempotency-Key уже использован для другого платежа');
        }
    }
    async activateSupplyProcurementOnTx(tx, orderId, actor, events) {
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'order-supply:' + orderId}))::text AS locked`;
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
                storePoint: { select: { inventoryLocation: true } },
                items: {
                    where: { supplyModeSnapshot: 'to_order' },
                    include: {
                        orderLineSupply: {
                            include: { supplierOffer: true },
                        },
                    },
                    orderBy: { lineNumber: 'asc' },
                },
            },
        });
        if (!order || order.items.length === 0) {
            throw new errors_1.ConflictError('supply_order_missing', 'В заказе нет строк для закупки');
        }
        if (order.items.every((item) => item.orderLineSupply?.status === 'procurement_draft')) {
            return;
        }
        if (order.items.some((item) => item.orderLineSupply?.status !== 'awaiting_deposit')) {
            throw new errors_1.ConflictError('supply_activation_state_invalid', 'Строки заказа находятся в несовместимых состояниях закупки');
        }
        const point = order.fulfillmentLocation?.trim()
            || order.storePoint?.inventoryLocation.trim();
        if (!point) {
            throw new errors_1.ValidationError('purchase_order_location_required', 'У заказа не определён склад назначения');
        }
        const now = new Date();
        const quantityByOffer = new Map();
        for (const item of order.items) {
            const supply = item.orderLineSupply;
            const offer = supply?.supplierOffer;
            if (!item.productId
                || !item.supplierIdSnapshot
                || !item.supplyLeadDaysSnapshot
                || !supply
                || !offer
                || offer.supplierId !== item.supplierIdSnapshot) {
                throw new errors_1.ConflictError('supply_snapshot_incomplete', `Строка ${item.id} не содержит полного снимка поставки`);
            }
            if (!offer.active || offer.validUntil <= now) {
                throw new errors_1.ConflictError('supplier_quote_expired', `Цена поставщика для ${item.sku} устарела`);
            }
            const netSale = item.price * item.qty - item.discountAmount;
            const purchaseCost = offer.unitCost * item.qty;
            if (netSale <= 0 || (netSale - purchaseCost) * 10_000 < netSale * 1_000) {
                throw new errors_1.ConflictError('supplier_margin_approval_required', `Маржа по ${item.sku} ниже 10%; требуется одобрение владельца`);
            }
            quantityByOffer.set(offer.id, (quantityByOffer.get(offer.id) ?? 0) + item.qty);
        }
        for (const [offerId, quantity] of quantityByOffer) {
            const claimed = await tx.supplierOffer.updateMany({
                where: {
                    id: offerId,
                    active: true,
                    validUntil: { gt: now },
                    availableQty: { gte: quantity },
                },
                data: { availableQty: { decrement: quantity } },
            });
            if (claimed.count !== 1) {
                throw new errors_1.ConflictError('supplier_offer_unavailable', 'Поставщик больше не подтверждает нужное количество; задаток не принят');
            }
        }
        const itemsBySupplier = new Map();
        for (const item of order.items) {
            const supplierId = item.supplierIdSnapshot;
            const group = itemsBySupplier.get(supplierId) ?? [];
            group.push(item);
            itemsBySupplier.set(supplierId, group);
        }
        for (const [supplierId, items] of itemsBySupplier) {
            const sourceVersion = 1;
            const sourceKey = `customer-order:${order.id}:supplier:${supplierId}:v${sourceVersion}`;
            const purchaseOrder = await tx.purchaseOrder.create({
                data: {
                    number: purchaseOrderNumber(),
                    idempotencyKey: sourceKey,
                    supplierId,
                    sourceOrderId: order.id,
                    sourceKey,
                    sourceVersion,
                    location: point,
                    note: `Заказ покупателя ${order.id}; проверить цену перед отправкой`,
                    createdBy: actor,
                },
            });
            for (const item of items) {
                const offer = item.orderLineSupply.supplierOffer;
                const purchaseOrderItem = await tx.purchaseOrderItem.create({
                    data: {
                        purchaseOrderId: purchaseOrder.id,
                        productId: item.productId,
                        orderedQty: item.qty,
                        unitCost: offer.unitCost,
                    },
                });
                const promisedDate = bishkekPromisedDate(now, item.supplyLeadDaysSnapshot);
                await tx.orderLineSupply.update({
                    where: { orderItemId: item.id },
                    data: {
                        purchaseOrderItemId: purchaseOrderItem.id,
                        status: 'procurement_draft',
                        expectedAt: promisedDate,
                        actor,
                    },
                });
                await tx.orderItem.update({
                    where: { id: item.id },
                    data: {
                        promisedDate,
                        fulfillmentStatus: 'procurement_draft',
                    },
                });
            }
            events.push({
                type: event_types_1.EventType.PurchaseOrderCreated,
                actor,
                payload: {
                    purchaseOrderId: purchaseOrder.id,
                    number: purchaseOrder.number,
                    sourceOrderId: order.id,
                    supplierId,
                    status: 'draft',
                    items: items.length,
                },
                refs: [purchaseOrder.id, order.id, supplierId, ...items.map((item) => item.id)],
            });
        }
        if (order.status !== 'confirmed') {
            (0, order_state_machine_1.assertTransition)(order.status, 'confirmed');
            await tx.order.update({ where: { id: order.id }, data: { status: 'confirmed' } });
        }
        events.push({
            type: event_types_1.EventType.SupplyDepositConfirmed,
            actor,
            payload: {
                orderId: order.id,
                promisedDates: order.items.map((item) => ({
                    orderItemId: item.id,
                    leadDays: item.supplyLeadDaysSnapshot,
                })),
                purchaseOrders: itemsBySupplier.size,
            },
            refs: [order.id, ...order.items.map((item) => item.id)],
        });
    }
    async resolveCashShiftOnTx(tx, requestedShiftId, staffId, point) {
        if (!staffId) {
            throw new errors_1.ValidationError('cash_staff_required', 'Наличные принимает только авторизованный сотрудник');
        }
        const candidate = requestedShiftId
            ? await tx.cashShift.findUnique({ where: { id: requestedShiftId }, select: { id: true } })
            : await tx.cashShift.findFirst({ where: { staffId, closedAt: null }, select: { id: true }, orderBy: { openedAt: 'desc' } });
        if (!candidate)
            throw new errors_1.ConflictError('cash_shift_required', 'Для наличного платежа нужна открытая кассовая смена');
        await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${candidate.id} FOR UPDATE`;
        const shift = await tx.cashShift.findUnique({ where: { id: candidate.id } });
        if (!shift)
            throw new errors_1.ConflictError('cash_shift_required', 'Кассовая смена не найдена');
        if (shift.staffId !== staffId)
            throw new errors_1.ConflictError('cash_shift_foreign', 'Кассовая смена принадлежит другому сотруднику');
        if (shift.closedAt)
            throw new errors_1.ConflictError('cash_shift_closed', 'Нельзя добавить платёж в закрытую кассовую смену');
        if (shift.point !== point)
            throw new errors_1.ConflictError('cash_shift_wrong_point', 'Кассовая смена открыта в другой точке');
        return shift;
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        approvals_service_1.ApprovalsService,
        giftcards_service_1.GiftcardsService,
        orders_service_1.OrdersService,
        campaign_attribution_service_1.CampaignAttributionService,
        outbox_service_1.OutboxService])
], PaymentsService);
async function isOrderReceivableRecognizedOnTx(tx, receivable) {
    if (!['stock_sale', 'supply_balance', 'delivery'].includes(receivable.kind)) {
        return false;
    }
    const recognizedSources = [
        { sourceType: 'cod.receivable', sourceRef: receivable.orderId },
    ];
    if (receivable.kind === 'delivery') {
        recognizedSources.push({
            sourceType: 'order.delivery.handover',
            sourceRef: receivable.orderId,
        });
    }
    else if (receivable.orderItemId) {
        recognizedSources.push({
            sourceType: receivable.kind === 'supply_balance'
                ? 'order_line.handover'
                : 'order_item.handover',
            sourceRef: receivable.orderItemId,
        });
    }
    return (await tx.accountingJournalEntry.findFirst({
        where: {
            OR: recognizedSources,
            reversal: { is: null },
        },
        select: { id: true },
    })) !== null;
}
function purchaseOrderNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `PO-${date}-${(0, node_crypto_1.randomUUID)().slice(0, 6).toUpperCase()}`;
}
function bishkekPromisedDate(receivedAt, leadDays) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bishkek',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(receivedAt);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localDate = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + leadDays, 12));
    return localDate;
}
//# sourceMappingURL=payments.service.js.map