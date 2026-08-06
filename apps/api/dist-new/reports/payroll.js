"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PAYROLL = void 0;
exports.buildPayroll = buildPayroll;
exports.DEFAULT_PAYROLL = { base: 15000, commissionPct: 1.5 };
function buildPayroll(sellers, cfg = exports.DEFAULT_PAYROLL) {
    const rows = sellers
        .map((s) => {
        const commission = Math.round((s.revenue * cfg.commissionPct) / 100);
        return { ...s, base: cfg.base, commission, total: cfg.base + commission };
    })
        .sort((a, b) => b.total - a.total);
    const totalPayout = rows.reduce((sum, r) => sum + r.total, 0);
    return { base: cfg.base, commissionPct: cfg.commissionPct, rows, totalPayout };
}
//# sourceMappingURL=payroll.js.map