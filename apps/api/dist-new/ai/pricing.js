"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestPrice = suggestPrice;
const round100 = (n) => Math.max(0, Math.round(n / 100) * 100);
function suggestPrice(input) {
    const { basePrice, inStock, soldUnits } = input;
    let deltaPct = 0;
    let action = 'hold';
    let reason = 'Баланс спроса и остатка — цена оптимальна.';
    if (inStock <= 2 && soldUnits >= 3) {
        deltaPct = 5;
        action = 'raise';
        reason = 'Дефицит при высоком спросе — можно поднять цену.';
    }
    else if (inStock >= 10 && soldUnits === 0) {
        deltaPct = -10;
        action = 'discount';
        reason = 'Затоварка без продаж — скидка разгонит оборот.';
    }
    else if (soldUnits === 0 && inStock >= 5) {
        deltaPct = -5;
        action = 'discount';
        reason = 'Медленно движется — лёгкая скидка поможет.';
    }
    else if (inStock >= 8 && soldUnits <= 1) {
        deltaPct = -5;
        action = 'discount';
        reason = 'Много на складе, спрос слабый.';
    }
    const suggested = round100(basePrice * (1 + deltaPct / 100));
    return { current: basePrice, suggested, deltaPct, action, reason };
}
//# sourceMappingURL=pricing.js.map