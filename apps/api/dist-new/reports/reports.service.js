"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = exports.COD_STALE_MS = void 0;
const common_1 = require("@nestjs/common");
const inventory_valuation_1 = require("../inventory/inventory-valuation");
const prisma_service_1 = require("../prisma/prisma.service");
const risk_signals_1 = require("./risk-signals");
const kpi_1 = require("./kpi");
const payroll_1 = require("./payroll");
const seller_revenue_1 = require("./seller-revenue");
const revenue_buckets_1 = require("./revenue-buckets");
const errors_1 = require("../common/errors");
const settings_service_1 = require("../settings/settings.service");
const MAX_RANGE_DAYS = 366;
const REVENUE_STATUSES = [
    'paid',
    'picking',
    'packed',
    'ready_for_pickup',
    'courier_assigned',
    'out_for_delivery',
    'delivered',
    'completed',
    'exchanged',
];
function clampDays(days) {
    return Number.isFinite(days) ? Math.min(90, Math.max(1, Math.round(days))) : 7;
}
exports.COD_STALE_MS = 24 * 60 * 60 * 1000;
let ReportsService = ReportsService_1 = class ReportsService {
    constructor(prisma, settings) {
        this.prisma = prisma;
        this.settings = settings;
    }
    codRecognisedRevenue(from, to) {
        return this.prisma.accountingJournalEntry.findMany({
            where: {
                ...ReportsService_1.COD_RECOGNISED_WHERE,
                ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
            },
            select: { documentAmount: true, occurredAt: true },
        });
    }
    async sellerRevenueTotals() {
        const where = (0, seller_revenue_1.sellerRevenueWhere)();
        const [direct, viaShift] = await Promise.all([
            this.prisma.payment.groupBy({
                by: ['receivedBy'],
                where: { ...where, receivedBy: { not: null } },
                _sum: { amount: true },
                _count: { _all: true },
            }),
            this.prisma.payment.groupBy({
                by: ['shiftId'],
                where: { ...where, receivedBy: null, shiftId: { not: null } },
                _sum: { amount: true },
                _count: { _all: true },
            }),
        ]);
        const totals = new Map();
        const add = (staffId, revenue, sales) => {
            const cur = totals.get(staffId) ?? { revenue: 0, sales: 0 };
            totals.set(staffId, { revenue: cur.revenue + revenue, sales: cur.sales + sales });
        };
        for (const row of direct) {
            if (row.receivedBy)
                add((0, seller_revenue_1.normalizeSellerActor)(row.receivedBy), row._sum.amount ?? 0, row._count._all);
        }
        const shiftIds = viaShift.map((row) => row.shiftId).filter((id) => id !== null);
        if (shiftIds.length > 0) {
            const shifts = await this.prisma.cashShift.findMany({
                where: { id: { in: shiftIds } },
                select: { id: true, staffId: true },
            });
            const staffByShift = new Map(shifts.map((shift) => [shift.id, shift.staffId]));
            for (const row of viaShift) {
                const staffId = row.shiftId ? staffByShift.get(row.shiftId) : undefined;
                if (staffId)
                    add(staffId, row._sum.amount ?? 0, row._count._all);
            }
        }
        const realStaff = await this.prisma.staffUser.findMany({
            where: { id: { in: [...totals.keys()] } },
            select: { id: true },
        });
        const known = new Set(realStaff.map((row) => row.id));
        return [...totals.entries()]
            .filter(([staffId]) => known.has(staffId))
            .map(([staffId, value]) => ({ staffId, ...value }));
    }
    async topProductRows() {
        const grouped = await this.prisma.orderItem.groupBy({
            by: ['sku', 'price'],
            where: { order: { status: { in: REVENUE_STATUSES } } },
            _sum: { qty: true },
        });
        const byProduct = new Map();
        for (const row of grouped) {
            const units = row._sum.qty ?? 0;
            const cur = byProduct.get(row.sku) ?? { units: 0, revenue: 0 };
            byProduct.set(row.sku, { units: cur.units + units, revenue: cur.revenue + units * row.price });
        }
        const rows = [...byProduct.entries()]
            .map(([sku, value]) => ({ sku, ...value }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, kpi_1.TOP_PRODUCTS_LIMIT);
        const products = await this.prisma.product.findMany({
            where: { sku: { in: rows.map((row) => row.sku) } },
            select: { sku: true, name: true },
        });
        return { rows, names: Object.fromEntries(products.map((p) => [p.sku, p.name])) };
    }
    async soldCogs() {
        const totals = await this.prisma.accountingJournalLine.aggregate({
            _sum: { debit: true, credit: true },
            where: { accountCode: inventory_valuation_1.COGS_ACCOUNT },
        });
        return (totals._sum.debit ?? 0) - (totals._sum.credit ?? 0);
    }
    static asRevenueRows(entries) {
        return entries
            .filter((entry) => (entry.documentAmount ?? 0) > 0)
            .map((entry) => ({ amount: entry.documentAmount, createdAt: entry.occurredAt }));
    }
    async revenue(days = 7) {
        const span = clampDays(days);
        const now = new Date();
        const startMs = (0, revenue_buckets_1.revenueWindowStartMs)(span, now);
        const [payments, cod] = await Promise.all([
            this.prisma.payment.findMany({
                where: {
                    amount: { gt: 0 },
                    status: { in: ['received', 'reconciled'] },
                    createdAt: { gte: new Date(startMs) },
                },
                select: { amount: true, createdAt: true },
            }),
            this.codRecognisedRevenue(new Date(startMs)),
        ]);
        return (0, revenue_buckets_1.buildRevenueBuckets)([...payments, ...ReportsService_1.asRevenueRows(cod)], span, now);
    }
    async revenueTrend(days = 7) {
        const span = clampDays(days);
        const now = new Date();
        const currentStart = new Date((0, revenue_buckets_1.revenueWindowStartMs)(span, now));
        const prevStart = new Date((0, revenue_buckets_1.previousWindowStartMs)(span, now));
        const [cur, prev, codCur, codPrev] = await Promise.all([
            this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] }, createdAt: { gte: currentStart } },
            }),
            this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: {
                    amount: { gt: 0 },
                    status: { in: ['received', 'reconciled'] },
                    createdAt: { gte: prevStart, lt: currentStart },
                },
            }),
            this.prisma.accountingJournalEntry.aggregate({
                _sum: { documentAmount: true },
                where: { sourceType: 'cod.receivable', occurredAt: { gte: currentStart } },
            }),
            this.prisma.accountingJournalEntry.aggregate({
                _sum: { documentAmount: true },
                where: { sourceType: 'cod.receivable', occurredAt: { gte: prevStart, lt: currentStart } },
            }),
        ]);
        return (0, revenue_buckets_1.buildRevenueTrend)((cur._sum.amount ?? 0) + (codCur._sum.documentAmount ?? 0), (prev._sum.amount ?? 0) + (codPrev._sum.documentAmount ?? 0));
    }
    async revenueRange(fromIso, toIso) {
        const fromMs = (0, revenue_buckets_1.parseBusinessDay)(fromIso);
        const toMs = (0, revenue_buckets_1.parseBusinessDay)(toIso);
        if (fromMs === null || toMs === null) {
            throw new errors_1.ValidationError('invalid_date', 'Даты должны быть в формате YYYY-MM-DD');
        }
        if (fromMs > toMs) {
            throw new errors_1.ValidationError('invalid_range', '«from» должно быть не позже «to»');
        }
        const spanDays = Math.floor((toMs - fromMs) / revenue_buckets_1.DAY_MS) + 1;
        if (spanDays > MAX_RANGE_DAYS) {
            throw new errors_1.ValidationError('range_too_wide', `Максимум ${MAX_RANGE_DAYS} дней в одном запросе`);
        }
        const endExclusive = new Date(toMs + revenue_buckets_1.DAY_MS);
        const prevFromMs = fromMs - spanDays * revenue_buckets_1.DAY_MS;
        const [payments, prevAgg, cod, prevCod] = await Promise.all([
            this.prisma.payment.findMany({
                where: {
                    amount: { gt: 0 },
                    status: { in: ['received', 'reconciled'] },
                    createdAt: { gte: new Date(fromMs), lt: endExclusive },
                },
                select: { amount: true, createdAt: true },
            }),
            this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: {
                    amount: { gt: 0 },
                    status: { in: ['received', 'reconciled'] },
                    createdAt: { gte: new Date(prevFromMs), lt: new Date(fromMs) },
                },
            }),
            this.codRecognisedRevenue(new Date(fromMs), endExclusive),
            this.prisma.accountingJournalEntry.aggregate({
                _sum: { documentAmount: true },
                where: { sourceType: 'cod.receivable', occurredAt: { gte: new Date(prevFromMs), lt: new Date(fromMs) } },
            }),
        ]);
        const buckets = (0, revenue_buckets_1.buildRangeBuckets)([...payments, ...ReportsService_1.asRevenueRows(cod)], fromMs, toMs);
        const total = buckets.reduce((sum, b) => sum + b.amount, 0);
        const trend = (0, revenue_buckets_1.buildRevenueTrend)(total, (prevAgg._sum.amount ?? 0) + (prevCod._sum.documentAmount ?? 0));
        return { from: fromIso, to: toIso, days: spanDays, total, buckets, trend };
    }
    async zReport(dateIso) {
        const dayMs = (0, revenue_buckets_1.parseBusinessDay)(dateIso);
        if (dayMs === null) {
            throw new errors_1.ValidationError('invalid_date', 'Дата должна быть в формате YYYY-MM-DD');
        }
        const DAY = 24 * 60 * 60 * 1000;
        const start = new Date(dayMs);
        const end = new Date(dayMs + DAY);
        const shifts = await this.prisma.cashShift.findMany({
            where: { closedAt: { gte: start, lt: end } },
            orderBy: { closedAt: 'asc' },
            select: {
                id: true, point: true, staffId: true,
                openCash: true, closeCash: true, diff: true, openedAt: true, closedAt: true,
            },
        });
        const shiftIds = shifts.map((shift) => shift.id);
        const [byMethod, incassation] = await Promise.all([
            shiftIds.length
                ? this.prisma.payment.groupBy({
                    by: ['method'],
                    where: { shiftId: { in: shiftIds }, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
                    _sum: { amount: true },
                })
                : Promise.resolve([]),
            shiftIds.length
                ? this.prisma.cashIncassation.aggregate({ _sum: { amount: true }, where: { shiftId: { in: shiftIds } } })
                : Promise.resolve({ _sum: { amount: null } }),
        ]);
        const salesByMethod = Object.fromEntries(byMethod.map((row) => [row.method, row._sum.amount ?? 0]));
        const salesTotal = byMethod.reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);
        return {
            date: dateIso,
            shifts,
            totals: {
                shifts: shifts.length,
                salesByMethod,
                salesTotal,
                incassationTotal: incassation._sum.amount ?? 0,
                openCashTotal: shifts.reduce((sum, shift) => sum + shift.openCash, 0),
                closeCashTotal: shifts.reduce((sum, shift) => sum + (shift.closeCash ?? 0), 0),
                varianceTotal: shifts.reduce((sum, shift) => sum + (shift.diff ?? 0), 0),
            },
        };
    }
    async dashboard(staffId) {
        const now = new Date();
        const todayStart = new Date((0, revenue_buckets_1.revenueWindowStartMs)(1, now));
        const [sales, refunds, expenses, ordersByStatus, unitsByStatus, byMethod, orderCount, openShifts, pendingApprovals, revenue7d, todaySales, todayOrders, openShiftRows, debtAggregate, overdueDebts, codAll, codToday,] = await Promise.all([
            this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
            }),
            this.prisma.payment.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }),
            this.prisma.expense.aggregate({ _sum: { amount: true }, where: { status: 'paid' } }),
            this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.deviceUnit.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.payment.groupBy({
                by: ['method'],
                _sum: { amount: true },
                where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
            }),
            this.prisma.order.count(),
            this.prisma.cashShift.count({ where: { closedAt: null } }),
            this.prisma.approval.count({ where: { status: 'requested' } }),
            this.revenue(7),
            this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: {
                    amount: { gt: 0 },
                    status: { in: ['received', 'reconciled'] },
                    createdAt: { gte: todayStart },
                },
            }),
            this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
            this.prisma.cashShift.findMany({
                where: {
                    closedAt: null,
                    ...(staffId ? { staffId: { not: staffId } } : {}),
                },
                select: {
                    openCash: true,
                    payments: { where: { method: 'cash' }, select: { amount: true } },
                    drawerMovements: { select: { amount: true } },
                },
            }),
            this.prisma.debtPlan.aggregate({ _sum: { balance: true }, where: { status: 'open' } }),
            this.prisma.debtPlan.count({ where: { status: 'open', dueDate: { lt: now } } }),
            this.prisma.accountingJournalEntry.aggregate({
                _sum: { documentAmount: true },
                where: ReportsService_1.COD_RECOGNISED_WHERE,
            }),
            this.prisma.accountingJournalEntry.aggregate({
                _sum: { documentAmount: true },
                where: { ...ReportsService_1.COD_RECOGNISED_WHERE, occurredAt: { gte: todayStart } },
            }),
        ]);
        const salesGross = (sales._sum.amount ?? 0) + (codAll._sum.documentAmount ?? 0);
        const refunded = Math.abs(refunds._sum.amount ?? 0);
        const operatingExpenses = expenses._sum.amount ?? 0;
        const cogs = await this.soldCogs();
        const cashInDrawers = openShiftRows.reduce((sum, shift) => sum
            + shift.openCash
            + shift.payments.reduce((acc, p) => acc + p.amount, 0)
            + shift.drawerMovements.reduce((acc, m) => acc + m.amount, 0), 0);
        return {
            money: {
                salesGross,
                refunds: refunded,
                net: salesGross - refunded,
                expenses: operatingExpenses,
                cogs,
                operatingProfit: salesGross - refunded - operatingExpenses - cogs,
                byMethod: byMethod.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0 })),
            },
            today: {
                salesGross: (todaySales._sum.amount ?? 0) + (codToday._sum.documentAmount ?? 0),
                orders: todayOrders,
            },
            cash: { inDrawers: cashInDrawers, openShifts, ownOpenShiftExcluded: Boolean(staffId) },
            debts: { openBalance: debtAggregate._sum.balance ?? 0, overdue: overdueDebts },
            orders: {
                total: orderCount,
                byStatus: ordersByStatus.map((o) => ({ status: o.status, count: o._count._all })),
            },
            stock: {
                byStatus: unitsByStatus.map((u) => ({ status: u.status, count: u._count._all })),
            },
            ops: { openShifts, pendingApprovals },
            revenue7d,
        };
    }
    async kpi() {
        const paid = REVENUE_STATUSES;
        const [rev, codRevenue, cogs, paidOrders, top, sellerRows] = await Promise.all([
            this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
            }),
            this.prisma.accountingJournalEntry.aggregate({
                _sum: { documentAmount: true },
                where: ReportsService_1.COD_RECOGNISED_WHERE,
            }),
            this.soldCogs(),
            this.prisma.order.count({ where: { status: { in: paid } } }),
            this.topProductRows(),
            this.sellerRevenueTotals(),
        ]);
        const revenue = (rev._sum.amount ?? 0) + (codRevenue._sum.documentAmount ?? 0);
        return (0, kpi_1.buildKpi)({ revenue, cogs, paidOrders, productRows: top.rows, names: top.names, sellerRows });
    }
    async payroll() {
        const bySeller = await this.sellerRevenueTotals();
        const staff = await this.prisma.staffUser.findMany({
            where: { id: { in: bySeller.map((row) => row.staffId) } },
            select: { id: true, username: true },
        });
        const names = new Map(staff.map((row) => [row.id, row.username]));
        const sellers = bySeller.map((row) => ({
            ...row,
            username: names.get(row.staffId) ?? row.staffId,
        }));
        const [base, commissionBps] = await Promise.all([
            this.settings.value('payroll.base_amount_som'),
            this.settings.value('payroll.commission_bps'),
        ]);
        return (0, payroll_1.buildPayroll)(sellers, { base, commissionPct: commissionBps / 100 });
    }
    async risks() {
        const now = new Date();
        const paid = REVENUE_STATUSES;
        const thirtyDaysAgo = new Date(now.getTime() - 30 * revenue_buckets_1.DAY_MS);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * revenue_buckets_1.DAY_MS);
        const [cashDiscrepancies, codOutstanding, staleReservations, pendingApprovals, warrantyOverdue, rmaOverdue, debtsOverdue, ticketsOverdue, paidItems, productCosts, soldWithoutOrder, tradeins, recentReturns, recentPosOrders, writeOffMovements,] = await Promise.all([
            this.prisma.cashShift.findMany({
                where: { diff: { not: 0 }, closedAt: { not: null } },
                orderBy: { closedAt: 'desc' },
                take: 20,
            }),
            this.prisma.courierRun.findMany({
                where: { handedOver: false },
                orderBy: { createdAt: 'asc' },
                take: 20,
            }),
            this.prisma.reservation.count({ where: { active: true, expiresAt: { lt: now } } }),
            this.prisma.approval.findMany({
                where: { status: 'requested' },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
            this.prisma.warrantyCase.findMany({
                where: {
                    sla: { lt: now },
                    status: { notIn: ['repaired', 'replaced', 'closed', 'rejected'] },
                },
                orderBy: { sla: 'asc' },
                take: 20,
            }),
            this.prisma.supplierRma.findMany({
                where: { sla: { lt: now }, status: { in: ['created', 'shipped', 'accepted'] } },
                orderBy: { sla: 'asc' },
                take: 20,
            }),
            this.prisma.debtPlan.findMany({
                where: { status: 'open', balance: { gt: 0 }, dueDate: { lt: now } },
                orderBy: { dueDate: 'asc' },
                take: 20,
            }),
            this.prisma.supportTicket.findMany({
                where: { sla: { lt: now }, status: { in: ['new', 'in_progress', 'waiting'] } },
                orderBy: { sla: 'asc' },
                take: 20,
            }),
            this.prisma.orderItem.findMany({
                where: { order: { status: { in: paid } } },
                select: { sku: true, price: true },
            }),
            this.prisma.product.findMany({ select: { sku: true, name: true, cost: true } }),
            this.prisma.deviceUnit.findMany({
                where: { status: 'sold', orderId: null },
                select: { imei: true },
                take: 20,
            }),
            this.prisma.tradeInDevice.findMany({
                where: { imei: { not: null } },
                select: { imei: true },
                take: 200,
            }),
            this.prisma.return.findMany({
                where: { createdAt: { gte: thirtyDaysAgo } },
                select: { orderId: true },
                take: 500,
            }),
            this.prisma.order.findMany({
                where: { channel: 'pos', status: { in: paid }, createdAt: { gte: thirtyDaysAgo } },
                select: {
                    total: true,
                    items: { select: { qty: true, price: true } },
                    payments: {
                        where: { amount: { gt: 0 }, shiftId: { not: null } },
                        select: { shift: { select: { staffId: true } } },
                        take: 1,
                    },
                },
                take: 2000,
            }),
            this.prisma.inventoryMovement.findMany({
                where: { type: 'write_off', createdAt: { gte: fourteenDaysAgo } },
                select: { qty: true, createdAt: true },
                take: 500,
            }),
        ]);
        const soldWithoutOrderImeis = soldWithoutOrder.map((u) => u.imei);
        const tradeinImeis = tradeins.map((t) => t.imei).filter((v) => !!v);
        const imeiReuse = tradeinImeis.length
            ? (await this.prisma.deviceUnit.findMany({
                where: { status: 'sold', imei: { in: tradeinImeis } },
                select: { imei: true },
            })).map((u) => u.imei)
            : [];
        const marginLeaks = (0, risk_signals_1.computeMarginLeaks)(paidItems, productCosts);
        const returnOrders = recentReturns.length
            ? await this.prisma.order.findMany({
                where: { id: { in: recentReturns.map((row) => row.orderId) } },
                select: { customerId: true, customer: { select: { name: true } } },
            })
            : [];
        const repeatReturns = (0, risk_signals_1.computeRepeatReturns)(returnOrders.map((order) => ({ customerId: order.customerId, customerName: order.customer.name })));
        const discountFrequency = (0, risk_signals_1.computeDiscountFrequency)(recentPosOrders.flatMap((order) => {
            const staffId = order.payments[0]?.shift?.staffId;
            if (!staffId)
                return [];
            const gross = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
            return [{ staffId, gross, total: order.total }];
        }));
        const writeOffSpike = (0, risk_signals_1.computeWriteOffSpike)(writeOffMovements, now);
        const signals = (0, risk_signals_1.buildRiskSignals)({
            cashDiscrepancies,
            codOutstanding,
            staleReservations,
            pendingApprovals,
            warrantyOverdue,
            rmaOverdue,
            debtsOverdue,
            ticketsOverdue,
            marginLeaks,
            soldWithoutOrderImeis,
            imeiReuse,
            repeatReturns,
            discountFrequency,
            writeOffSpike,
        }, now);
        return { count: signals.length, signals };
    }
    ledger(filter) {
        const where = {};
        if (filter.type)
            where.type = filter.type;
        if (filter.ref)
            where.refs = { has: filter.ref };
        return this.prisma.auditEvent.findMany({ where, orderBy: { ts: 'desc' }, take: 50 });
    }
};
exports.ReportsService = ReportsService;
ReportsService.COD_RECOGNISED_WHERE = {
    sourceType: 'cod.receivable',
    reversal: { is: null },
};
exports.ReportsService = ReportsService = ReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map