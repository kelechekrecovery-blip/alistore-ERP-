export type InsightTone = 'positive' | 'warning' | 'info';
export interface Insight {
    tone: InsightTone;
    title: string;
    detail: string;
}
interface InsightInput {
    marginPct: number;
    grossMargin: number;
    avgCheck: number;
    paidOrders: number;
    topProduct: {
        name: string;
        revenue: number;
    } | null;
    topSeller: {
        staffId: string;
        revenue: number;
    } | null;
    net: number;
    refunds: number;
    pendingApprovals: number;
    risks: {
        kind: string;
        severity: string;
        detail: string;
    }[];
    reorderUrgent?: {
        count: number;
        names: string[];
    };
    overstock?: {
        count: number;
        topName: string | null;
    };
}
export declare function buildInsights(input: InsightInput): Insight[];
export {};
