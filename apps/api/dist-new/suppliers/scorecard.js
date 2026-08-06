"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildScorecard = buildScorecard;
const RESOLVED = new Set(['repaired', 'replaced', 'refunded']);
function buildScorecard(suppliers, rmas) {
    return suppliers.map((s) => {
        const own = rmas.filter((r) => r.supplierId === s.id);
        const resolved = own.filter((r) => r.resolution && RESOLVED.has(r.resolution)).length;
        const rejected = own.filter((r) => r.resolution === 'rejected').length;
        const open = own.filter((r) => !r.resolution).length;
        const decided = resolved + rejected;
        return {
            supplierId: s.id,
            supplier: s.name,
            total: own.length,
            open,
            resolved,
            rejected,
            resolutionRate: decided > 0 ? Math.round((resolved / decided) * 100) / 100 : null,
        };
    });
}
//# sourceMappingURL=scorecard.js.map