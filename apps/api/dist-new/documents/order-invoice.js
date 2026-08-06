"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderInvoiceLines = buildOrderInvoiceLines;
function buildOrderInvoiceLines(order) {
    const lines = [
        'НАКЛАДНАЯ / ТОВАРНЫЙ ЧЕК',
        'AliStore · г. Бишкек, Кыргызстан',
        `№ ${order.id}`,
        `Дата: ${formatDate(order.createdAt)}`,
        `Канал: ${order.channel} · статус: ${order.status}`,
        '',
        'Покупатель:',
        `  ${order.customer.name || '—'} · тел. ${order.customer.phone}`,
        '',
        'Товары:',
    ];
    for (const item of order.items) {
        lines.push(`  ${item.name} (SKU ${item.sku})`);
        lines.push(`  ${item.qty} x ${money(item.price)} сом = ${money(item.qty * item.price)} сом`);
        if (item.imei)
            lines.push(`  IMEI / SN: ${item.imei}`);
    }
    lines.push('', `Итого: ${money(order.total)} сом`);
    const received = order.payments.filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status));
    if (received.length) {
        lines.push('Оплата:');
        for (const payment of received) {
            lines.push(`  ${payment.method}: ${money(payment.amount)} сом (${payment.status})`);
        }
    }
    else {
        lines.push('Оплата: не зафиксирована');
    }
    lines.push('', 'Отпустил: __________________     Получил: __________________');
    return lines;
}
function formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function money(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
//# sourceMappingURL=order-invoice.js.map