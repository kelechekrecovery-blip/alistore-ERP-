"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_TRANSITIONS = void 0;
exports.canTransition = canTransition;
exports.assertTransition = assertTransition;
exports.isSupplyFulfilled = isSupplyFulfilled;
const errors_1 = require("../common/errors");
exports.ALLOWED_TRANSITIONS = {
    awaiting_deposit: ['procurement_draft', 'customer_cancelled', 'cancelled'],
    awaiting_supplier: ['procurement_draft', 'ordered', 'customer_cancelled', 'cancelled'],
    procurement_draft: ['ordered', 'customer_cancelled', 'cancelled'],
    ordered: ['in_transit', 'supplier_rejected', 'late', 'customer_cancelled', 'cancelled'],
    in_transit: ['received', 'late', 'customer_cancelled', 'cancelled'],
    received: ['quality_check', 'quarantined', 'cancelled'],
    quality_check: ['ready', 'quarantined', 'cancelled'],
    ready: ['handed_over', 'customer_cancelled', 'quarantined', 'cancelled'],
    supplier_rejected: ['cancelled'],
    late: ['in_transit', 'received', 'supplier_rejected', 'customer_cancelled', 'cancelled'],
    customer_cancelled: ['quarantined', 'cancelled'],
    quarantined: ['ready', 'cancelled'],
    handed_over: [],
    cancelled: [],
};
function canTransition(from, to) {
    return exports.ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new errors_1.ValidationError('illegal_supply_transition', `Недопустимый переход поставки строки заказа: ${from} → ${to}`);
    }
}
function isSupplyFulfilled(status) {
    return ['received', 'quality_check', 'ready', 'handed_over'].includes(status);
}
//# sourceMappingURL=order-line-supply-state.js.map