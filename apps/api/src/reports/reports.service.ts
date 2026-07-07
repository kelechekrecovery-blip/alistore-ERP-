import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildRiskSignals } from './risk-signals';

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
  private async revenue7d(): Promise<{ day: string; amount: number }[]> {
    const days = 7;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    // start-of-today in UTC, then go back (days-1) so the window ends on today (inclusive)
    const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * dayMs;

    const payments = await this.prisma.payment.findMany({
      where: {
        amount: { gt: 0 },
        status: { in: ['received', 'reconciled'] },
        createdAt: { gte: new Date(startMs) },
      },
      select: { amount: true, createdAt: true },
    });

    const buckets: { day: string; amount: number }[] = [];
    for (let i = 0; i < days; i += 1) {
      buckets.push({ day: new Date(startMs + i * dayMs).toISOString().slice(0, 10), amount: 0 });
    }
    for (const p of payments) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) b.amount += p.amount;
    }
    return buckets;
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
        this.revenue7d(),
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

  /** Risk Center: discrepancies, outstanding COD, stale reservations, pending approvals. */
  async risks() {
    const now = new Date();
    const [cashDiscrepancies, codOutstanding, staleReservations, pendingApprovals, warrantyOverdue, rmaOverdue, debtsOverdue] =
      await Promise.all([
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
      ]);

    const signals = buildRiskSignals(
      { cashDiscrepancies, codOutstanding, staleReservations, pendingApprovals, warrantyOverdue, rmaOverdue, debtsOverdue },
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
