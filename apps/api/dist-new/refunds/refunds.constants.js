"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROVIDER_PENDING_STALE_MS = exports.PROVIDER_PENDING_STALE_PREFIX = exports.PROVIDER_TERMINAL_FAILURE_PREFIX = exports.MAX_REFUND_ATTEMPTS = void 0;
exports.isStaleProviderPendingFailure = isStaleProviderPendingFailure;
exports.nextRefundAttempt = nextRefundAttempt;
exports.MAX_REFUND_ATTEMPTS = 5;
exports.PROVIDER_TERMINAL_FAILURE_PREFIX = 'provider_terminal_failure:';
exports.PROVIDER_PENDING_STALE_PREFIX = 'provider_pending_stale:';
exports.DEFAULT_PROVIDER_PENDING_STALE_MS = 24 * 60 * 60_000;
function isStaleProviderPendingFailure(lastError) {
    return Boolean(lastError?.startsWith(exports.PROVIDER_PENDING_STALE_PREFIX));
}
function nextRefundAttempt(attempts, now = Date.now()) {
    const delayMs = Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 60 * 60_000);
    return new Date(now + delayMs);
}
//# sourceMappingURL=refunds.constants.js.map