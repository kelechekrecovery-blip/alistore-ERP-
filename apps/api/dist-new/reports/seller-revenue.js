"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerRevenueWhere = sellerRevenueWhere;
exports.normalizeSellerActor = normalizeSellerActor;
exports.soldBy = soldBy;
exports.sellerRevenueRows = sellerRevenueRows;
function sellerRevenueWhere(range) {
    const { from, to, point } = range ?? {};
    return {
        amount: { gt: 0 },
        status: { in: ['received', 'reconciled'] },
        ...(from || to
            ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
            : {}),
        ...(point ? { OR: [{ point }, { shift: { point } }] } : {}),
    };
}
const STAFF_ACTOR_PREFIX = 'staff:';
function normalizeSellerActor(value) {
    return value.startsWith(STAFF_ACTOR_PREFIX) ? value.slice(STAFF_ACTOR_PREFIX.length) : value;
}
function soldBy(payment) {
    const raw = payment.receivedBy ?? payment.shift?.staffId ?? null;
    return raw === null ? null : normalizeSellerActor(raw);
}
function sellerRevenueRows(payments) {
    return payments
        .map((payment) => ({ staffId: soldBy(payment), amount: payment.amount }))
        .filter((row) => row.staffId !== null);
}
//# sourceMappingURL=seller-revenue.js.map