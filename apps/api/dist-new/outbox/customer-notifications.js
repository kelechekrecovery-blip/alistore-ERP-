"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueConsentedCustomerNotice = enqueueConsentedCustomerNotice;
exports.enqueueSupplyCustomerNotice = enqueueSupplyCustomerNotice;
exports.enqueueStaffNotice = enqueueStaffNotice;
exports.customerNotificationProjection = customerNotificationProjection;
exports.redactCustomerNotificationPayload = redactCustomerNotificationPayload;
const node_crypto_1 = require("node:crypto");
async function enqueueConsentedCustomerNotice(tx, outbox, input) {
    const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { phone: true, consent: true },
    });
    if (!customer?.phone || (!input.transactional && !customer.consent))
        return false;
    const safePayload = redactCustomerNotificationPayload(input.payload ?? {});
    const safeInput = { ...input, payload: safePayload };
    const projection = customerNotificationProjection(safeInput);
    const notificationData = {
        customerId: input.customerId,
        template: input.template,
        title: projection.title,
        detail: projection.detail,
        symbol: projection.symbol,
        route: projection.route,
        referenceId: projection.referenceId,
    };
    if (input.dedupKey) {
        const id = durableCustomerNotificationId(input.customerId, input.template, input.dedupKey);
        await tx.customerNotification.upsert({
            where: { id },
            create: { id, ...notificationData },
            update: {},
        });
    }
    else {
        await tx.customerNotification.create({ data: notificationData });
    }
    await outbox.enqueueOnTx(tx, {
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}),
        channel: input.channel ?? 'sms',
        recipient: input.channel === 'push' ? input.customerId : customer.phone,
        template: input.template,
        payload: { customerId: input.customerId, ...safePayload },
    });
    return true;
}
function enqueueSupplyCustomerNotice(tx, outbox, input) {
    return enqueueConsentedCustomerNotice(tx, outbox, {
        customerId: input.customerId,
        template: input.template,
        payload: input.payload,
        channel: input.channel,
        transactional: true,
        dedupKey: `supply:${input.template}:${input.eventKey}`,
    });
}
const MANAGER_ROLES = ['owner', 'admin'];
async function enqueueStaffNotice(tx, outbox, input) {
    const recipients = await tx.staffUser.findMany({
        where: { active: true, role: { in: [...MANAGER_ROLES] } },
        select: { id: true },
    });
    for (const recipient of recipients) {
        await outbox.enqueueOnTx(tx, {
            ...(input.dedupKey ? { dedupKey: `${input.template}:${input.dedupKey}` } : {}),
            channel: 'push',
            recipient: recipient.id,
            template: input.template,
            payload: { title: input.title, body: input.body, ...(input.payload ?? {}) },
        });
    }
    return recipients.length;
}
function customerNotificationProjection(input) {
    const payload = input.payload ?? {};
    const referenceId = stringValue(payload.orderId)
        ?? stringValue(payload.warrantyId)
        ?? stringValue(payload.debtId)
        ?? stringValue(payload.refundId)
        ?? stringValue(payload.returnId)
        ?? stringValue(payload.workOrderId)
        ?? stringValue(payload.loanId)
        ?? stringValue(payload.tradeInId)
        ?? stringValue(payload.ticketId);
    switch (input.template) {
        case 'order_confirmed':
            return {
                title: 'Заказ принят',
                detail: `Заказ №${shortReference(payload.orderId)} уже собирается`,
                symbol: 'shippingbox.fill',
                route: 'order',
                referenceId,
            };
        case 'order_ready':
            return {
                title: 'Заказ готов',
                detail: `Заказ №${shortReference(payload.orderId)} можно забрать или получить`,
                symbol: 'checkmark.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'order_no_show_reminder':
            return {
                title: 'Заказ ждёт вас',
                detail: `Заказ №${shortReference(payload.orderId)} готов к выдаче`,
                symbol: 'clock.badge.exclamationmark.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_deposit_received':
            return {
                title: 'Задаток получен',
                detail: `По заказу №${shortReference(payload.orderId)} получено ${numberValue(payload.amount)} сом`,
                symbol: 'creditcard.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_po_sent':
            return {
                title: 'Заказ передан поставщику',
                detail: `Товар по заказу №${shortReference(payload.orderId)} заказан у поставщика`,
                symbol: 'shippingbox.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_supplier_confirmed':
            return {
                title: 'Поставщик подтвердил заказ',
                detail: `Ожидаем товар по заказу №${shortReference(payload.orderId)}`,
                symbol: 'checkmark.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_late':
            return {
                title: 'Срок поставки изменился',
                detail: `Заказ №${shortReference(payload.orderId)} задерживается${dateSuffix(payload.expectedAt)}`,
                symbol: 'exclamationmark.triangle.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_received':
            return {
                title: 'Товар поступил',
                detail: `Товар по заказу №${shortReference(payload.orderId)} принят и проходит проверку`,
                symbol: 'shippingbox.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_ready':
            return {
                title: 'Заказ готов',
                detail: `Заказ №${shortReference(payload.orderId)} готов к выдаче`,
                symbol: 'checkmark.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_balance_due':
            return {
                title: 'Остаток к оплате',
                detail: `По заказу №${shortReference(payload.orderId)} осталось оплатить ${numberValue(payload.amount)} сом`,
                symbol: 'creditcard.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_cancellation_requested':
            return {
                title: 'Запрос на отмену принят',
                detail: `Проверяем отмену заказа №${shortReference(payload.orderId)}`,
                symbol: 'clock.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_cancellation_owner_review':
            return {
                title: 'Отмена передана на рассмотрение',
                detail: `По заказу №${shortReference(payload.orderId)} требуется решение владельца`,
                symbol: 'person.crop.circle.badge.questionmark',
                route: 'order',
                referenceId,
            };
        case 'supply_refund_queued':
            return {
                title: 'Возврат поставлен в очередь',
                detail: `Возвращаем ${numberValue(payload.amount)} сом по заказу №${shortReference(payload.orderId)}`,
                symbol: 'arrow.uturn.backward.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_refund_completed':
            return {
                title: 'Деньги возвращены',
                detail: `Возврат ${numberValue(payload.amount)} сом по заказу №${shortReference(payload.orderId)} выполнен`,
                symbol: 'checkmark.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'supply_refund_failed':
            return {
                title: 'Возврат требует проверки',
                detail: `Не удалось вернуть ${numberValue(payload.amount)} сом по заказу №${shortReference(payload.orderId)} — мы проверяем операцию`,
                symbol: 'exclamationmark.triangle.fill',
                route: 'order',
                referenceId,
            };
        case 'warranty_created':
            return {
                title: 'Обращение в сервис создано',
                detail: `Проверяем устройство ${shortReference(payload.imei)}`,
                symbol: 'shield.fill',
                route: 'warranty',
                referenceId,
            };
        case 'warranty_closed':
            return {
                title: 'Гарантийное обращение закрыто',
                detail: `Сервисное обращение по ${shortReference(payload.imei)} завершено`,
                symbol: 'checkmark.shield.fill',
                route: 'warranty',
                referenceId,
            };
        case 'reservation_expired':
            return {
                title: 'Резерв заказа истёк',
                detail: `Откройте заказ №${shortReference(payload.orderId)} и выберите действие`,
                symbol: 'clock.badge.exclamationmark.fill',
                route: 'order',
                referenceId,
            };
        case 'debt_due_soon':
            return {
                title: 'Приближается срок платежа',
                detail: `Остаток к оплате: ${numberValue(payload.balance)} сом`,
                symbol: 'creditcard.fill',
                route: 'account',
                referenceId,
            };
        case 'debt_overdue':
            return {
                title: 'Есть просроченный платёж',
                detail: `Остаток к оплате: ${numberValue(payload.balance)} сом`,
                symbol: 'exclamationmark.triangle.fill',
                route: 'account',
                referenceId,
            };
        case 'payment_received':
            return {
                title: 'Оплата получена',
                detail: `Заказ №${shortReference(payload.orderId)} оплачен на ${numberValue(payload.total)} сом`,
                symbol: 'creditcard.fill',
                route: 'order',
                referenceId,
            };
        case 'order_delivered':
            return {
                title: 'Заказ доставлен',
                detail: `Заказ №${shortReference(payload.orderId)} передан вам курьером`,
                symbol: 'checkmark.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'delivery_failed':
            return {
                title: 'Не удалось доставить заказ',
                detail: `Заказ №${shortReference(payload.orderId)}: ${stringValue(payload.reason) ?? 'доставка не состоялась'}`,
                symbol: 'exclamationmark.triangle.fill',
                route: 'order',
                referenceId,
            };
        case 'order_completed':
            return {
                title: 'Заказ завершён',
                detail: `Заказ №${shortReference(payload.orderId)} закрыт — спасибо за покупку`,
                symbol: 'flag.checkered',
                route: 'order',
                referenceId,
            };
        case 'refund_approved':
            return {
                title: 'Возврат согласован',
                detail: `Возврат ${numberValue(payload.amount)} сом одобрен и передан в исполнение`,
                symbol: 'checkmark.circle.fill',
                route: 'account',
                referenceId,
            };
        case 'refund_succeeded':
            return {
                title: 'Деньги возвращены',
                detail: `Возврат ${numberValue(payload.amount)} сом выполнен`,
                symbol: 'creditcard.fill',
                route: 'account',
                referenceId,
            };
        case 'refund_failed':
            return {
                title: 'Возврат не выполнен',
                detail: `Возврат ${numberValue(payload.amount)} сом требует проверки — свяжитесь с поддержкой`,
                symbol: 'exclamationmark.triangle.fill',
                route: 'account',
                referenceId,
            };
        case 'return_reconciled':
            return {
                title: 'Возврат завершён',
                detail: `Товар по заказу №${shortReference(payload.orderId)} принят на склад`,
                symbol: 'checkmark.circle.fill',
                route: 'order',
                referenceId,
            };
        case 'service_estimate_ready':
            return {
                title: 'Смета ремонта готова',
                detail: `Смета на ${numberValue(payload.estimateAmount)} сом ждёт вашего подтверждения`,
                symbol: 'doc.text.fill',
                route: 'warranty',
                referenceId,
            };
        case 'service_repair_completed':
            return {
                title: 'Ремонт завершён',
                detail: `Устройство ${shortReference(payload.imei)} готово к выдаче`,
                symbol: 'checkmark.shield.fill',
                route: 'warranty',
                referenceId,
            };
        case 'service_loaner_issued':
            return {
                title: 'Подменное устройство выдано',
                detail: `Верните подменное устройство после ремонта`,
                symbol: 'iphone',
                route: 'warranty',
                referenceId,
            };
        case 'exchange_completed':
            return {
                title: 'Обмен завершён',
                detail: `Обмен оформлен, новый заказ №${shortReference(payload.exchangeOrderId)}`,
                symbol: 'arrow.triangle.2.circlepath',
                route: 'order',
                referenceId,
            };
        case 'tradein_decision':
            return {
                title: 'Оценка trade-in готова',
                detail: `${stringValue(payload.model) ?? 'Устройство'}: ${numberValue(payload.price)} сом · договор ${stringValue(payload.contractId) ?? '—'}`,
                symbol: 'tag.fill',
                route: 'account',
                referenceId,
            };
        case 'ticket_resolved':
            return {
                title: 'Ответ поддержки',
                detail: `Обращение «${stringValue(payload.subject) ?? 'без темы'}» решено`,
                symbol: 'bubble.left.fill',
                route: 'account',
                referenceId,
            };
        default:
            return {
                title: 'Новое уведомление',
                detail: input.template.replaceAll('_', ' '),
                symbol: 'bell.fill',
                route: 'account',
                referenceId,
            };
    }
}
const CUSTOMER_PAYLOAD_DENYLIST = new Set([
    'supplier',
    'supplierid',
    'supplierofferid',
    'suppliersku',
    'cost',
    'unitcost',
    'purchasecost',
    'evidence',
    'ownerreason',
    'requesthash',
    'internalstatus',
]);
function redactCustomerNotificationPayload(payload) {
    return redactRecord(payload);
}
function redactRecord(payload) {
    return Object.fromEntries(Object.entries(payload).flatMap(([key, value]) => {
        if (CUSTOMER_PAYLOAD_DENYLIST.has(key.replaceAll('_', '').toLowerCase()))
            return [];
        if (Array.isArray(value)) {
            return [[key, value.map((item) => (item && typeof item === 'object' && !Array.isArray(item)
                        ? redactRecord(item)
                        : item))]];
        }
        if (value && typeof value === 'object') {
            return [[key, redactRecord(value)]];
        }
        return [[key, value]];
    }));
}
function durableCustomerNotificationId(customerId, template, dedupKey) {
    const hash = (0, node_crypto_1.createHash)('sha256')
        .update(`${customerId}\u001f${template}\u001f${dedupKey}`)
        .digest('hex');
    return `customer_notice_dedup_${hash}`;
}
function dateSuffix(value) {
    const date = stringValue(value);
    if (!date)
        return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.valueOf()))
        return '';
    return `, новая дата — ${parsed.toLocaleDateString('ru-RU', { timeZone: 'Asia/Bishkek' })}`;
}
function stringValue(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function shortReference(value) {
    const normalized = stringValue(value);
    return normalized ? normalized.slice(-6) : '—';
}
function numberValue(value) {
    return typeof value === 'number' ? value.toLocaleString('ru-RU') : '0';
}
//# sourceMappingURL=customer-notifications.js.map