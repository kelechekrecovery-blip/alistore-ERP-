"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertDebt = insertDebt;
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const accounting_journal_1 = require("../finance/accounting-journal");
async function insertDebt(tx, input, actor, events) {
    const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: {
            items: { select: { taxCode: true, taxRateBps: true, taxAmount: true } },
            payments: { select: { amount: true, status: true } },
        },
    });
    if (!order)
        throw new errors_1.ValidationError('order_not_found', `Заказ ${input.orderId} не найден`);
    if (order.customerId !== input.customerId) {
        throw new errors_1.ValidationError('debt_customer_mismatch', 'Долг должен принадлежать покупателю заказа');
    }
    const replay = input.idempotencyKey
        ? await tx.debtPlan.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
        : null;
    if (replay) {
        const sameCommand = replay.orderId === input.orderId
            && replay.customerId === input.customerId
            && replay.principal === input.principal
            && replay.installments === input.installments;
        if (sameCommand)
            return replay;
        throw new errors_1.ConflictError('debt_idempotency_conflict', 'Ключ создания долга уже использован с другими параметрами');
    }
    const existing = await tx.debtPlan.findUnique({ where: { orderId: input.orderId } });
    if (existing) {
        throw new errors_1.ConflictError('order_debt_exists', 'Для заказа уже оформлен долг или рассрочка');
    }
    const processedBefore = order.payments
        .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = Math.max(0, order.total - processedBefore);
    if (input.principal > outstanding) {
        throw new errors_1.ValidationError('debt_principal_exceeds_outstanding', `Непокрытый остаток заказа: ${outstanding}`);
    }
    const debt = await tx.debtPlan.create({
        data: {
            orderId: input.orderId,
            customerId: input.customerId,
            principal: input.principal,
            balance: input.principal,
            installments: input.installments,
            dueDate: input.dueDate,
            status: 'open',
            idempotencyKey: input.idempotencyKey,
        },
    });
    const accountingEntry = await (0, accounting_journal_1.postOrderReceivableOnTx)(tx, {
        idempotencyKey: `accounting:debt.origination:${debt.id}`,
        sourceType: 'debt.origination',
        sourceRef: debt.id,
        description: `Возникновение долга по заказу ${input.orderId}`,
        order,
        processedBefore,
        amount: input.principal,
        occurredAt: debt.createdAt,
        actor,
    });
    const postedDebt = await tx.debtPlan.update({
        where: { id: debt.id },
        data: { accountingEntryId: accountingEntry.id },
    });
    events.push({
        type: event_types_1.EventType.DebtCreated,
        actor,
        payload: {
            debtId: debt.id,
            orderId: input.orderId,
            customerId: input.customerId,
            principal: input.principal,
            installments: input.installments,
            dueDate: input.dueDate.toISOString(),
        },
        refs: [debt.id, input.orderId, input.customerId],
    });
    events.push({
        type: event_types_1.EventType.AccountingEntryPosted,
        actor,
        payload: {
            accountingEntryId: accountingEntry.id,
            sourceType: 'debt.origination',
            sourceRef: debt.id,
            debtId: debt.id,
            orderId: input.orderId,
            amount: input.principal,
            taxAmount: accountingEntry.taxAmount,
        },
        refs: [accountingEntry.id, debt.id, input.orderId],
    });
    return postedDebt;
}
//# sourceMappingURL=debt-insert.js.map