"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTION_REJECTION_EXECUTORS = exports.ACTION_EXECUTORS = void 0;
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const order_state_machine_1 = require("../orders/order-state-machine");
const debt_insert_1 = require("../debts/debt-insert");
const loyalty_ledger_1 = require("../customers/loyalty-ledger");
const campaign_refund_adjustment_1 = require("../campaigns/campaign-refund-adjustment");
const accounting_journal_1 = require("../finance/accounting-journal");
const sales_tax_1 = require("../finance/sales-tax");
const inventory_valuation_1 = require("../inventory/inventory-valuation");
const storefront_publish_1 = require("../storefront/storefront-publish");
const prisma_errors_1 = require("../common/prisma-errors");
const store_point_identity_1 = require("../common/store-point-identity");
const procurement_draft = async (tx, payload, approver, approvalId, events) => {
    const idempotencyKey = String(payload['idempotencyKey'] ?? '').trim();
    const supplierId = String(payload['supplierId'] ?? '').trim();
    const requestedLocation = String(payload['location'] ?? '').trim();
    const note = typeof payload['note'] === 'string' ? payload['note'].trim() : null;
    const rawItems = payload['items'];
    if (!idempotencyKey || !supplierId || !requestedLocation || !Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) {
        throw new errors_1.ValidationError('procurement_draft_snapshot_invalid', 'Снимок закупочного draft повреждён');
    }
    const items = rawItems.map((raw) => ({
        productId: String(raw['productId'] ?? '').trim(),
        qty: Number(raw['qty']),
        unitCost: Number(raw['unitCost']),
    }));
    if (items.some((item) => !item.productId || !Number.isSafeInteger(item.qty) || item.qty < 1 || !Number.isSafeInteger(item.unitCost) || item.unitCost < 0)
        || new Set(items.map((item) => item.productId)).size !== items.length) {
        throw new errors_1.ValidationError('procurement_draft_snapshot_invalid', 'Строки закупочного draft повреждены');
    }
    const location = (await (0, store_point_identity_1.resolveActiveStorePoint)(tx, requestedLocation, 'Склад назначения не соответствует активной точке')).inventoryLocation;
    const [supplier, products] = await Promise.all([
        tx.supplier.findUnique({ where: { id: supplierId } }),
        tx.product.findMany({ where: { id: { in: items.map((item) => item.productId) }, archived: false }, select: { id: true, sku: true, _count: { select: { bundleComponents: true } } } }),
    ]);
    if (!supplier)
        throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${supplierId} не найден`);
    if (products.length !== items.length)
        throw new errors_1.ValidationError('purchase_order_product_not_found', 'Один или несколько товаров не найдены');
    const bundle = products.find((product) => product._count.bundleComponents > 0);
    if (bundle)
        throw new errors_1.ValidationError('purchase_order_virtual_bundle_forbidden', `Виртуальный набор ${bundle.sku} нельзя оприходовать напрямую`);
    const number = `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${(0, node_crypto_1.randomUUID)().slice(0, 6).toUpperCase()}`;
    const order = await tx.purchaseOrder.create({
        data: {
            number, idempotencyKey, supplierId, location, note, createdBy: approver,
            items: { create: items.map((item) => ({ productId: item.productId, orderedQty: item.qty, unitCost: item.unitCost })) },
        },
    });
    events.push({
        type: event_types_1.EventType.PurchaseOrderCreated,
        actor: approver,
        payload: { purchaseOrderId: order.id, number, supplierId, location, items: items.length, approvalId, source: 'ai.reorder' },
        refs: [order.id, supplierId, approvalId, ...items.map((item) => item.productId)],
    });
};
const manual_adjustment = async (tx, payload, approver, approvalId, events) => {
    const documentNumber = String(payload['documentNumber'] ?? '').trim();
    const description = String(payload['description'] ?? '').trim();
    const occurredAt = new Date(String(payload['occurredAt']));
    const amount = Number(payload['amount']);
    const point = payload['point'] ? String(payload['point']).trim() : null;
    const linesPayload = payload['lines'];
    if (!documentNumber || !description || Number.isNaN(occurredAt.getTime()) || !Number.isSafeInteger(amount) || amount <= 0 || !Array.isArray(linesPayload)) {
        throw new errors_1.ValidationError('manual_adjustment_snapshot_invalid', 'Снимок ручной корректировки повреждён');
    }
    const lines = linesPayload.map((line) => ({
        accountCode: String(line['accountCode'] ?? '').trim(),
        debit: Number(line['debit'] ?? 0),
        credit: Number(line['credit'] ?? 0),
        memo: line['memo'] ? String(line['memo']) : null,
    }));
    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
    if (lines.length < 2 || debit !== credit || debit !== amount || lines.some((line) => !/^\d{4}$/.test(line.accountCode) || !Number.isSafeInteger(line.debit) || !Number.isSafeInteger(line.credit) || (line.debit > 0) === (line.credit > 0))) {
        throw new errors_1.ValidationError('manual_adjustment_snapshot_invalid', 'Снимок ручной корректировки не сбалансирован');
    }
    const entry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
        idempotencyKey: `accounting:manual-adjustment:${approvalId}`,
        sourceType: 'finance.manual_adjustment',
        sourceRef: documentNumber,
        description,
        point,
        documentAmount: amount,
        baseAmount: amount,
        occurredAt,
        createdBy: approver,
        lines,
    });
    events.push({ type: event_types_1.EventType.FinanceManualAdjustmentPosted, actor: approver, payload: { approvalId, documentNumber, amount, accountingEntryId: entry.id }, refs: [approvalId, documentNumber, entry.id] }, { type: event_types_1.EventType.AccountingEntryPosted, actor: approver, payload: { accountingEntryId: entry.id, sourceType: 'finance.manual_adjustment', sourceRef: documentNumber, amount }, refs: [entry.id, approvalId] });
};
const campaign_budget = async (tx, payload, approver, approvalId, events) => {
    const campaignId = String(payload['campaignId']);
    const budget = Number(payload['budget']);
    await tx.$queryRaw `SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign)
        throw new errors_1.ValidationError('campaign_not_found', 'Кампания не найдена');
    if (campaign.status !== 'review' || campaign.approvalId !== approvalId) {
        throw new errors_1.ConflictError('campaign_review_changed', 'Кампания больше не ожидает это согласование');
    }
    if (campaign.budget !== budget) {
        throw new errors_1.ConflictError('campaign_budget_changed', 'Бюджет изменился после отправки на согласование');
    }
    await tx.campaign.update({
        where: { id: campaignId },
        data: {
            status: 'approved',
            approvedBy: approver,
            approvedAt: new Date(),
            updatedBy: approver,
            rejectionReason: null,
        },
    });
    events.push({
        type: event_types_1.EventType.CampaignApproved,
        actor: approver,
        payload: { campaignId, approvalId, budget },
        refs: [campaignId, approvalId],
    });
};
const reject_campaign_budget = async (tx, payload, approver, approvalId, reason, events) => {
    const campaignId = String(payload['campaignId']);
    await tx.$queryRaw `SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign)
        throw new errors_1.ValidationError('campaign_not_found', 'Кампания не найдена');
    if (campaign.status !== 'review' || campaign.approvalId !== approvalId) {
        throw new errors_1.ConflictError('campaign_review_changed', 'Кампания больше не ожидает это согласование');
    }
    await tx.campaign.update({
        where: { id: campaignId },
        data: {
            status: 'draft',
            rejectionReason: reason ?? 'Бюджет отклонён',
            updatedBy: approver,
        },
    });
    events.push({
        type: event_types_1.EventType.CampaignReviewRejected,
        actor: approver,
        payload: { campaignId, approvalId, reason },
        refs: [campaignId, approvalId],
    });
};
const legacy_refund = async (tx, payload, approver, approvalId, events) => {
    const paymentId = String(payload['paymentId']);
    const amount = Number(payload['amount']);
    const returnId = payload['returnId'] ? String(payload['returnId']) : null;
    const cashierStaffId = payload['cashierStaffId'] ? String(payload['cashierStaffId']) : null;
    const rawAllocations = Array.isArray(payload['allocations']) ? payload['allocations'] : null;
    const allocations = rawAllocations?.map((value) => {
        const allocation = value;
        return {
            paymentId: String(allocation['paymentId'] ?? ''),
            amount: Number(allocation['amount']),
            shiftId: allocation['shiftId'] ? String(allocation['shiftId']) : null,
            externalReference: allocation['externalReference'] ? String(allocation['externalReference']).trim() : null,
        };
    }) ?? [{
            paymentId,
            amount,
            shiftId: payload['shiftId'] ? String(payload['shiftId']) : null,
            externalReference: payload['externalReference'] ? String(payload['externalReference']).trim() : null,
        }];
    if (amount <= 0 || allocations.length === 0 ||
        allocations.some((allocation) => !allocation.paymentId || !Number.isInteger(allocation.amount) || allocation.amount <= 0) ||
        allocations.reduce((sum, allocation) => sum + allocation.amount, 0) !== amount ||
        new Set(allocations.map((allocation) => allocation.paymentId)).size !== allocations.length ||
        !allocations.some((allocation) => allocation.paymentId === paymentId)) {
        throw new errors_1.ValidationError('invalid_refund_allocation', 'Некорректные аллокации возврата');
    }
    const paymentIds = allocations.map((allocation) => allocation.paymentId).sort();
    await tx.$queryRaw `SELECT id FROM "Payment" WHERE id IN (${client_1.Prisma.join(paymentIds)}) ORDER BY id FOR UPDATE`;
    const originals = await tx.payment.findMany({ where: { id: { in: paymentIds } } });
    if (originals.length !== allocations.length || originals.some((original) => original.amount <= 0)) {
        throw new errors_1.ValidationError('payment_not_found', 'Один из исходных платежей возврата не найден');
    }
    const originalById = new Map(originals.map((original) => [original.id, original]));
    const anchor = originalById.get(paymentId);
    const target = `${anchor.orderId ?? ''}:${anchor.serviceWorkOrderId ?? ''}`;
    if (!anchor.orderId && !anchor.serviceWorkOrderId) {
        throw new errors_1.ConflictError('refund_target_missing', 'Исходный платёж не связан с заказом или ремонтом');
    }
    if (originals.some((original) => `${original.orderId ?? ''}:${original.serviceWorkOrderId ?? ''}` !== target)) {
        throw new errors_1.ConflictError('refund_allocation_target_mismatch', 'Все платежи возврата должны относиться к одному документу');
    }
    const payoutShiftByPayment = new Map();
    for (const allocation of allocations) {
        const original = originalById.get(allocation.paymentId);
        const [tenderRefunds, reservedRefunds] = await Promise.all([
            tx.payment.aggregate({
                where: { originalPaymentId: original.id },
                _sum: { amount: true },
            }),
            tx.refundAllocation.aggregate({
                where: {
                    originalPaymentId: original.id,
                    status: { in: ['queued', 'processing', 'provider_pending', 'failed'] },
                    refund: { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded', 'failed'] } },
                },
                _sum: { amount: true },
            }),
        ]);
        const available = original.amount + (tenderRefunds._sum.amount ?? 0) - (reservedRefunds._sum.amount ?? 0);
        if (allocation.amount > available) {
            throw new errors_1.ValidationError('refund_exceeds_tender', `Возврат превышает остаток платежа ${original.id}`);
        }
        if (original.method === 'gift_card' && !original.giftCardId) {
            throw new errors_1.ConflictError('giftcard_payment_unlinked', 'Исходный gift-card платёж не связан с картой');
        }
        if (original.method === 'cash') {
            if (!allocation.shiftId || !cashierStaffId) {
                throw new errors_1.ValidationError('cash_refund_shift_required', 'Для каждой наличной аллокации нужна смена инициатора');
            }
            await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${allocation.shiftId} FOR UPDATE`;
            const shift = await tx.cashShift.findUnique({ where: { id: allocation.shiftId } });
            if (!shift || shift.closedAt)
                throw new errors_1.ConflictError('cash_refund_shift_closed', 'Смена возврата закрыта или не найдена');
            if (shift.staffId !== cashierStaffId)
                throw new errors_1.ConflictError('cash_refund_shift_foreign', 'Смена возврата принадлежит другому сотруднику');
            if (original.point && shift.point !== original.point)
                throw new errors_1.ConflictError('cash_refund_shift_wrong_point', 'Смена возврата открыта в другой точке');
            payoutShiftByPayment.set(original.id, shift.id);
        }
        else {
            payoutShiftByPayment.set(original.id, null);
            if (original.method !== 'gift_card' && !allocation.externalReference) {
                throw new errors_1.ValidationError('refund_external_reference_required', `Для платежа ${original.id} нужен референс провайдера или банка`);
            }
        }
    }
    const references = allocations.map((allocation) => allocation.externalReference).filter((value) => Boolean(value));
    if (new Set(references).size !== references.length) {
        throw new errors_1.ValidationError('duplicate_refund_reference', 'Референсы аллокаций возврата должны быть уникальными');
    }
    if (returnId) {
        await tx.$queryRaw `SELECT id FROM "Return" WHERE id = ${returnId} FOR UPDATE`;
        const ret = await tx.return.findUnique({ where: { id: returnId } });
        if (!ret)
            throw new errors_1.ValidationError('return_not_found', 'Связанный возврат не найден');
        if (!anchor.orderId || ret.orderId !== anchor.orderId) {
            throw new errors_1.ConflictError('refund_return_order_mismatch', 'Возврат и платежи относятся к разным заказам');
        }
        if (ret.status !== 'processing')
            throw new errors_1.ConflictError('return_not_processing', `Возврат уже ${ret.status}`);
        if (amount !== ret.refundAmount) {
            throw new errors_1.ValidationError('refund_return_amount_mismatch', `Сумма refund должна быть ${ret.refundAmount}`);
        }
    }
    let taxCode = 'none';
    let taxRateBps = 0;
    let documentTax = 0;
    let documentTotal = amount;
    let refundedBefore = 0;
    if (anchor.orderId) {
        await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${anchor.orderId} FOR UPDATE`;
        const [net, order, priorRefunds] = await Promise.all([
            tx.payment.aggregate({ where: { orderId: anchor.orderId }, _sum: { amount: true } }),
            tx.order.findUnique({ where: { id: anchor.orderId }, include: { items: true } }),
            tx.payment.aggregate({ where: { orderId: anchor.orderId, amount: { lt: 0 } }, _sum: { amount: true } }),
        ]);
        if (amount > (net._sum.amount ?? 0))
            throw new errors_1.ValidationError('refund_exceeds_paid', 'Сумма возвратов превышает оплату заказа');
        if (!order)
            throw new errors_1.ValidationError('order_not_found', 'Заказ возврата не найден');
        const metadata = (0, sales_tax_1.outputTaxMetadata)(order.items);
        taxCode = metadata.taxCode;
        taxRateBps = metadata.taxRateBps;
        documentTax = order.taxAmount;
        documentTotal = order.total;
        refundedBefore = Math.abs(priorRefunds._sum.amount ?? 0);
    }
    else if (anchor.serviceWorkOrderId) {
        await tx.$queryRaw `SELECT id FROM "ServiceWorkOrder" WHERE id = ${anchor.serviceWorkOrderId} FOR UPDATE`;
        const [net, workOrder, priorRefunds] = await Promise.all([
            tx.payment.aggregate({ where: { serviceWorkOrderId: anchor.serviceWorkOrderId }, _sum: { amount: true } }),
            tx.serviceWorkOrder.findUnique({
                where: { id: anchor.serviceWorkOrderId },
                select: { repairStartedAt: true, estimateAmount: true, taxCode: true, taxRateBps: true, taxAmount: true },
            }),
            tx.payment.aggregate({ where: { serviceWorkOrderId: anchor.serviceWorkOrderId, amount: { lt: 0 } }, _sum: { amount: true } }),
        ]);
        if (workOrder?.repairStartedAt) {
            throw new errors_1.ConflictError('service_refund_after_start_forbidden', 'После начала ремонта возврат проводится только отдельной компенсацией с актом');
        }
        if (amount > (net._sum.amount ?? 0))
            throw new errors_1.ValidationError('refund_exceeds_paid', 'Сумма возвратов превышает оплату ремонта');
        if (!workOrder?.estimateAmount)
            throw new errors_1.ConflictError('service_estimate_missing', 'У ремонта отсутствует налоговый первичный документ');
        const metadata = (0, sales_tax_1.outputTaxMetadata)([workOrder]);
        taxCode = metadata.taxCode;
        taxRateBps = metadata.taxRateBps;
        documentTax = workOrder.taxAmount;
        documentTotal = workOrder.estimateAmount;
        refundedBefore = Math.abs(priorRefunds._sum.amount ?? 0);
    }
    const refunds = [];
    let allocatedBefore = 0;
    for (const [index, allocation] of allocations.entries()) {
        const original = originalById.get(allocation.paymentId);
        const key = allocations.length === 1 ? `refund:${approvalId}` : `refund:${approvalId}:${index + 1}`;
        const compensating = await tx.payment.create({
            data: {
                orderId: original.orderId,
                serviceWorkOrderId: original.serviceWorkOrderId,
                originalPaymentId: original.id,
                amount: -allocation.amount,
                method: original.method,
                status: 'refunded',
                shiftId: payoutShiftByPayment.get(original.id) ?? null,
                giftCardId: original.giftCardId,
                accountCode: original.accountCode ?? (0, accounting_journal_1.paymentAccountCode)(original.method),
                idempotencyKey: key,
                txnId: allocation.externalReference ? `refund:${original.method}:${allocation.externalReference}` : key,
                receivedBy: cashierStaffId ?? approver,
                point: original.point,
            },
        });
        const taxAmount = (0, sales_tax_1.cumulativeTaxDelta)(documentTax, documentTotal, refundedBefore + allocatedBefore, allocation.amount);
        const accountingEntry = await (0, accounting_journal_1.postPaymentEntryOnTx)(tx, {
            payment: compensating,
            idempotencyKey: key,
            point: original.point,
            actor: approver,
            receivedBy: cashierStaffId,
            tax: { taxCode, taxRateBps, taxAmount },
        });
        if (original.method === 'gift_card') {
            const giftCardId = original.giftCardId;
            await tx.$queryRaw `SELECT id FROM "GiftCard" WHERE id = ${giftCardId} FOR UPDATE`;
            const currentCard = await tx.giftCard.findUniqueOrThrow({ where: { id: giftCardId } });
            const card = await tx.giftCard.update({
                where: { id: giftCardId },
                data: {
                    balance: { increment: allocation.amount },
                    status: currentCard.status === 'redeemed' ? 'active' : currentCard.status,
                },
            });
            await tx.giftCardTransaction.create({
                data: {
                    giftCardId,
                    paymentId: compensating.id,
                    type: 'refund',
                    amount: allocation.amount,
                    balanceAfter: card.balance,
                    sourceRef: key,
                    actor: approver,
                },
            });
        }
        allocatedBefore += allocation.amount;
        refunds.push(compensating);
        events.push({
            type: event_types_1.EventType.PaymentRefunded,
            actor: approver,
            payload: { approvalId, originalPaymentId: original.id, refundId: compensating.id, returnId, amount: allocation.amount, taxAmount },
            refs: [original.orderId, original.serviceWorkOrderId, original.id, compensating.id, returnId].filter((ref) => Boolean(ref)),
        });
        events.push({
            type: event_types_1.EventType.AccountingEntryPosted,
            actor: approver,
            payload: { accountingEntryId: accountingEntry.id, sourceType: 'payment.refund', sourceRef: compensating.id },
            refs: [accountingEntry.id, compensating.id, original.id],
        });
    }
    const refundIds = refunds.map((payment) => payment.id);
    const primaryRefundId = refundIds[0];
    if (anchor.orderId) {
        await (0, campaign_refund_adjustment_1.applyCampaignRefundOnTx)(tx, {
            orderId: anchor.orderId,
            refundPaymentId: primaryRefundId,
            returnId,
            amount,
            actor: approver,
        }, events);
        const order = await tx.order.findUnique({ where: { id: anchor.orderId } });
        if (order) {
            await (0, loyalty_ledger_1.reconcileRefundLoyaltyOnTx)(tx, { order, refundPaymentId: primaryRefundId, actor: approver }, events);
        }
        const aggregate = await tx.payment.aggregate({ where: { orderId: anchor.orderId }, _sum: { amount: true } });
        if (order && (aggregate._sum.amount ?? 0) <= 0 && (0, order_state_machine_1.canTransition)(order.status, 'refunded')) {
            await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
            events.push({ type: 'order.refunded', actor: approver, payload: { orderId: order.id, from: order.status }, refs: [order.id] });
        }
        if (returnId) {
            await tx.return.update({ where: { id: returnId }, data: { refundId: primaryRefundId, status: 'paid' } });
            events.push({
                type: 'return.paid',
                actor: approver,
                payload: { returnId, orderId: anchor.orderId, refundId: primaryRefundId, refundIds, amount },
                refs: [returnId, anchor.orderId, ...refundIds],
            });
        }
    }
};
const refund = async (tx, payload, approver, approvalId, events) => {
    const refundId = String(payload['refundId'] ?? '');
    if (!refundId) {
        return legacy_refund(tx, payload, approver, approvalId, events);
    }
    await tx.$queryRaw `SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
    const aggregate = await tx.refund.findUnique({ where: { id: refundId } });
    if (!aggregate)
        throw new errors_1.ValidationError('refund_not_found', 'Refund не найден');
    if (aggregate.purpose !== 'return_sale' || !aggregate.returnId) {
        throw new errors_1.ConflictError('refund_approval_purpose_invalid', 'Эта approval-команда предназначена только для возврата продажи');
    }
    if (aggregate.approvalId !== approvalId || aggregate.status !== 'requested') {
        throw new errors_1.ConflictError('refund_approval_snapshot_changed', 'Refund больше не ожидает это согласование');
    }
    await tx.refund.update({
        where: { id: refundId },
        data: { status: 'approved', approver, approvedAt: new Date() },
    });
    events.push({
        type: 'refund.approved',
        actor: approver,
        payload: { refundId, approvalId, amount: aggregate.amount, returnId: aggregate.returnId },
        refs: [refundId, approvalId, aggregate.returnId, aggregate.orderId],
    });
};
const reject_refund = async (tx, payload, approver, approvalId, reason, events) => {
    const refundId = String(payload['refundId'] ?? '');
    if (!refundId)
        return;
    await tx.$queryRaw `SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
    const aggregate = await tx.refund.findUnique({ where: { id: refundId } });
    if (!aggregate || aggregate.approvalId !== approvalId || aggregate.status !== 'requested') {
        throw new errors_1.ConflictError('refund_approval_snapshot_changed', 'Refund больше не ожидает это согласование');
    }
    if (aggregate.purpose !== 'return_sale' || !aggregate.returnId) {
        throw new errors_1.ConflictError('refund_approval_purpose_invalid', 'Эта approval-команда предназначена только для возврата продажи');
    }
    await tx.refund.update({ where: { id: refundId }, data: { status: 'rejected', approver } });
    await tx.return.update({ where: { id: aggregate.returnId }, data: { status: 'rejected' } });
    events.push({
        type: 'refund.rejected',
        actor: approver,
        payload: { refundId, approvalId, reason },
        refs: [refundId, approvalId, aggregate.returnId],
    });
};
const price = async (tx, payload, approver, approvalId, events) => {
    const productId = String(payload['productId']);
    const newPrice = Number(payload['newPrice']);
    if (!Number.isSafeInteger(newPrice) || newPrice < 0) {
        throw new errors_1.ValidationError('price_snapshot_invalid', 'Снимок изменения цены повреждён');
    }
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product)
        throw new errors_1.ValidationError('product_not_found', 'Товар не найден');
    await tx.product.update({ where: { id: productId }, data: { price: newPrice } });
    events.push({
        type: event_types_1.EventType.PriceChanged,
        actor: approver,
        payload: { approvalId, productId, from: product.price, to: newPrice },
        refs: [productId],
    });
};
const write_off = async (tx, payload, approver, approvalId, events) => {
    const productId = String(payload['productId']);
    const qty = Number(payload['qty']);
    const location = String(payload['location'] ?? '').trim();
    const reason = payload['reason'] ? String(payload['reason']) : null;
    if (!location)
        throw new errors_1.ValidationError('location_required', 'Укажите склад списания');
    const balance = await lockQuantityBalance(tx, productId, location);
    if (balance.onHand - balance.reserved < qty) {
        throw new errors_1.ConflictError('insufficient_available_stock', 'Списание превышает свободный остаток');
    }
    await assertStoreOwnedAvailable(tx, balance.id, balance.onHand - balance.reserved, qty);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: qty } } });
    const movement = await tx.inventoryMovement.create({
        data: { productId, qty: -Math.abs(qty), type: 'write_off', from: location, reason },
    });
    const valuation = await (0, inventory_valuation_1.adjustQuantityValuationOnTx)(tx, {
        movementId: movement.id,
        productId,
        balanceId: balance.id,
        location,
        quantityDelta: -Math.abs(qty),
        actor: approver,
        sourceType: 'inventory.write_off',
    });
    await tx.inventoryMovement.update({
        where: { id: movement.id },
        data: { unitCost: valuation.unitCost, totalValue: valuation.totalValue, valuationQty: valuation.complete ? Math.abs(qty) : null },
    });
    events.push({
        type: event_types_1.EventType.StockWrittenOff,
        actor: approver,
        payload: { approvalId, productId, location, qty, movementId: movement.id, reason, totalValue: valuation.totalValue },
        refs: [productId, movement.id],
    });
    if (valuation.entry) {
        events.push({
            type: event_types_1.EventType.AccountingEntryPosted,
            actor: approver,
            payload: { accountingEntryId: valuation.entry.id, sourceType: 'inventory.write_off', sourceRef: movement.id, amount: valuation.totalValue },
            refs: [valuation.entry.id, movement.id, productId],
        });
    }
};
const stock_adjust = async (tx, payload, approver, approvalId, events) => {
    const productId = String(payload['productId']);
    const qty = Number(payload['qty']);
    const location = String(payload['location'] ?? '').trim();
    const direction = String(payload['direction'] ?? 'increase');
    const reason = payload['reason'] ? String(payload['reason']) : null;
    const unitCost = Number(payload['unitCost'] ?? 0);
    const expectedOnHand = Number(payload['expectedOnHand']);
    const countMovementId = payload['countMovementId'] ? String(payload['countMovementId']) : null;
    if (!location)
        throw new errors_1.ValidationError('location_required', 'Укажите склад корректировки');
    if (!Number.isSafeInteger(expectedOnHand) || expectedOnHand < 0) {
        throw new errors_1.ValidationError('stock_adjust_snapshot_invalid', 'Снимок остатка корректировки повреждён');
    }
    if (direction !== 'increase' && direction !== 'decrease') {
        throw new errors_1.ValidationError('invalid_adjustment_direction', 'Неизвестное направление корректировки');
    }
    const delta = direction === 'decrease' ? -Math.abs(qty) : Math.abs(qty);
    if (countMovementId) {
        try {
            await tx.approval.update({
                where: { id: approvalId },
                data: { sourceRef: `inventory-count:${countMovementId}` },
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                throw new errors_1.ConflictError('inventory_count_already_applied', 'Этот пересчёт уже использован для корректировки');
            }
            throw error;
        }
    }
    await tx.$queryRaw `SELECT id FROM "InventoryBalance" WHERE "productId" = ${productId} AND location = ${location} FOR UPDATE`;
    let balance = await tx.inventoryBalance.findUnique({
        where: { productId_location: { productId, location } },
    });
    if ((balance?.onHand ?? 0) !== expectedOnHand) {
        throw new errors_1.ConflictError('stock_adjust_snapshot_changed', 'Остаток изменился после отправки корректировки на согласование');
    }
    if (delta < 0) {
        if (!balance) {
            throw new errors_1.ConflictError('inventory_balance_not_found', `На складе ${location} нет остатка товара`);
        }
        if (balance.onHand - balance.reserved < Math.abs(delta)) {
            throw new errors_1.ConflictError('insufficient_available_stock', 'Корректировка превышает свободный остаток');
        }
        await assertStoreOwnedAvailable(tx, balance.id, balance.onHand - balance.reserved, Math.abs(delta));
        await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: Math.abs(delta) } } });
    }
    else {
        balance = balance
            ? await tx.inventoryBalance.update({
                where: { id: balance.id },
                data: { onHand: { increment: delta } },
            })
            : await tx.inventoryBalance.create({ data: { productId, location, onHand: delta } });
    }
    const movement = await tx.inventoryMovement.create({
        data: { productId, qty: delta, type: 'adjust', from: location, reason },
    });
    const valuation = await (0, inventory_valuation_1.adjustQuantityValuationOnTx)(tx, {
        movementId: movement.id,
        productId,
        balanceId: balance.id,
        location,
        quantityDelta: delta,
        unitCost,
        actor: approver,
        sourceType: 'inventory.adjustment',
    });
    await tx.inventoryMovement.update({
        where: { id: movement.id },
        data: { unitCost: valuation.unitCost, totalValue: valuation.totalValue, valuationQty: valuation.complete ? Math.abs(delta) : null },
    });
    events.push({
        type: event_types_1.EventType.StockAdjusted,
        actor: approver,
        payload: {
            approvalId,
            productId,
            location,
            qty: delta,
            direction,
            movementId: movement.id,
            countMovementId,
            reason,
            totalValue: valuation.totalValue,
        },
        refs: [approvalId, productId, movement.id, ...(countMovementId ? [countMovementId] : [])],
    });
    if (valuation.entry) {
        events.push({
            type: event_types_1.EventType.AccountingEntryPosted,
            actor: approver,
            payload: { accountingEntryId: valuation.entry.id, sourceType: 'inventory.adjustment', sourceRef: movement.id, amount: valuation.totalValue },
            refs: [valuation.entry.id, approvalId, movement.id, productId, ...(countMovementId ? [countMovementId] : [])],
        });
    }
};
const quarantine_write_off = async (tx, payload, approver, approvalId, events) => {
    const quarantineId = String(payload['quarantineId']);
    const unitId = String(payload['unitId']);
    const unitCost = Number(payload['unitCost']);
    await tx.$queryRaw `SELECT id FROM "InventoryQuarantineCase" WHERE id = ${quarantineId} FOR UPDATE`;
    await tx.$queryRaw `SELECT id FROM "DeviceUnit" WHERE id = ${unitId} FOR UPDATE`;
    const quarantine = await tx.inventoryQuarantineCase.findUnique({
        where: { id: quarantineId },
        include: { unit: true },
    });
    if (!quarantine)
        throw new errors_1.ValidationError('quarantine_not_found', 'Карантинная запись не найдена');
    if (quarantine.dispositionApprovalId !== approvalId
        || quarantine.unitId !== unitId
        || quarantine.unitCost !== unitCost) {
        throw new errors_1.ConflictError('quarantine_approval_snapshot_changed', 'Снимок карантинного списания изменён');
    }
    if (quarantine.status !== 'diagnosed' || quarantine.diagnosis !== 'write_off') {
        throw new errors_1.ConflictError('quarantine_not_writeoff_ready', 'Карантин больше не ожидает списание');
    }
    if (quarantine.diagnosedBy === approver) {
        throw new errors_1.ConflictError('quarantine_four_eyes_required', 'Диагност не может согласовать списание');
    }
    const unitUpdate = await tx.deviceUnit.updateMany({
        where: { id: unitId, status: 'returned' },
        data: { status: 'written_off' },
    });
    if (unitUpdate.count !== 1) {
        throw new errors_1.ConflictError('quarantine_unit_state_mismatch', 'IMEI уже обработан другой операцией');
    }
    const movement = await tx.inventoryMovement.create({
        data: {
            productId: quarantine.unit.productId,
            qty: -1,
            type: 'write_off',
            from: quarantine.unit.location,
            reason: `quarantine:${quarantineId}`,
            unitCost,
            totalValue: unitCost,
        },
    });
    await tx.inventoryValuationIssue.create({
        data: {
            productId: quarantine.unit.productId,
            imei: quarantine.unit.imei,
            sourceType: 'inventory.quarantine.write_off',
            sourceRef: quarantineId,
            location: quarantine.unit.location,
            quantity: 1,
            unitCost,
            totalCost: unitCost,
        },
    });
    let accountingEntryId = null;
    if (unitCost > 0) {
        const entry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
            idempotencyKey: `accounting:inventory:quarantine:${quarantineId}`,
            sourceType: 'inventory.quarantine.write_off',
            sourceRef: quarantineId,
            description: `Списание IMEI ${quarantine.unit.imei} после карантина`,
            point: quarantine.unit.location,
            documentAmount: unitCost,
            baseAmount: unitCost,
            occurredAt: new Date(),
            createdBy: approver,
            lines: [
                { accountCode: '6900', debit: unitCost },
                { accountCode: '1200', credit: unitCost },
            ],
        });
        accountingEntryId = entry.id;
        events.push({
            type: event_types_1.EventType.AccountingEntryPosted,
            actor: approver,
            payload: { accountingEntryId: entry.id, sourceType: 'inventory.quarantine.write_off', quarantineId, amount: unitCost },
            refs: [entry.id, quarantineId, quarantine.unit.imei],
        });
    }
    await tx.inventoryQuarantineCase.update({
        where: { id: quarantineId },
        data: { status: 'disposed', disposition: 'write_off', disposedBy: approver, disposedAt: new Date() },
    });
    events.push({
        type: event_types_1.EventType.StockWrittenOff,
        actor: approver,
        payload: { approvalId, quarantineId, productId: quarantine.unit.productId, imei: quarantine.unit.imei, movementId: movement.id, totalValue: unitCost },
        refs: [approvalId, quarantineId, quarantine.unit.imei, movement.id],
    });
    events.push({
        type: event_types_1.EventType.InventoryDisposed,
        actor: approver,
        payload: { quarantineId, disposition: 'write_off', imei: quarantine.unit.imei, movementId: movement.id, accountingEntryId },
        refs: [quarantineId, quarantine.unit.imei, movement.id],
    });
};
const reject_quarantine_write_off = async (tx, payload, approver, approvalId, reason, events) => {
    const quarantineId = String(payload['quarantineId']);
    await tx.$queryRaw `SELECT id FROM "InventoryQuarantineCase" WHERE id = ${quarantineId} FOR UPDATE`;
    const cleared = await tx.inventoryQuarantineCase.updateMany({
        where: { id: quarantineId, status: 'diagnosed', dispositionApprovalId: approvalId },
        data: { dispositionApprovalId: null },
    });
    if (cleared.count !== 1) {
        throw new errors_1.ConflictError('quarantine_approval_snapshot_changed', 'Карантин больше не ожидает это согласование');
    }
    events.push({
        type: event_types_1.EventType.InventoryDiagnosed,
        actor: approver,
        payload: { quarantineId, writeOffApprovalId: approvalId, rejected: true, reason },
        refs: [quarantineId, approvalId],
    });
};
async function lockQuantityBalance(tx, productId, location) {
    await tx.$queryRaw `SELECT id FROM "InventoryBalance" WHERE "productId" = ${productId} AND location = ${location} FOR UPDATE`;
    const balance = await tx.inventoryBalance.findUnique({ where: { productId_location: { productId, location } } });
    if (!balance)
        throw new errors_1.ConflictError('inventory_balance_not_found', `На складе ${location} нет остатка товара`);
    return balance;
}
async function assertStoreOwnedAvailable(tx, balanceId, aggregateAvailable, qty) {
    const ownerStock = await tx.quantityConsignmentLot.aggregate({
        where: { balanceId },
        _sum: { availableQty: true },
    });
    const storeOwnedAvailable = aggregateAvailable - (ownerStock._sum.availableQty ?? 0);
    if (storeOwnedAvailable < qty) {
        throw new errors_1.ConflictError('consignment_stock_requires_owner_process', 'Обычное списание не может уменьшать чужой товар; используйте комиссионный процесс владельца');
    }
}
const del = async (tx, payload, approver, approvalId, events) => {
    const productId = String(payload['productId']);
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product)
        throw new errors_1.ValidationError('product_not_found', 'Товар не найден');
    await tx.product.update({ where: { id: productId }, data: { archived: true } });
    events.push({
        type: event_types_1.EventType.ProductArchived,
        actor: approver,
        payload: { approvalId, productId },
        refs: [productId],
    });
};
const debt = async (tx, payload, approver, approvalId, events) => {
    await (0, debt_insert_1.insertDebt)(tx, {
        orderId: String(payload['orderId']),
        customerId: String(payload['customerId']),
        principal: Number(payload['principal']),
        installments: Number(payload['installments'] ?? 1),
        dueDate: new Date(String(payload['dueDate'])),
        idempotencyKey: `approval:${approvalId}`,
    }, approver, events);
};
const storefront_publish = async (tx, payload, approver, approvalId, events) => {
    const revisionId = String(payload['revisionId'] ?? '');
    if (!revisionId)
        throw new errors_1.ValidationError('storefront_revision_missing', 'Снимок публикации витрины повреждён');
    await (0, storefront_publish_1.publishStorefrontRevisionOnTx)(tx, revisionId, approver, events);
    events.push({
        type: event_types_1.EventType.StorefrontPublishApproved,
        actor: approver,
        payload: { revisionId, approvalId },
        refs: [revisionId, approvalId],
    });
};
const ai_support_triage = async (tx, payload, approver, approvalId, events) => {
    const decisionId = String(payload['decisionId'] ?? '');
    if (!decisionId)
        throw new errors_1.ValidationError('ai_decision_missing', 'AI approval snapshot is missing decisionId');
    const decision = await tx.aiDecision.findUnique({ where: { id: decisionId } });
    if (!decision || !decision.requiresApproval || decision.status !== 'draft') {
        throw new errors_1.ConflictError('ai_decision_changed', 'AI decision is no longer awaiting approval');
    }
    await tx.aiDecision.update({ where: { id: decisionId }, data: { status: 'approved' } });
    events.push({
        type: 'ai.decision_approved',
        actor: approver,
        payload: { decisionId, approvalId },
        refs: [decisionId, approvalId],
    });
};
const reject_ai_support_triage = async (tx, payload, approver, approvalId, reason, events) => {
    const decisionId = String(payload['decisionId'] ?? '');
    if (!decisionId)
        throw new errors_1.ValidationError('ai_decision_missing', 'AI approval snapshot is missing decisionId');
    const decision = await tx.aiDecision.findUnique({ where: { id: decisionId } });
    if (!decision || !decision.requiresApproval || decision.status !== 'draft') {
        throw new errors_1.ConflictError('ai_decision_changed', 'AI decision is no longer awaiting approval');
    }
    await tx.aiDecision.update({ where: { id: decisionId }, data: { status: 'rejected' } });
    events.push({
        type: 'ai.decision_rejected',
        actor: approver,
        payload: { decisionId, approvalId, reason: reason ?? null },
        refs: [decisionId, approvalId],
    });
};
exports.ACTION_EXECUTORS = {
    campaign_budget,
    refund,
    price,
    write_off,
    stock_adjust,
    quarantine_write_off,
    delete: del,
    debt,
    manual_adjustment,
    storefront_publish,
    ai_support_triage,
    procurement_draft,
};
exports.ACTION_REJECTION_EXECUTORS = {
    campaign_budget: reject_campaign_budget,
    refund: reject_refund,
    quarantine_write_off: reject_quarantine_write_off,
    ai_support_triage: reject_ai_support_triage,
};
//# sourceMappingURL=action-executors.js.map