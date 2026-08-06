"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUSINESS_UTC_OFFSET = exports.BUSINESS_TIME_ZONE = void 0;
exports.parseBusinessDay = parseBusinessDay;
exports.businessDayIso = businessDayIso;
exports.businessDayStartMs = businessDayStartMs;
exports.BUSINESS_TIME_ZONE = 'Asia/Bishkek';
exports.BUSINESS_UTC_OFFSET = '+06:00';
const OFFSET_MS = 6 * 60 * 60 * 1000;
function parseBusinessDay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m)
        return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const ms = Date.UTC(y, mo - 1, d) - OFFSET_MS;
    const back = new Date(ms + OFFSET_MS);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d)
        return null;
    return ms;
}
function businessDayIso(at) {
    return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}
function businessDayStartMs(at) {
    return parseBusinessDay(businessDayIso(at));
}
//# sourceMappingURL=business-time.js.map