import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
export declare const COD_STALE_MS: number;
export declare class ReportsService {
    private readonly prisma;
    private readonly settings;
    constructor(prisma: PrismaService, settings: SettingsService);
    private static readonly COD_RECOGNISED_WHERE;
    private codRecognisedRevenue;
    private sellerRevenueTotals;
    private topProductRows;
    private soldCogs;
    private static asRevenueRows;
    revenue(days?: number): Promise<{
        day: string;
        amount: number;
    }[]>;
    revenueTrend(days?: number): Promise<import("./revenue-buckets").RevenueTrend>;
    revenueRange(fromIso: string, toIso: string): Promise<{
        from: string;
        to: string;
        days: number;
        total: number;
        buckets: {
            day: string;
            amount: number;
        }[];
        trend: import("./revenue-buckets").RevenueTrend;
    }>;
    zReport(dateIso: string): Promise<{
        date: string;
        shifts: {
            id: string;
            point: string;
            closedAt: Date | null;
            staffId: string;
            openCash: number;
            closeCash: number | null;
            diff: number | null;
            openedAt: Date;
        }[];
        totals: {
            shifts: number;
            salesByMethod: {
                [k: string]: number;
            };
            salesTotal: number;
            incassationTotal: number;
            openCashTotal: number;
            closeCashTotal: number;
            varianceTotal: number;
        };
    }>;
    dashboard(staffId?: string): Promise<{
        money: {
            salesGross: number;
            refunds: number;
            net: number;
            expenses: number;
            cogs: number;
            operatingProfit: number;
            byMethod: {
                method: import(".prisma/client").$Enums.PaymentMethod;
                amount: number;
            }[];
        };
        today: {
            salesGross: number;
            orders: number;
        };
        cash: {
            inDrawers: number;
            openShifts: number;
            ownOpenShiftExcluded: boolean;
        };
        debts: {
            openBalance: number;
            overdue: number;
        };
        orders: {
            total: number;
            byStatus: {
                status: import(".prisma/client").$Enums.OrderStatus;
                count: number;
            }[];
        };
        stock: {
            byStatus: {
                status: import(".prisma/client").$Enums.UnitStatus;
                count: number;
            }[];
        };
        ops: {
            openShifts: number;
            pendingApprovals: number;
        };
        revenue7d: {
            day: string;
            amount: number;
        }[];
    }>;
    kpi(): Promise<import("./kpi").Kpi>;
    payroll(): Promise<import("./payroll").Payroll>;
    risks(): Promise<{
        count: number;
        signals: import("./risk-signals").RiskSignal[];
    }>;
    ledger(filter: {
        type?: string;
        ref?: string;
    }): Prisma.PrismaPromise<{
        id: string;
        type: string;
        actor: string;
        ts: Date;
        payload: Prisma.JsonValue;
        refs: string[];
    }[]>;
}
