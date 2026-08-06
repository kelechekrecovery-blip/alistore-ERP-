"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerScopeFor = sellerScopeFor;
exports.sellerProductWhere = sellerProductWhere;
function sellerScopeFor(principal) {
    if (principal.typ !== 'staff')
        return null;
    const sellerId = principal.sellerId;
    return sellerId ?? null;
}
function sellerProductWhere(scope) {
    return scope === null ? {} : { sellerId: scope };
}
//# sourceMappingURL=seller-scope.js.map