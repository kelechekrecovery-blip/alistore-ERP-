"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayCourierHandover = replayCourierHandover;
exports.assertCourierRunOwner = assertCourierRunOwner;
const errors_1 = require("../common/errors");
function replayCourierHandover(run, runId, payload) {
    const same = run.id === runId && run.handoverAmount === payload.amount && run.handoverReason === payload.reason;
    if (!same)
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой COD-сдачей');
    return { ...run, diff: payload.amount - (run.collectedTotal ?? run.codTotal) };
}
function assertCourierRunOwner(run, expectedCourierId) {
    if (expectedCourierId && run.courierId !== expectedCourierId) {
        throw new errors_1.ForbiddenError('courier_run_forbidden', 'Рейс назначен другому курьеру');
    }
}
//# sourceMappingURL=courier-handover.js.map