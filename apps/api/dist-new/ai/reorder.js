"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestReorder = suggestReorder;
function suggestReorder(input) {
    const { inStock, reserved, soldUnits } = input;
    const coverTarget = Math.max(2, soldUnits);
    const gap = Math.max(1, coverTarget - inStock);
    if (inStock === 0 && soldUnits >= 1) {
        return {
            needsReorder: true,
            urgency: 'high',
            suggestedQty: coverTarget,
            reason: 'Нет в наличии при живом спросе — срочно дозаказать.',
        };
    }
    if (inStock <= 2 && soldUnits >= 3) {
        return {
            needsReorder: true,
            urgency: 'high',
            suggestedQty: gap,
            reason: 'Почти закончился при высоком спросе — пополнить.',
        };
    }
    if (inStock <= 2 && soldUnits >= 1) {
        return {
            needsReorder: true,
            urgency: 'medium',
            suggestedQty: gap,
            reason: 'Остаток заканчивается — пора пополнить.',
        };
    }
    if (reserved > inStock && soldUnits >= 1) {
        return {
            needsReorder: true,
            urgency: 'medium',
            suggestedQty: Math.max(1, reserved - inStock),
            reason: 'Резервов больше, чем на складе — не хватит под заказы.',
        };
    }
    return { needsReorder: false, urgency: 'none', suggestedQty: 0, reason: 'Запаса достаточно.' };
}
//# sourceMappingURL=reorder.js.map