"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_TRANSITIONS = void 0;
exports.canTransition = canTransition;
exports.assertTransition = assertTransition;
exports.deriveOrderStatusFromLineFulfillment = deriveOrderStatusFromLineFulfillment;
const errors_1 = require("../common/errors");
exports.ALLOWED_TRANSITIONS = {
    draft: ['created', 'cancelled'],
    created: ['awaiting_confirmation', 'confirmed', 'reserved', 'cancelled'],
    awaiting_confirmation: ['confirmed', 'cancelled'],
    confirmed: ['reserved', 'cancelled'],
    reserved: ['awaiting_payment', 'paid', 'picking', 'cancelled'],
    awaiting_payment: ['confirmed', 'paid', 'cancelled'],
    paid: ['picking', 'ready_for_pickup', 'courier_assigned', 'return_requested', 'refunded', 'exchanged'],
    picking: ['packed', 'cancelled'],
    packed: ['ready_for_pickup', 'courier_assigned'],
    ready_for_pickup: ['completed', 'return_requested'],
    courier_assigned: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered', 'cancelled'],
    delivered: ['completed', 'return_requested', 'exchanged'],
    completed: ['return_requested', 'exchanged'],
    return_requested: ['returned', 'cancelled'],
    returned: ['refunded', 'exchanged'],
    exchanged: [],
    refunded: [],
    cancelled: [],
};
function canTransition(from, to) {
    return exports.ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new errors_1.ValidationError('illegal_transition', `Недопустимый переход заказа: ${from} → ${to}`);
    }
}
const TERMINAL_LINE_STATUSES = new Set([
    'handed_over',
    'customer_cancelled',
    'cancelled',
]);
function deriveOrderStatusFromLineFulfillment(statuses) {
    const active = statuses.filter((status) => !TERMINAL_LINE_STATUSES.has(status));
    if (active.length === 0)
        return 'completed';
    if (active.every((status) => status === 'ready'))
        return 'ready_for_pickup';
    return 'confirmed';
}
//# sourceMappingURL=order-state-machine.js.map