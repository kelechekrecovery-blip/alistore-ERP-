"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBusinessDay = exports.DAY_MS = void 0;
exports.revenueWindowStartMs = revenueWindowStartMs;
exports.previousWindowStartMs = previousWindowStartMs;
exports.buildRevenueTrend = buildRevenueTrend;
exports.buildRevenueBuckets = buildRevenueBuckets;
exports.buildRangeBuckets = buildRangeBuckets;
const business_time_1 = require("../common/business-time");
Object.defineProperty(exports, "parseBusinessDay", { enumerable: true, get: function () { return business_time_1.parseBusinessDay; } });
exports.DAY_MS = 24 * 60 * 60 * 1000;
function revenueWindowStartMs(days, now) {
    return (0, business_time_1.businessDayStartMs)(now) - (days - 1) * exports.DAY_MS;
}
function previousWindowStartMs(days, now) {
    return revenueWindowStartMs(days, now) - days * exports.DAY_MS;
}
function buildRevenueTrend(current, previous) {
    const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
    const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
    return { current, previous, deltaPct, direction };
}
function buildRevenueBuckets(payments, days, now) {
    const startMs = revenueWindowStartMs(days, now);
    const buckets = [];
    for (let i = 0; i < days; i += 1) {
        buckets.push({ day: (0, business_time_1.businessDayIso)(new Date(startMs + i * exports.DAY_MS)), amount: 0 });
    }
    for (const p of payments) {
        const key = (0, business_time_1.businessDayIso)(p.createdAt);
        const b = buckets.find((x) => x.day === key);
        if (b)
            b.amount += p.amount;
    }
    return buckets;
}
function buildRangeBuckets(payments, startMs, endMs) {
    const dayCount = Math.floor((endMs - startMs) / exports.DAY_MS) + 1;
    const buckets = [];
    for (let i = 0; i < dayCount; i += 1) {
        buckets.push({ day: (0, business_time_1.businessDayIso)(new Date(startMs + i * exports.DAY_MS)), amount: 0 });
    }
    for (const p of payments) {
        const key = (0, business_time_1.businessDayIso)(p.createdAt);
        const b = buckets.find((x) => x.day === key);
        if (b)
            b.amount += p.amount;
    }
    return buckets;
}
//# sourceMappingURL=revenue-buckets.js.map