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

  /** Aggregated KPIs: money, orders, stock, ops. */
  async dashboard() {
    const [sales, refunds, ordersByStatus, unitsByStatus, byMethod, orderCount, openShifts, pendingApprovals] =
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
    };
  }

  /** Risk Center: discrepancies, outstanding COD, stale reservations, pending approvals. */
  async risks() {
    const now = new Date();
    const [cashDiscrepancies, codOutstanding, staleReservations, pendingApprovals] =
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
      ]);

    const signals = buildRiskSignals(
      { cashDiscrepancies, codOutstanding, staleReservations, pendingApprovals },
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
