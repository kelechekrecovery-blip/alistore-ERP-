import { ReportsService } from './reports.service';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { AnalyticsService } from '../analytics/analytics.service';
export declare class ReportsController {
    private readonly reports;
    private readonly staffAuth;
    private readonly analytics;
    constructor(reports: ReportsService, staffAuth: StaffAuthService, analytics: AnalyticsService);
    dashboard(user: AuthPrincipal): Promise<{
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
    revenue(days?: string): Promise<{
        day: string;
        amount: number;
    }[]>;
    revenueRange(from: string, to: string): Promise<{
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
    revenueTrend(days?: string): Promise<import("./revenue-buckets").RevenueTrend>;
    payroll(): Promise<import("./payroll").Payroll>;
    risks(): Promise<{
        count: number;
        signals: import("./risk-signals").RiskSignal[];
    }>;
    ledger(type?: string, ref?: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        type: string;
        actor: string;
        ts: Date;
        payload: import("@prisma/client/runtime/library").JsonValue;
        refs: string[];
    }[]>;
    zReport(date: string): Promise<{
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
    funnel(from?: string, to?: string): Promise<import("../analytics/analytics.service").FunnelCounts>;
}
