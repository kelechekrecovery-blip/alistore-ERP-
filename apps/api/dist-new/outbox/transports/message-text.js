"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationText = notificationText;
function notificationText(message) {
    const payload = message.payload ?? {};
    const explicitMessage = payloadField(payload, 'message');
    if (explicitMessage)
        return explicitMessage;
    const order = shortReference(payloadField(payload, 'orderId'));
    const amount = numericPayloadField(payload, 'amount');
    switch (message.template) {
        case 'supply_deposit_received':
            return `AliStore: задаток ${amount} сом по заказу №${order} получен.`;
        case 'supply_po_sent':
            return `AliStore: товар по заказу №${order} передан поставщику.`;
        case 'supply_supplier_confirmed':
            return `AliStore: поставщик подтвердил заказ №${order}.`;
        case 'supply_late':
            return `AliStore: поставка по заказу №${order} задерживается. Мы сообщим новую дату.`;
        case 'supply_received':
            return `AliStore: товар по заказу №${order} поступил и проходит проверку.`;
        case 'supply_ready':
            return `AliStore: заказ №${order} готов к выдаче.`;
        case 'supply_balance_due':
            return `AliStore: по заказу №${order} осталось оплатить ${amount} сом.`;
        case 'supply_cancellation_requested':
            return `AliStore: запрос на отмену заказа №${order} принят.`;
        case 'supply_cancellation_owner_review':
            return `AliStore: отмена заказа №${order} передана на рассмотрение владельцу.`;
        case 'supply_refund_queued':
            return `AliStore: возврат ${amount} сом по заказу №${order} поставлен в очередь.`;
        case 'supply_refund_completed':
            return `AliStore: возврат ${amount} сом по заказу №${order} выполнен.`;
        case 'supply_refund_failed':
            return `AliStore: возврат по заказу №${order} требует проверки. Мы уже занимаемся операцией.`;
        default:
            break;
    }
    const details = JSON.stringify(payload, null, 2);
    return details && details !== '{}'
        ? `AliStore: ${message.template}\n${details}`
        : `AliStore: ${message.template}`;
}
function shortReference(value) {
    return value ? value.slice(-6) : '—';
}
function numericPayloadField(payload, field) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return '0';
    const value = payload[field];
    return typeof value === 'number' ? value.toLocaleString('ru-RU') : '0';
}
function payloadField(payload, field) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return undefined;
    }
    const value = payload[field];
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}
//# sourceMappingURL=message-text.js.map