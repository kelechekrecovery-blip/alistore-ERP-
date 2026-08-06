"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANALYTICS_EVENT_TYPES = void 0;
exports.isAnalyticsEventType = isAnalyticsEventType;
exports.ANALYTICS_EVENT_TYPES = ['product_view', 'add_to_cart', 'checkout_started'];
function isAnalyticsEventType(value) {
    return exports.ANALYTICS_EVENT_TYPES.includes(value);
}
//# sourceMappingURL=analytics-events.js.map