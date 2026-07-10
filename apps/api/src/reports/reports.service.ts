import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildRiskSignals,
  computeDiscountFrequency,
  computeMarginLeaks,
  computeRepeatReturns,
  computeWriteOffSpike,
} from './risk-signals';
import { buildKpi } from './kpi';
import { buildPayroll } from './payroll';
import {
  buildRangeBuckets,
  buildRevenueBuckets,
  buildRevenueTrend,
  DAY_MS,
  parseUtcDay,
  previousWindowStartMs,
  revenueWindowStartMs,
} from './revenue-buckets';
import { ValidationError } from '../common/errors';

/** Widest custom revenue window a single query will bucket. */
const MAX_RANGE_DAYS = 366;

/**
 * Order statuses at or after payment — «the money is in». Covers the whole
 * fulfillment chain (paid → picking → … → delivered → completed) plus exchanged,
 * so revenue/KPI/margin-leak reads don't drop paid orders still in transit.
 * Excludes reversals (return_requested/returned/refunded/cancelled).
 */
const REVENUE_STATUSES: OrderStatus[] = [
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

/** Clamp a days query param to 1..90, defaulting non-finite input to 7 (avoids NaN→500). */
function clampDays(days: number): number {
  return Number.isFinite(days) ? Math.min(90, Math.max(1, Math.round(days))) : 7;
}

/** COD older than this without handover is a risk (Risk Center). */
export const COD_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Owner cockpit reads. Every number is derived from the same tables the Event
 * Ledger writes to — reports never keep their own running totals, so the dashboard
 * and Risk Center cannot diverge from reality (Event-Ledger-first).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sales per day for the last 7 days (revenue chart). UTC-consistent bucketing. */
  /** Daily revenue buckets for the last N days (UTC-consistent). Powers the dashboard chart. */
  async revenue(days = 7): Promise<{ day: string; amount: number }[]> {
    const span = clampDays(days);
    const now = new Date();
    const startMs = revenueWindowStartMs(span, now);
    const payments = await this.prisma.payment.findMany({
      where: {
        amount: { gt: 0 },
        status: { in: ['received', 'reconciled'] },
        createdAt: { gte: new Date(startMs) },
      },
      select: { amount: true, createdAt: true },
    });
    return buildRevenueBuckets(payments, span, now);
  }

  /** Period-over-period revenue trend: last N days vs the N days before them. */
  async revenueTrend(days = 7) {
    const span = clampDays(days);
    const now = new Date();
    const currentStart = new Date(revenueWindowStartMs(span, now));
    const prevStart = new Date(previousWindowStartMs(span, now));
    const [cur, prev] = await Promise.all([
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
    ]);
    return buildRevenueTrend(cur._sum.amount ?? 0, prev._sum.amount ?? 0);
  }

  /** Daily revenue buckets for an arbitrary [from, to] date range (YYYY-MM-DD, inclusive). */
  async revenueRange(fromIso: string, toIso: string) {
    const fromMs = parseUtcDay(fromIso);
    const toMs = parseUtcDay(toIso);
    if (fromMs === null || toMs === null) {
      throw new ValidationError('invalid_date', 'Даты должны быть в формате YYYY-MM-DD');
    }
    if (fromMs > toMs) {
      throw new ValidationError('invalid_range', '«from» должно быть не позже «to»');
    }
    const spanDays = Math.floor((toMs - fromMs) / DAY_MS) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      throw new ValidationError('range_too_wide', `Максимум ${MAX_RANGE_DAYS} дней в одном запросе`);
    }
    const endExclusive = new Date(toMs + DAY_MS); // include the whole «to» day
    const prevFromMs = fromMs - spanDays * DAY_MS; // equal-length window immediately before
    const [payments, prevAgg] = await Promise.all([
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
    ]);
    const buckets = buildRangeBuckets(payments, fromMs, toMs);
    const total = buckets.reduce((sum, b) => sum + b.amount, 0);
    const trend = buildRevenueTrend(total, prevAgg._sum.amount ?? 0);
    return { from: fromIso, to: toIso, days: spanDays, total, buckets, trend };
  }

  /** Aggregated KPIs: money, orders, stock, ops, 7-day revenue. */
  async dashboard() {
    const [sales, refunds, ordersByStatus, unitsByStatus, byMethod, orderCount, openShifts, pendingApprovals, revenue7d] =
      await Promise.all([
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
        }),
        this.prisma.payment.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }),
        this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.deviceUnit.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.payment.groupBy({
          by: ['method'],
          _sum: { amount: true },
          where: { amount: { gt: 0 } },
        }),
        this.prisma.order.count(),
        this.prisma.cashShift.count({ where: { closedAt: null } }),
        this.prisma.approval.count({ where: { status: 'requested' } }),
        this.revenue(7),
      ]);

    const salesGross = sales._sum.amount ?? 0;
    const refunded = Math.abs(refunds._sum.amount ?? 0);

    return {
      money: {
        salesGross,
        refunds: refunded,
        net: salesGross - refunded,
        byMethod: byMethod.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0 })),
      },
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

  /** Owner KPIs: gross margin (revenue − COGS), average check, top products. */
  async kpi() {
    const paid = REVENUE_STATUSES;
    const [rev, soldUnits, paidOrders, items, products, sellerPayments] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
      }),
      this.prisma.deviceUnit.findMany({ where: { status: 'sold' }, select: { product: { select: { cost: true } } } }),
      this.prisma.order.count({ where: { status: { in: paid } } }),
      this.prisma.orderItem.findMany({
        where: { order: { status: { in: paid } } },
        select: { sku: true, qty: true, price: true },
      }),
      this.prisma.product.findMany({ select: { sku: true, name: true } }),
      this.prisma.payment.findMany({
        where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] }, shiftId: { not: null } },
        select: { amount: true, shift: { select: { staffId: true } } },
      }),
    ]);
    const revenue = rev._sum.amount ?? 0;
    const cogs = soldUnits.reduce((sum, u) => sum + (u.product?.cost ?? 0), 0);
    const names = Object.fromEntries(products.map((p) => [p.sku, p.name]));
    const sellerRows = sellerPayments
      .filter((p) => p.shift)
      .map((p) => ({ staffId: p.shift!.staffId, amount: p.amount }));
    return buildKpi({ revenue, cogs, paidOrders, items, names, sellerRows });
  }

  /** Seller payroll: base + commission on turnover, per seller (via shift.staffId). */
  async payroll() {
    const sellerPayments = await this.prisma.payment.findMany({
      where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] }, shiftId: { not: null } },
      select: { amount: true, shift: { select: { staffId: true } } },
    });
    const bySeller = new Map<string, { revenue: number; sales: number }>();
    for (const p of sellerPayments) {
      if (!p.shift) continue;
      const cur = bySeller.get(p.shift.staffId) ?? { revenue: 0, sales: 0 };
      cur.revenue += p.amount;
      cur.sales += 1;
      bySeller.set(p.shift.staffId, cur);
    }
    const sellers = [...bySeller.entries()].map(([staffId, v]) => ({ staffId, ...v }));
    return buildPayroll(sellers);
  }

  /** Risk Center: discrepancies, outstanding COD, stale reservations, pending approvals. */
  async risks() {
    const now = new Date();
    const paid = REVENUE_STATUSES;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);
    const [
      cashDiscrepancies,
      codOutstanding,
      staleReservations,
      pendingApprovals,
      warrantyOverdue,
      rmaOverdue,
      debtsOverdue,
      ticketsOverdue,
      paidItems,
      productCosts,
      soldWithoutOrder,
      tradeins,
      recentReturns,
      recentPosOrders,
      writeOffMovements,
    ] = await Promise.all([
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

    // Anti-fraud: a buyback IMEI that also exists among sold units (swap/laundering).
    const tradeinImeis = tradeins.map((t) => t.imei).filter((v): v is string => !!v);
    const imeiReuse = tradeinImeis.length
      ? (
          await this.prisma.deviceUnit.findMany({
            where: { status: 'sold', imei: { in: tradeinImeis } },
            select: { imei: true },
          })
        ).map((u) => u.imei)
      : [];

    const marginLeaks = computeMarginLeaks(paidItems, productCosts);
    const returnOrders = recentReturns.length
      ? await this.prisma.order.findMany({
          where: { id: { in: recentReturns.map((row) => row.orderId) } },
          select: { customerId: true, customer: { select: { name: true } } },
        })
      : [];
    const repeatReturns = computeRepeatReturns(
      returnOrders.map((order) => ({ customerId: order.customerId, customerName: order.customer.name })),
    );
    const discountFrequency = computeDiscountFrequency(
      recentPosOrders.flatMap((order) => {
        const staffId = order.payments[0]?.shift?.staffId;
        if (!staffId) return [];
        const gross = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
        return [{ staffId, gross, total: order.total }];
      }),
    );
    const writeOffSpike = computeWriteOffSpike(writeOffMovements, now);

    const signals = buildRiskSignals(
      {
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
      },
      now,
    );
    return { count: signals.length, signals };
  }

  /** Event Ledger feed (read-only), optionally filtered by type / referenced id. */
  ledger(filter: { type?: string; ref?: string }) {
    const where: Prisma.AuditEventWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.ref) where.refs = { has: filter.ref };
    return this.prisma.auditEvent.findMany({ where, orderBy: { ts: 'desc' }, take: 50 });
  }
}
