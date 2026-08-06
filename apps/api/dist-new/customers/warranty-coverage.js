"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WARRANTY_COVERAGE_MONTHS = void 0;
exports.warrantyCoverage = warrantyCoverage;
exports.WARRANTY_COVERAGE_MONTHS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
function warrantyCoverage(purchasedAt, now = new Date(), coverageMonths = exports.WARRANTY_COVERAGE_MONTHS) {
    if (!purchasedAt)
        return null;
    const until = new Date(purchasedAt);
    until.setMonth(until.getMonth() + coverageMonths);
    const daysLeft = Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS));
    return { until, daysLeft };
}
//# sourceMappingURL=warranty-coverage.js.map