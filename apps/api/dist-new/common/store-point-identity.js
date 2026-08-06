"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storePointIdentityWhere = storePointIdentityWhere;
exports.resolveActiveStorePoint = resolveActiveStorePoint;
const errors_1 = require("./errors");
const LEGACY_CODE_ALIASES = new Map([
    ['alistore-center', 'center'],
    ['alistore центр', 'center'],
]);
function storePointIdentityWhere(rawReference) {
    const reference = rawReference.trim();
    const normalized = reference.toLocaleLowerCase('ru-RU');
    const code = LEGACY_CODE_ALIASES.get(normalized) ?? normalized;
    return {
        OR: [
            { id: reference },
            { code },
            { inventoryLocation: { in: [reference, reference.toUpperCase()] } },
        ],
    };
}
async function resolveActiveStorePoint(db, rawReference, message = 'Точка недоступна или отключена') {
    const reference = rawReference?.trim();
    if (!reference)
        throw new errors_1.ValidationError('store_point_required', 'Выберите активную точку');
    const point = await db.storePoint.findFirst({
        where: { active: true, ...storePointIdentityWhere(reference) },
    });
    if (!point)
        throw new errors_1.ValidationError('store_point_unavailable', message);
    return point;
}
//# sourceMappingURL=store-point-identity.js.map