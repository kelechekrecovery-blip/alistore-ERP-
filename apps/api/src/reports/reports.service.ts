import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildRiskSignals, MarginLeak } from './risk-signals';
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
    const span = Math.min(90, Math.max(1, Math.round(days))); // clamp 1..90
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
    const span = Math.min(90, Math.max(1, Math.round(days)));
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
    const payments = await this.prisma.payment.findMany({
      where: {
        amount: { gt: 0 },
        status: { in: ['received', 'reconciled'] },
        createdAt: { gte: new Date(fromMs), lt: new Date(toMs + DAY_MS) }, // include the whole «to» day
      },
      select: { amount: true, createdAt: true },
    });
    const buckets = buildRangeBuckets(payments, fromMs, toMs);
    const total = buckets.reduce((sum, b) => sum + b.amount, 0);
    return { from: fromIso, to: toIso, days: spanDays, total, buckets };
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
    const paid: OrderStatus[] = ['paid', 'completed', 'exchanged'];
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
    const paid: OrderStatus[] = ['paid', 'completed', 'exchanged'];
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
      ]);
    const soldWithoutOrderImeis = soldWithoutOrder.map((u) => u.imei);

    // A paid line priced under its product cost is a margin leak; keep the worst per SKU.
    const costBySku = new Map(productCosts.map((p) => [p.sku, p]));
    const leakBySku = new Map<string, MarginLeak>();
    for (const it of paidItems) {
      const p = costBySku.get(it.sku);
      if (!p || it.price >= p.cost) continue;
      const prev = leakBySku.get(it.sku);
      if (!prev || it.price < prev.price) {
        leakBySku.set(it.sku, { sku: it.sku, name: p.name, price: it.price, cost: p.cost });
      }
    }
    const marginLeaks = [...leakBySku.values()].slice(0, 10);

    const signals = buildRiskSignals(
      { cashDiscrepancies, codOutstanding, staleReservations, pendingApprovals, warrantyOverdue, rmaOverdue, debtsOverdue, ticketsOverdue, marginLeaks, soldWithoutOrderImeis },
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
