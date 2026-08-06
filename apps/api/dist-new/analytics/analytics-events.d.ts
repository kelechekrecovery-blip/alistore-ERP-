export declare const ANALYTICS_EVENT_TYPES: readonly ["product_view", "add_to_cart", "checkout_started"];
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];
export declare function isAnalyticsEventType(value: string): value is AnalyticsEventType;
