"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOP_SELLERS_LIMIT = exports.TOP_PRODUCTS_LIMIT = void 0;
exports.buildKpi = buildKpi;
exports.TOP_PRODUCTS_LIMIT = 5;
exports.TOP_SELLERS_LIMIT = 8;
function buildKpi(input) {
    const { revenue, cogs, paidOrders, productRows, names } = input;
    const grossMargin = revenue - cogs;
    const marginPct = revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0;
    const avgCheck = paidOrders > 0 ? Math.round(revenue / paidOrders) : 0;
    const topProducts = [...productRows]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, exports.TOP_PRODUCTS_LIMIT)
        .map((row) => ({ ...row, name: names[row.sku] ?? row.sku }));
    const sellers = [...input.sellerRows]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, exports.TOP_SELLERS_LIMIT);
    return { revenue, cogs, grossMargin, marginPct, avgCheck, paidOrders, topProducts, sellers };
}
//# sourceMappingURL=kpi.js.map