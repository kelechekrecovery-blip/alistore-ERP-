import { parseBusinessDay } from '../common/business-time';
export declare const DAY_MS: number;
export { parseBusinessDay };
export declare function revenueWindowStartMs(days: number, now: Date): number;
export declare function previousWindowStartMs(days: number, now: Date): number;
export interface RevenueTrend {
    current: number;
    previous: number;
    deltaPct: number | null;
    direction: 'up' | 'down' | 'flat';
}
export declare function buildRevenueTrend(current: number, previous: number): RevenueTrend;
export declare function buildRevenueBuckets(payments: {
    amount: number;
    createdAt: Date;
}[], days: number, now: Date): {
    day: string;
    amount: number;
}[];
export declare function buildRangeBuckets(payments: {
    amount: number;
    createdAt: Date;
}[], startMs: number, endMs: number): {
    day: string;
    amount: number;
}[];
