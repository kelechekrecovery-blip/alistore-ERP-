import { Insight } from './insight';
export interface InsightContext {
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
export interface InsightProvider {
    readonly source: string;
    generate(ctx: InsightContext): Promise<Insight[]>;
}
export declare class RuleInsightProvider implements InsightProvider {
    readonly source = "rules";
    generate(ctx: InsightContext): Promise<Insight[]>;
}
export declare const INSIGHT_SCHEMA: Record<string, unknown>;
export declare function coerceInsights(parsed: unknown): Insight[];
export declare const ASSISTANT_SYSTEM: string;
export declare const ASSISTANT_TASK = "\u041F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0439 \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430 \u0438 \u0432\u0435\u0440\u043D\u0438 \u0433\u043B\u0430\u0432\u043D\u044B\u0435 \u0438\u043D\u0441\u0430\u0439\u0442\u044B \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u043B\u044F \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445.";
