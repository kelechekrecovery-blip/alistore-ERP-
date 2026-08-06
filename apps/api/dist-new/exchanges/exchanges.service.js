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
exports.ExchangesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const order_state_machine_1 = require("../orders/order-state-machine");
const units_service_1 = require("../units/units.service");
const accounting_journal_1 = require("../finance/accounting-journal");
const sales_tax_1 = require("../finance/sales-tax");
const inventory_valuation_1 = require("../inventory/inventory-valuation");
const inventory_quarantine_1 = require("../inventory/inventory-quarantine");
const SURCHARGE_METHODS = new Set([
    client_1.PaymentMethod.cash,
    client_1.PaymentMethod.card,
    client_1.PaymentMethod.qr_mbank,
    client_1.PaymentMethod.qr_odengi,
    client_1.PaymentMethod.bakai_pos,
    client_1.PaymentMethod.obank,
]);
const EXCHANGE_REQUEST_TTL_MS = 30 * 60 * 1000;
let ExchangesService = class ExchangesService {
    constructor(prisma, audit, units, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.outbox = outbox;
    }
    async request(dto, actor, idempotencyKey) {
        const key = `exchange-request:${idempotencyKey.trim()}`;
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
            const existing = await tx.exchangeRequest.findUnique({ where: { idempotencyKey: key } });
            if (existing) {
                this.assertRequestReplay(existing, dto, actor);
                return {
                    result: this.requestResult(existing, true),
                    events: [],
                };
            }
            const snapshot = await this.prepareSnapshotOnTx(tx, dto, actor);
            const approval = await tx.approval.create({
                data: {
                    action: 'exchange',
                    requester: actor,
                    reason: `Обмен ${snapshot.oldImei} на ${snapshot.newImei}`,
                    evidence: {
                        payload: {
                            originalOrderId: snapshot.originalOrderId,
                            oldImei: snapshot.oldImei,
                            newProductId: snapshot.newProductId,
                            newImei: snapshot.newImei,
                            creditAmount: snapshot.creditAmount,
                            surchargeAmount: snapshot.surchargeAmount,
                            method: snapshot.method,
                            shiftId: snapshot.shiftId,
                            externalReference: snapshot.externalReference,
                        },
                        evidence: { required: 'exchange_condition' },
                    },
                },
            });
            const request = await tx.exchangeRequest.create({
                data: {
                    ...snapshot,
                    idempotencyKey: key,
                    approvalId: approval.id,
                    requester: actor,
                    expiresAt: new Date(Date.now() + EXCHANGE_REQUEST_TTL_MS),
                },
            });
            const replacementUnit = await tx.deviceUnit.findUnique({
                where: { id: request.newUnitId },
                select: { acquisitionCost: true },
            });
            const replacementProduct = await tx.product.findUnique({
                where: { id: request.newProductId },
                select: { cost: true },
            });
            if (!replacementUnit || !replacementProduct) {
                throw new errors_1.ConflictError('exchange_replacement_missing', 'Товар-замена больше не доступен');
            }
            const held = await tx.deviceUnit.updateMany({
                where: { id: request.newUnitId, status: 'in_stock', orderId: null },
                data: {
                    status: 'reserved',
                    acquisitionCost: replacementUnit.acquisitionCost ?? replacementProduct.cost,
                },
            });
            if (held.count !== 1) {
                throw new errors_1.ConflictError('exchange_replacement_race', 'Выбранный IMEI уже занят другой операцией');
            }
            if (this.outbox) {
                await (0, customer_notifications_1.enqueueStaffNotice)(tx, this.outbox, {
                    template: 'approval_requested',
                    title: 'Нужно согласование',
                    body: `exchange · ${request.oldImei} → ${request.newImei}`,
                    payload: { approvalId: approval.id, action: 'exchange', exchangeRequestId: request.id, deepLink: `alistore-admin://approvals/${approval.id}` },
                });
            }
            return {
                result: this.requestResult(request, false),
                events: [{
                        type: event_types_1.EventType.ApprovalRequested,
                        actor,
                        payload: {
                            approvalId: approval.id,
                            action: 'exchange',
                            exchangeRequestId: request.id,
                            oldImei: request.oldImei,
                            newImei: request.newImei,
                            creditAmount: request.creditAmount,
                            surchargeAmount: request.surchargeAmount,
                        },
                        refs: [approval.id, request.id, request.originalOrderId, request.oldImei, request.newImei],
                    }],
            };
        });
    }
    async executeApprovedOnTx(tx, exchangeRequestId, approver, approvalId) {
        await tx.$queryRaw `SELECT id FROM "ExchangeRequest" WHERE id = ${exchangeRequestId} FOR UPDATE`;
        const request = await tx.exchangeRequest.findUnique({ where: { id: exchangeRequestId } });
        if (!request || request.approvalId !== approvalId) {
            throw new errors_1.ConflictError('exchange_approval_snapshot_changed', 'Заявка обмена не связана с этим approval');
        }
        if (request.status !== 'requested') {
            throw new errors_1.ConflictError('exchange_already_resolved', `Заявка обмена уже ${request.status}`);
        }
        if (request.expiresAt <= new Date()) {
            throw new errors_1.ConflictError('exchange_request_expired', 'Срок согласования обмена истёк');
        }
        if (request.requester === approver) {
            throw new errors_1.ConflictError('exchange_four_eyes_required', 'Инициатор не может одобрить собственный обмен');
        }
        const evidenceEvents = await tx.auditEvent.findMany({
            where: { type: event_types_1.EventType.EvidenceAttached, refs: { has: request.id } },
            orderBy: { ts: 'desc' },
        });
        const hasConditionEvidence = evidenceEvents.some((event) => {
            const payload = event.payload;
            const asset = payload.asset;
            return payload.entityType === 'exchange'
                && payload.entityId === request.id
                && payload.label === 'exchange_condition'
                && payload.trustedStaffEvidence === true
                && event.actor === `staff:${request.requester}`
                && typeof asset?.key === 'string'
                && asset.key.length > 0;
        });
        if (!hasConditionEvidence) {
            throw new errors_1.ConflictError('exchange_evidence_required', 'Добавьте фото состояния устройства перед одобрением');
        }
        const dto = {
            originalOrderId: request.originalOrderId,
            oldImei: request.oldImei,
            newProductId: request.newProductId,
            method: request.method,
            shiftId: request.shiftId ?? undefined,
            externalReference: request.externalReference ?? undefined,
        };
        const execution = await this.executeOnTx(tx, dto, request.requester, `exchange:approval:${approvalId}`, request.newImei, request.id, { creditAmount: request.creditAmount, surchargeAmount: request.surchargeAmount });
        await tx.exchangeRequest.update({
            where: { id: request.id },
            data: {
                status: 'executed',
                exchangeOrderId: execution.result.exchangeOrderId,
                returnId: execution.result.returnId,
                executedAt: new Date(),
            },
        });
        execution.events.push({
            type: event_types_1.EventType.ExchangeExecuted,
            actor: approver,
            payload: {
                exchangeRequestId: request.id,
                approvalId,
                exchangeOrderId: execution.result.exchangeOrderId,
                returnId: execution.result.returnId,
            },
            refs: [request.id, approvalId, execution.result.exchangeOrderId, execution.result.returnId],
        });
        return execution;
    }
    async rejectApprovedOnTx(tx, exchangeRequestId, approvalId, actor, reason, events) {
        const request = await tx.exchangeRequest.findUnique({ where: { id: exchangeRequestId } });
        if (!request || request.approvalId !== approvalId || request.status !== 'requested') {
            throw new errors_1.ConflictError('exchange_approval_snapshot_changed', 'Заявка обмена больше не ожидает это согласование');
        }
        await tx.exchangeRequest.update({
            where: { id: request.id },
            data: { status: 'rejected', rejectedAt: new Date() },
        });
        const released = await tx.deviceUnit.updateMany({
            where: { id: request.newUnitId, status: 'reserved', orderId: null },
            data: { status: 'in_stock' },
        });
        if (released.count !== 1) {
            throw new errors_1.ConflictError('exchange_replacement_hold_lost', 'Резерв replacement IMEI больше не принадлежит заявке');
        }
        events.push({
            type: event_types_1.EventType.ExchangeRejected,
            actor,
            payload: { exchangeRequestId: request.id, approvalId, reason },
            refs: [request.id, approvalId, request.originalOrderId],
        });
    }
    async sweepExpired(now = new Date()) {
        const candidates = await this.prisma.exchangeRequest.findMany({
            where: { status: 'requested', expiresAt: { lte: now } },
            select: { id: true, approvalId: true },
        });
        let expired = 0;
        for (const candidate of candidates) {
            const didExpire = await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "Approval" WHERE id = ${candidate.approvalId} FOR UPDATE`;
                const events = [];
                const result = await this.expireIfPastDeadlineOnTx(tx, candidate.id, candidate.approvalId, now, events);
                return {
                    result,
                    events,
                };
            });
            if (didExpire)
                expired += 1;
        }
        return { expired };
    }
    async expireIfPastDeadlineOnTx(tx, exchangeRequestId, approvalId, now, events) {
        await tx.$queryRaw `SELECT id FROM "ExchangeRequest" WHERE id = ${exchangeRequestId} FOR UPDATE`;
        const request = await tx.exchangeRequest.findUnique({ where: { id: exchangeRequestId } });
        if (!request || request.approvalId !== approvalId) {
            throw new errors_1.ConflictError('exchange_approval_snapshot_changed', 'Заявка обмена не связана с этим approval');
        }
        if (request.status !== 'requested' || request.expiresAt > now)
            return false;
        const released = await tx.deviceUnit.updateMany({
            where: { id: request.newUnitId, status: 'reserved', orderId: null },
            data: { status: 'in_stock' },
        });
        if (released.count !== 1) {
            throw new errors_1.ConflictError('exchange_replacement_hold_lost', 'Истёкший резерв replacement IMEI потерян');
        }
        await tx.exchangeRequest.update({
            where: { id: request.id },
            data: { status: 'expired', expiredAt: now },
        });
        await tx.approval.update({
            where: { id: approvalId },
            data: { status: 'rejected', approver: 'system' },
        });
        events.push({
            type: event_types_1.EventType.ExchangeExpired,
            actor: 'system',
            payload: { exchangeRequestId: request.id, approvalId, expiresAt: request.expiresAt.toISOString() },
            refs: [request.id, approvalId, request.newImei],
        });
        return true;
    }
    async executeOnTx(tx, dto, actor, key, exactNewImei, exchangeRequestId, expectedAmounts) {
        if (key) {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
            const existing = await tx.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
            if (existing)
                return { result: await this.replayExchange(existing, dto, tx), events: [] };
        }
        await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${dto.originalOrderId} FOR UPDATE`;
        const order = await tx.order.findUnique({
            where: { id: dto.originalOrderId },
            include: { items: true },
        });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.originalOrderId} не найден`);
        }
        const oldItem = order.items.find((i) => i.imei === dto.oldImei);
        if (!oldItem) {
            throw new errors_1.ValidationError('item_not_found', `IMEI ${dto.oldImei} не в этом заказе`);
        }
        const oldUnit = await tx.deviceUnit.findUnique({ where: { imei: dto.oldImei } });
        if (!oldUnit || oldUnit.status !== 'sold') {
            throw new errors_1.ConflictError('not_exchangeable', `IMEI ${dto.oldImei} не продан — обмен невозможен`);
        }
        if (oldUnit.orderId !== order.id || oldItem.qty !== 1) {
            throw new errors_1.ConflictError('exchange_unit_state_mismatch', 'Серийный товар не принадлежит выбранной строке заказа');
        }
        const oldConsignment = await tx.consignmentItem.findUnique({ where: { unitId: oldUnit.id }, select: { id: true } });
        if (oldConsignment) {
            throw new errors_1.ConflictError('exchange_consignment_requires_return', 'Комиссионный товар обменивается через обычный возврат');
        }
        (0, order_state_machine_1.assertTransition)(order.status, 'exchanged');
        const newProduct = await tx.product.findUnique({ where: { id: dto.newProductId } });
        if (!newProduct) {
            throw new errors_1.ValidationError('product_not_found', 'Новый товар не найден');
        }
        const creditAmount = oldItem.price - oldItem.discountAmount;
        if (creditAmount <= 0) {
            throw new errors_1.ConflictError('exchange_credit_invalid', 'У возвращаемого товара нет положительной зачётной стоимости');
        }
        const exactSurcharge = newProduct.price - creditAmount;
        if (exactSurcharge < 0) {
            throw new errors_1.ValidationError('exchange_needs_refund', 'Новый товар дешевле — оформите возврат + refund (через approval)');
        }
        if (!SURCHARGE_METHODS.has(dto.method)) {
            throw new errors_1.ValidationError('exchange_surcharge_method_invalid', 'Этот способ доплаты для обмена не поддерживается');
        }
        const expectedLocation = order.fulfillmentLocation ?? order.storePointCode;
        const newUnit = await tx.deviceUnit.findFirst({
            where: {
                productId: newProduct.id,
                status: exchangeRequestId ? 'reserved' : 'in_stock',
                consignmentItem: { is: null },
                ...(exactNewImei ? { imei: exactNewImei } : {}),
                ...(expectedLocation ? { location: expectedLocation } : {}),
            },
            orderBy: { id: 'asc' },
        });
        if (!newUnit) {
            throw new errors_1.ConflictError('no_stock', exactNewImei
                ? `IMEI ${exactNewImei} из согласованного snapshot больше недоступен`
                : `Нет свободных единиц ${newProduct.sku}`);
        }
        const newConsignment = await tx.consignmentItem.findUnique({ where: { unitId: newUnit.id }, select: { id: true } });
        if (newConsignment) {
            throw new errors_1.ConflictError('exchange_consignment_requires_return', 'Комиссионный товар нельзя выдать как замену');
        }
        const point = order.storePointCode ?? newUnit.location;
        const externalReference = dto.externalReference?.trim() || null;
        const cashShift = exactSurcharge > 0 && dto.method === client_1.PaymentMethod.cash
            ? await this.resolveCashShiftOnTx(tx, dto.shiftId, actor, point)
            : null;
        await this.validateProviderSurchargeReferenceOnTx(tx, exactSurcharge, dto.method, externalReference, exchangeRequestId);
        if (expectedAmounts && (expectedAmounts.creditAmount !== creditAmount
            || expectedAmounts.surchargeAmount !== exactSurcharge)) {
            throw new errors_1.ConflictError('exchange_financial_snapshot_changed', 'Цена или зачёт изменились после запроса обмена');
        }
        const newTax = (0, sales_tax_1.salesTaxSnapshot)([{
                lineNumber: 1,
                grossAmount: newProduct.price,
                taxCode: newProduct.taxCode,
                taxRateBps: newProduct.taxRateBps,
            }], newProduct.price);
        const oldTaxAmount = Math.min(oldItem.taxAmount, creditAmount);
        const oldRevenueAmount = creditAmount - oldTaxAmount;
        const oldTaxMetadata = (0, sales_tax_1.outputTaxMetadata)([oldItem]);
        const events = [];
        const returned = await tx.deviceUnit.updateMany({
            where: { imei: dto.oldImei, status: 'sold', orderId: order.id },
            data: { status: 'returned', orderId: null },
        });
        if (returned.count !== 1)
            throw new errors_1.ConflictError('exchange_unit_race', 'Товар уже изменён другой операцией');
        events.push({
            type: event_types_1.EventType.UnitReturned,
            actor,
            payload: { imei: dto.oldImei, orderId: order.id },
            refs: [order.id, dto.oldImei],
        });
        const ret = await tx.return.create({
            data: {
                orderId: order.id,
                reason: 'обмен',
                status: 'reconciled',
                refundAmount: creditAmount,
                isFullOrder: order.items.length === 1,
                items: { create: { orderItemId: oldItem.id, qty: 1, refundAmount: creditAmount } },
            },
        });
        const oldIssue = await tx.inventoryValuationIssue.findFirst({
            where: { orderId: order.id, imei: dto.oldImei, sourceType: 'sale', reversedQty: 0 },
            orderBy: { createdAt: 'desc' },
        });
        const quarantine = await (0, inventory_quarantine_1.createQuarantineCaseOnTx)(tx, {
            unitId: oldUnit.id,
            sourceType: 'exchange',
            returnId: ret.id,
            reason: 'обмен',
            unitCost: oldIssue?.unitCost ?? oldUnit.acquisitionCost ?? 0,
            actor,
        });
        events.push({
            type: event_types_1.EventType.InventoryQuarantined,
            actor,
            payload: { quarantineId: quarantine.id, returnId: ret.id, orderId: order.id, imei: dto.oldImei, location: oldUnit.location },
            refs: [quarantine.id, ret.id, order.id, dto.oldImei],
        });
        events.push({
            type: event_types_1.EventType.ReturnCompleted,
            actor,
            payload: { returnId: ret.id, orderId: order.id, kind: 'exchange' },
            refs: [ret.id, order.id],
        });
        const oldSaleReversal = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
            idempotencyKey: `accounting:exchange:return:${ret.id}`,
            sourceType: 'exchange.return',
            sourceRef: ret.id,
            description: `Сторно продажи при обмене ${ret.id}`,
            point,
            documentAmount: creditAmount,
            baseAmount: creditAmount,
            taxCode: oldTaxMetadata.taxCode,
            taxRateBps: oldTaxMetadata.taxRateBps,
            taxAmount: oldTaxAmount,
            occurredAt: new Date(),
            createdBy: actor,
            lines: [
                ...(oldRevenueAmount > 0 ? [{ accountCode: '4000', debit: oldRevenueAmount, memo: 'Сторно выручки возвращённого товара' }] : []),
                ...(oldTaxAmount > 0 ? [{ accountCode: '2200', debit: oldTaxAmount, memo: 'Сторно исходящего НДС возвращённого товара' }] : []),
                { accountCode: '1100', credit: creditAmount, memo: 'Кредит покупателя для обмена' },
            ],
        });
        events.push(accountingEvent(actor, oldSaleReversal.id, 'exchange.return', ret.id, creditAmount, [ret.id, order.id]));
        if (oldIssue) {
            const oldCost = await (0, inventory_valuation_1.reverseInventoryCostOnTx)(tx, {
                issueId: oldIssue.id,
                quantity: 1,
                returnId: ret.id,
                location: oldUnit.location,
                actor,
            });
            if (oldCost.entry) {
                events.push(accountingEvent(actor, oldCost.entry.id, 'inventory.return', oldIssue.id, oldCost.totalCost, [ret.id, order.id, dto.oldImei]));
            }
        }
        const newOrder = await tx.order.create({
            data: {
                customerId: order.customerId,
                idempotencyKey: key,
                channel: 'exchange',
                storePointCode: point,
                fulfillmentLocation: newUnit.location,
                subtotal: newProduct.price,
                total: newProduct.price,
                taxBaseAmount: newTax.taxBaseAmount,
                taxAmount: newTax.taxAmount,
                status: 'paid',
                items: { create: [{
                            lineNumber: 1,
                            sku: newProduct.sku,
                            qty: 1,
                            price: newProduct.price,
                            unitCost: newUnit.acquisitionCost ?? newProduct.cost,
                            taxCode: newTax.lines[0].taxCode,
                            taxRateBps: newTax.lines[0].taxRateBps,
                            taxBaseAmount: newTax.lines[0].taxBaseAmount,
                            taxAmount: newTax.lines[0].taxAmount,
                            imei: newUnit.imei,
                        }] },
            },
        });
        if (exchangeRequestId) {
            const request = await tx.exchangeRequest.findUnique({ where: { id: exchangeRequestId } });
            if (!request || request.newUnitId !== newUnit.id || request.status !== 'requested') {
                throw new errors_1.ConflictError('exchange_replacement_hold_lost', 'Replacement IMEI больше не закреплён за заявкой');
            }
            const assigned = await tx.deviceUnit.updateMany({
                where: { id: newUnit.id, status: 'reserved', orderId: null },
                data: { orderId: newOrder.id },
            });
            if (assigned.count !== 1)
                throw new errors_1.ConflictError('exchange_replacement_hold_lost', 'Replacement IMEI уже занят');
        }
        else {
            await this.units.reserveOnTx(tx, newUnit.imei, newOrder.id);
        }
        const replacementValuation = await this.units.sellOnTx(tx, newUnit.imei, newOrder.id, actor);
        const newTaxMetadata = (0, sales_tax_1.outputTaxMetadata)(newTax.lines);
        const replacementSale = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
            idempotencyKey: `accounting:exchange:sale:${newOrder.id}`,
            sourceType: 'exchange.sale',
            sourceRef: newOrder.id,
            description: `Продажа замены по обмену ${newOrder.id}`,
            point,
            documentAmount: newProduct.price,
            baseAmount: newProduct.price,
            taxCode: newTaxMetadata.taxCode,
            taxRateBps: newTaxMetadata.taxRateBps,
            taxAmount: newTax.taxAmount,
            occurredAt: new Date(),
            createdBy: actor,
            lines: [
                { accountCode: '1100', debit: newProduct.price, memo: 'Дебиторка по товару-замене' },
                ...(newTax.taxBaseAmount > 0 ? [{ accountCode: '4000', credit: newTax.taxBaseAmount, memo: 'Выручка по товару-замене' }] : []),
                ...(newTax.taxAmount > 0 ? [{ accountCode: '2200', credit: newTax.taxAmount, memo: 'Исходящий НДС по товару-замене' }] : []),
            ],
        });
        events.push(accountingEvent(actor, replacementSale.id, 'exchange.sale', newOrder.id, newProduct.price, [newOrder.id, ret.id]));
        if (replacementValuation?.entry) {
            events.push(accountingEvent(actor, replacementValuation.entry.id, 'inventory.cogs', replacementValuation.issue.id, replacementValuation.issue.totalCost, [newOrder.id, newUnit.imei]));
        }
        events.push({ type: event_types_1.EventType.OrderCreated, actor, payload: { orderId: newOrder.id, channel: 'exchange' }, refs: [newOrder.id] }, { type: event_types_1.EventType.UnitSold, actor, payload: { orderId: newOrder.id, imei: newUnit.imei }, refs: [newOrder.id, newUnit.imei] }, { type: event_types_1.EventType.OrderPaid, actor, payload: { orderId: newOrder.id, total: newProduct.price }, refs: [newOrder.id] });
        if (exactSurcharge > 0) {
            const payment = await tx.payment.create({
                data: {
                    orderId: newOrder.id,
                    amount: exactSurcharge,
                    method: dto.method,
                    status: 'received',
                    shiftId: cashShift?.id,
                    point,
                    receivedBy: actor,
                    txnId: externalReference,
                    idempotencyKey: `exchange:${newOrder.id}:surcharge`,
                    accountCode: (0, accounting_journal_1.paymentAccountCode)(dto.method),
                },
            });
            const surchargeEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                idempotencyKey: `accounting:exchange:surcharge:${payment.id}`,
                sourceType: 'exchange.surcharge',
                sourceRef: payment.id,
                description: `Доплата по обмену ${newOrder.id}`,
                point,
                documentAmount: exactSurcharge,
                baseAmount: exactSurcharge,
                occurredAt: payment.createdAt,
                createdBy: actor,
                lines: [
                    { accountCode: (0, accounting_journal_1.paymentAccountCode)(dto.method), debit: exactSurcharge, memo: 'Получена доплата по обмену' },
                    { accountCode: '1100', credit: exactSurcharge, memo: 'Погашение дебиторки по обмену' },
                ],
            });
            await tx.payment.update({ where: { id: payment.id }, data: { accountingEntryId: surchargeEntry.id } });
            events.push(accountingEvent(actor, surchargeEntry.id, 'exchange.surcharge', payment.id, exactSurcharge, [newOrder.id, payment.id]));
            events.push({
                type: event_types_1.EventType.PaymentReceived,
                actor,
                payload: { orderId: newOrder.id, amount: exactSurcharge, method: dto.method, kind: 'exchange_surcharge', shiftId: cashShift?.id ?? null, externalReference },
                refs: [newOrder.id, payment.id],
            });
        }
        const fullOrderExchange = order.items.length === 1;
        if (fullOrderExchange) {
            await tx.order.update({ where: { id: order.id }, data: { status: 'exchanged' } });
        }
        events.push({
            type: event_types_1.EventType.OrderExchanged,
            actor,
            payload: { orderId: order.id, into: newOrder.id, returnId: ret.id, oldImei: dto.oldImei, newImei: newUnit.imei, creditAmount, surcharge: exactSurcharge, method: dto.method, fullOrderExchange },
            refs: [order.id, newOrder.id],
        });
        if (this.outbox) {
            await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                customerId: order.customerId,
                template: 'exchange_completed',
                payload: { orderId: order.id, exchangeOrderId: newOrder.id, returnId: ret.id },
                transactional: true,
            });
        }
        return {
            result: {
                exchangeOrderId: newOrder.id,
                returnId: ret.id,
                surcharge: exactSurcharge,
                oldImei: dto.oldImei,
                newImei: newUnit.imei,
                idempotent: false,
            },
            events,
        };
    }
    async prepareSnapshotOnTx(tx, dto, actor) {
        const order = await tx.order.findUnique({ where: { id: dto.originalOrderId }, include: { items: true } });
        if (!order)
            throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.originalOrderId} не найден`);
        const oldItem = order.items.find((item) => item.imei === dto.oldImei);
        if (!oldItem)
            throw new errors_1.ValidationError('item_not_found', `IMEI ${dto.oldImei} не в этом заказе`);
        const oldUnit = await tx.deviceUnit.findUnique({ where: { imei: dto.oldImei } });
        if (!oldUnit || oldUnit.status !== 'sold' || oldUnit.orderId !== order.id || oldItem.qty !== 1) {
            throw new errors_1.ConflictError('not_exchangeable', `IMEI ${dto.oldImei} нельзя обменять`);
        }
        if (await tx.consignmentItem.findUnique({ where: { unitId: oldUnit.id }, select: { id: true } })) {
            throw new errors_1.ConflictError('exchange_consignment_requires_return', 'Комиссионный товар обменивается через обычный возврат');
        }
        (0, order_state_machine_1.assertTransition)(order.status, 'exchanged');
        const newProduct = await tx.product.findUnique({ where: { id: dto.newProductId } });
        if (!newProduct)
            throw new errors_1.ValidationError('product_not_found', 'Новый товар не найден');
        const creditAmount = oldItem.price - oldItem.discountAmount;
        const surchargeAmount = newProduct.price - creditAmount;
        if (creditAmount <= 0)
            throw new errors_1.ConflictError('exchange_credit_invalid', 'Нет положительной зачётной стоимости');
        if (surchargeAmount < 0)
            throw new errors_1.ValidationError('exchange_needs_refund', 'Новый товар дешевле — используйте возврат + refund');
        if (!SURCHARGE_METHODS.has(dto.method))
            throw new errors_1.ValidationError('exchange_surcharge_method_invalid', 'Способ доплаты не поддерживается');
        const location = order.fulfillmentLocation ?? order.storePointCode;
        const newUnit = await tx.deviceUnit.findFirst({
            where: {
                productId: newProduct.id,
                status: 'in_stock',
                consignmentItem: { is: null },
                ...(location ? { location } : {}),
            },
            orderBy: { id: 'asc' },
        });
        if (!newUnit)
            throw new errors_1.ConflictError('no_stock', `Нет свободных единиц ${newProduct.sku}`);
        await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE id = ${newUnit.id} FOR UPDATE`;
        const lockedNewUnit = await tx.deviceUnit.findUnique({ where: { id: newUnit.id } });
        if (!lockedNewUnit || lockedNewUnit.status !== 'in_stock' || lockedNewUnit.orderId) {
            throw new errors_1.ConflictError('exchange_replacement_race', 'Выбранный IMEI уже занят другой операцией');
        }
        const point = order.storePointCode ?? newUnit.location;
        const externalReference = dto.externalReference?.trim() || null;
        const shift = surchargeAmount > 0 && dto.method === client_1.PaymentMethod.cash
            ? await this.resolveCashShiftOnTx(tx, dto.shiftId, actor, point)
            : null;
        await this.validateProviderSurchargeReferenceOnTx(tx, surchargeAmount, dto.method, externalReference);
        return {
            originalOrderId: order.id,
            oldImei: dto.oldImei,
            newProductId: newProduct.id,
            newUnitId: lockedNewUnit.id,
            newImei: lockedNewUnit.imei,
            creditAmount,
            surchargeAmount,
            method: dto.method,
            shiftId: shift?.id ?? null,
            externalReference,
        };
    }
    assertRequestReplay(request, dto, actor) {
        if (request.requester !== actor
            || request.originalOrderId !== dto.originalOrderId
            || request.oldImei !== dto.oldImei
            || request.newProductId !== dto.newProductId
            || request.method !== dto.method
            || (dto.shiftId?.trim() ? request.shiftId !== dto.shiftId.trim() : false)
            || request.externalReference !== (dto.externalReference?.trim() || null)) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован для другой заявки обмена');
        }
    }
    requestResult(request, idempotent) {
        return {
            exchangeRequestId: request.id,
            approvalId: request.approvalId,
            status: request.status,
            oldImei: request.oldImei,
            newImei: request.newImei,
            creditAmount: request.creditAmount,
            surchargeAmount: request.surchargeAmount,
            evidenceRequired: true,
            expiresAt: request.expiresAt.toISOString(),
            idempotent,
        };
    }
    async replayExchange(exchangeOrder, dto, db = this.prisma) {
        const [product, event, payment] = await Promise.all([
            db.product.findUnique({ where: { id: dto.newProductId } }),
            db.auditEvent.findFirst({ where: { type: event_types_1.EventType.OrderExchanged, refs: { has: exchangeOrder.id } }, orderBy: { ts: 'desc' } }),
            db.payment.findFirst({ where: { orderId: exchangeOrder.id, amount: { gt: 0 } }, orderBy: { createdAt: 'asc' } }),
        ]);
        const payload = (event?.payload ?? {});
        const returnId = typeof payload.returnId === 'string' ? payload.returnId : '';
        const ret = returnId ? await db.return.findUnique({ where: { id: returnId } }) : null;
        const requestedShiftId = dto.shiftId?.trim() || null;
        const surcharge = typeof payload.surcharge === 'number' ? payload.surcharge : payment?.amount ?? 0;
        if (!product || exchangeOrder.items[0]?.sku !== product.sku ||
            payload.orderId !== dto.originalOrderId || payload.oldImei !== dto.oldImei || payload.method !== dto.method || !ret ||
            (surcharge > 0 && (payment?.txnId ?? null) !== (dto.externalReference?.trim() || null)) ||
            (requestedShiftId !== null && (payment?.shiftId ?? null) !== requestedShiftId)) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован для другого обмена');
        }
        return {
            exchangeOrderId: exchangeOrder.id,
            returnId: ret.id,
            surcharge,
            oldImei: dto.oldImei,
            newImei: exchangeOrder.items[0]?.imei ?? String(payload.newImei ?? ''),
            idempotent: true,
        };
    }
    async validateProviderSurchargeReferenceOnTx(tx, surchargeAmount, method, externalReference, exchangeRequestId) {
        if (surchargeAmount <= 0 || method === client_1.PaymentMethod.cash)
            return;
        if (!externalReference) {
            throw new errors_1.ValidationError('exchange_provider_reference_required', 'Безналичная доплата требует подтверждённый provider/terminal reference');
        }
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${`exchange-provider-reference:${externalReference}`}))::text AS locked`;
        const existingPayment = await tx.payment.findUnique({ where: { txnId: externalReference } });
        if (existingPayment) {
            throw new errors_1.ConflictError('exchange_provider_reference_used', 'Provider reference уже использован в платеже');
        }
        const existingExchange = await tx.exchangeRequest.findFirst({
            where: {
                externalReference,
                status: { in: ['requested', 'executed'] },
                ...(exchangeRequestId ? { id: { not: exchangeRequestId } } : {}),
            },
            select: { id: true },
        });
        if (existingExchange) {
            throw new errors_1.ConflictError('exchange_provider_reference_used', 'Provider reference уже закреплён за другим обменом');
        }
    }
    async resolveCashShiftOnTx(tx, requestedShiftId, actor, point) {
        const shift = requestedShiftId?.trim()
            ? await tx.cashShift.findUnique({ where: { id: requestedShiftId.trim() } })
            : await tx.cashShift.findFirst({ where: { staffId: actor, point, closedAt: null }, orderBy: { openedAt: 'desc' } });
        if (!shift)
            throw new errors_1.ConflictError('cash_shift_required', 'Для наличной доплаты нужна открытая кассовая смена');
        await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${shift.id} FOR UPDATE`;
        const locked = await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
        if (locked.staffId !== actor)
            throw new errors_1.ConflictError('cash_shift_foreign', 'Кассовая смена принадлежит другому сотруднику');
        if (locked.closedAt)
            throw new errors_1.ConflictError('cash_shift_closed', 'Кассовая смена уже закрыта');
        if (locked.point !== point)
            throw new errors_1.ConflictError('cash_shift_wrong_point', 'Кассовая смена открыта в другой точке');
        return locked;
    }
};
exports.ExchangesService = ExchangesService;
exports.ExchangesService = ExchangesService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        outbox_service_1.OutboxService])
], ExchangesService);
function accountingEvent(actor, accountingEntryId, sourceType, sourceRef, amount, refs) {
    return {
        type: event_types_1.EventType.AccountingEntryPosted,
        actor,
        payload: { accountingEntryId, sourceType, sourceRef, amount },
        refs: [accountingEntryId, ...refs],
    };
}
//# sourceMappingURL=exchanges.service.js.map