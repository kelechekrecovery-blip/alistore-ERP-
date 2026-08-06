"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIORITY_LADDER = exports.TICKET_OPEN_STATUSES = void 0;
exports.assertTicketTransition = assertTicketTransition;
exports.normalizePriority = normalizePriority;
exports.slaFor = slaFor;
exports.escalatedPriority = escalatedPriority;
const errors_1 = require("../common/errors");
const TRANSITIONS = {
    new: ['in_progress', 'closed'],
    in_progress: ['waiting', 'resolved'],
    waiting: ['in_progress', 'resolved'],
    resolved: ['closed', 'in_progress'],
    closed: [],
};
exports.TICKET_OPEN_STATUSES = ['new', 'in_progress', 'waiting'];
function assertTicketTransition(from, to) {
    if (!TRANSITIONS[from]?.includes(to)) {
        throw new errors_1.ValidationError('illegal_ticket_transition', `Недопустимый переход тикета: ${from} → ${to}`);
    }
}
exports.PRIORITY_LADDER = ['normal', 'high', 'urgent'];
const SLA_HOURS = { normal: 72, high: 24, urgent: 4 };
function normalizePriority(p) {
    return exports.PRIORITY_LADDER.includes(p ?? '') ? p : 'normal';
}
function slaFor(priority, from) {
    return new Date(from + SLA_HOURS[priority] * 60 * 60 * 1000);
}
function escalatedPriority(current) {
    const idx = exports.PRIORITY_LADDER.indexOf(normalizePriority(current));
    return idx < exports.PRIORITY_LADDER.length - 1 ? exports.PRIORITY_LADDER[idx + 1] : null;
}
//# sourceMappingURL=ticket-state.js.map