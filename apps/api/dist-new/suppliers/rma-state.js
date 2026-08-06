"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RMA_OPEN_STATUSES = exports.RMA_RESOLUTIONS = void 0;
exports.assertRmaTransition = assertRmaTransition;
const errors_1 = require("../common/errors");
const TRANSITIONS = {
    created: ['shipped'],
    shipped: ['accepted', 'rejected'],
    accepted: ['repaired', 'replaced', 'refunded', 'rejected'],
    repaired: ['closed'],
    replaced: ['closed'],
    refunded: ['closed'],
    rejected: ['closed'],
    closed: [],
};
exports.RMA_RESOLUTIONS = ['repaired', 'replaced', 'refunded', 'rejected'];
exports.RMA_OPEN_STATUSES = ['created', 'shipped', 'accepted'];
function assertRmaTransition(from, to) {
    if (!TRANSITIONS[from]?.includes(to)) {
        throw new errors_1.ValidationError('illegal_rma_transition', `Недопустимый переход RMA: ${from} → ${to}`);
    }
}
//# sourceMappingURL=rma-state.js.map