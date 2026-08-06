"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCanSend = assertCanSend;
exports.assertCanReceive = assertCanReceive;
exports.assertCanCancel = assertCanCancel;
const errors_1 = require("../common/errors");
function assertCanSend(status) {
    if (status !== 'draft') {
        throw new errors_1.ConflictError('purchase_order_not_draft', `PO нельзя отправить из статуса ${status}`);
    }
}
function assertCanReceive(status) {
    if (status !== 'sent' && status !== 'receiving') {
        throw new errors_1.ConflictError('purchase_order_not_receivable', `PO нельзя принять из статуса ${status}`);
    }
}
function assertCanCancel(status) {
    if (status !== 'draft' && status !== 'sent') {
        throw new errors_1.ConflictError('purchase_order_not_cancellable', `PO нельзя отменить из статуса ${status}`);
    }
}
//# sourceMappingURL=purchase-order-state.js.map