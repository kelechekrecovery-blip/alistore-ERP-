"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
function fetchWithTimeout(input, init = {}, timeoutMs = 10_000) {
    return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
//# sourceMappingURL=fetch-with-timeout.js.map