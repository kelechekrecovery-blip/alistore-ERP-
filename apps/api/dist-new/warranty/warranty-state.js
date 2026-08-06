"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WARRANTY_TRANSITIONS = void 0;
exports.assertWarrantyTransition = assertWarrantyTransition;
const errors_1 = require("../common/errors");
exports.WARRANTY_TRANSITIONS = {
    created: ['received', 'rejected'],
    received: ['diagnostics', 'rejected'],
    diagnostics: ['waiting_supplier', 'approved', 'rejected'],
    waiting_supplier: ['approved', 'rejected'],
    approved: ['repairing', 'repaired', 'replaced'],
    repairing: ['repaired', 'replaced'],
    rejected: ['closed'],
    repaired: ['closed'],
    replaced: ['closed'],
    closed: [],
};
function assertWarrantyTransition(from, to) {
    if (!exports.WARRANTY_TRANSITIONS[from]?.includes(to)) {
        throw new errors_1.ValidationError('illegal_warranty_transition', `Недопустимый переход гарантии: ${from} → ${to}`);
    }
}
//# sourceMappingURL=warranty-state.js.map