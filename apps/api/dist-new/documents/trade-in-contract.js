"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTradeInContractLines = buildTradeInContractLines;
function buildTradeInContractLines(trade) {
    const lines = [
        'ДОГОВОР скупки бывшего в употреблении устройства',
        `№ ${trade.contractId ?? trade.id}`,
        `Дата: ${formatDate(trade.issuedAt)}`,
        '',
        'Продавец (физическое лицо):',
        `  ${trade.customer.name} · тел. ${trade.customer.phone}`,
        `  Паспорт: ${trade.sellerPassport}`,
        '',
        'Покупатель: AliStore (ИП), г. Бишкек, Кыргызстан',
        '',
        'Устройство:',
        `  Модель: ${trade.model}`,
        `  IMEI / SN: ${trade.imei?.trim() || 'не указан'}`,
        `  Состояние (грейд): ${trade.grade}`,
        `  Оценочная стоимость: ${money(trade.price)} сом`,
        '',
        'Продавец подтверждает, что устройство принадлежит ему, не находится',
        'в розыске и не заблокировано (iCloud / учётная запись производителя).',
        '',
        'Подпись продавца: __________________',
        'Подпись покупателя: __________________',
    ];
    return lines;
}
function formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}
function money(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
//# sourceMappingURL=trade-in-contract.js.map