"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_DISCOUNT_LIMIT_PCT = exports.APPROVAL_THRESHOLDS = exports.APPROVAL_APPROVER_ROLES = exports.Role = void 0;
exports.canApprove = canApprove;
exports.canDiscountDirectly = canDiscountDirectly;
exports.Role = {
    seller: 'seller',
    senior_seller: 'senior_seller',
    cashier: 'cashier',
    warehouse: 'warehouse',
    service: 'service',
    technician: 'technician',
    courier: 'courier',
    marketer: 'marketer',
    admin: 'admin',
    owner: 'owner',
};
exports.APPROVAL_APPROVER_ROLES = {
    discount: ['senior_seller', 'admin', 'owner'],
    refund: ['admin', 'owner'],
    price: ['admin', 'owner'],
    write_off: ['owner'],
    quarantine_write_off: ['owner'],
    exchange: ['senior_seller', 'admin', 'owner'],
    stock_adjust: ['owner'],
    debt: ['senior_seller', 'admin', 'owner'],
    delete: ['owner'],
    pii: ['admin', 'owner'],
    campaign_budget: ['admin', 'owner'],
    manual_adjustment: ['admin', 'owner'],
    storefront_publish: ['admin', 'owner'],
    ai_support_triage: ['admin', 'owner'],
    procurement_draft: ['admin', 'owner'],
};
exports.APPROVAL_THRESHOLDS = {
    discountPct: 10,
    priceChangePct: 15,
    minMarginSom: 0,
};
exports.ROLE_DISCOUNT_LIMIT_PCT = {
    seller: 5,
    senior_seller: 15,
    cashier: 5,
    warehouse: 0,
    service: 0,
    technician: 0,
    courier: 0,
    marketer: 0,
    admin: 100,
    owner: 100,
};
function canApprove(action, role) {
    return exports.APPROVAL_APPROVER_ROLES[action]?.includes(role) ?? false;
}
function canDiscountDirectly(role, pct) {
    return pct <= (exports.ROLE_DISCOUNT_LIMIT_PCT[role] ?? 0);
}
//# sourceMappingURL=permissions.js.map