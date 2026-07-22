import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { COGS_ACCOUNT } from '../inventory/inventory-valuation';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildRiskSignals,
  computeDiscountFrequency,
  computeMarginLeaks,
  computeRepeatReturns,
  computeWriteOffSpike,
} from './risk-signals';
import { buildKpi, SellerKpi, TOP_PRODUCTS_LIMIT, TopProduct } from './kpi';
import { buildPayroll } from './payroll';
import { sellerRevenueWhere } from './seller-revenue';
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
import { SettingsService } from '../settings/settings.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * COD revenue never becomes a `Payment`: the courier recognises it as a
   * receivable at delivery (Dr 1100 / Cr 4000, `cod.receivable`) and the later
   * handover only moves cash against that receivable. Reports that count
   * payments alone therefore miss the whole courier channel while
   * `/finance/statements` sees it — two revenue numbers that disagree.
   *
   * Store credit is deliberately NOT included here: `debt.origination` also
   * recognises revenue, but each repayment writes a real `Payment`
   * (`debts.service` → method `installment`), so adding it would double count.
   */
  /**
   * Сторнированные проводки исключаются: сторно пишется отдельной записью
   * (`accounting.reversal`) со ссылкой `reversalOfId`, а не правкой исходной.
   * Без этого фильтра единственный штатный способ исправить ошибку курьера
   * чинил P&L и **навсегда** оставлял ошибочную сумму в дашборде.
   */
  private static readonly COD_RECOGNISED_WHERE = {
    sourceType: 'cod.receivable',
    reversal: { is: null },
  } as const;

  private codRecognisedRevenue(from?: Date, to?: Date) {
    return this.prisma.accountingJournalEntry.findMany({
      where: {
        ...ReportsService.COD_RECOGNISED_WHERE,
        ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      },
      select: { documentAmount: true, occurredAt: true },
    });
  }

  /**
   * Себестоимость проданного. Один источник на все экраны: дашборд и KPI
   * считали её независимо (а дашборд не считал вовсе), из-за чего «операционная
   * прибыль» и «валовая маржа» на соседних экранах расходились на всю закупку.
   */
  /**
   * Выручка и число продаж по продавцам — сведением на стороне БД.
   *
   * Раньше `sellerRevenuePayments()` поднимал в память КАЖДЫЙ выручковый платёж
   * за всю историю магазина, и это делали сразу два экрана: KPI кокпита и
   * расчёт зарплат. На реальном обороте оба встали бы.
   *
   * Продавец определяется как в `soldBy`: сначала `receivedBy`, при его
   * отсутствии — сотрудник смены. Поэтому здесь две группировки: прямая и
   * через смену, а затем их надо сложить — один и тот же человек попадает в
   * обе, если часть платежей принял лично, а часть прошла по его смене.
   */
  private async sellerRevenueTotals(): Promise<SellerKpi[]> {
    const where = sellerRevenueWhere();
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

    const totals = new Map<string, { revenue: number; sales: number }>();
    const add = (staffId: string, revenue: number, sales: number) => {
      const cur = totals.get(staffId) ?? { revenue: 0, sales: 0 };
      totals.set(staffId, { revenue: cur.revenue + revenue, sales: cur.sales + sales });
    };

    for (const row of direct) {
      if (row.receivedBy) add(row.receivedBy, row._sum.amount ?? 0, row._count._all);
    }

    // Смены читаем только те, что реально встретились в группировке.
    const shiftIds = viaShift.map((row) => row.shiftId).filter((id): id is string => id !== null);
    if (shiftIds.length > 0) {
      const shifts = await this.prisma.cashShift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, staffId: true },
      });
      const staffByShift = new Map(shifts.map((shift) => [shift.id, shift.staffId]));
      for (const row of viaShift) {
        const staffId = row.shiftId ? staffByShift.get(row.shiftId) : undefined;
        if (staffId) add(staffId, row._sum.amount ?? 0, row._count._all);
      }
    }

    return [...totals.entries()].map(([staffId, value]) => ({ staffId, ...value }));
  }

  /**
   * Топ товаров по выручке — сведением на стороне БД.
   *
   * Выручка позиции это `price * qty`, а такое произведение Prisma в `groupBy`
   * посчитать не умеет. Поэтому цена входит в ключ группировки: внутри группы
   * она постоянна, и `_sum.qty * price` даёт точную выручку без сырого SQL.
   * Групп получается «SKU × различные цены», а не «все позиции всех заказов».
   *
   * Имена подтягиваются только для попавших в топ, а не для всего каталога.
   */
  private async topProductRows(): Promise<{ rows: Omit<TopProduct, 'name'>[]; names: Record<string, string> }> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['sku', 'price'],
      where: { order: { status: { in: REVENUE_STATUSES } } },
      _sum: { qty: true },
    });

    const byProduct = new Map<string, { units: number; revenue: number }>();
    for (const row of grouped) {
      const units = row._sum.qty ?? 0;
      const cur = byProduct.get(row.sku) ?? { units: 0, revenue: 0 };
      byProduct.set(row.sku, { units: cur.units + units, revenue: cur.revenue + units * row.price });
    }

    const rows = [...byProduct.entries()]
      .map(([sku, value]) => ({ sku, ...value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_PRODUCTS_LIMIT);

    const products = await this.prisma.product.findMany({
      where: { sku: { in: rows.map((row) => row.sku) } },
      select: { sku: true, name: true },
    });
    return { rows, names: Object.fromEntries(products.map((p) => [p.sku, p.name])) };
  }

  private async soldCogs(): Promise<number> {
    // Себестоимость берётся из журнала — счёт 5000, — а не из `Product.cost`.
    //
    // `Product.cost` это текущая каталожная настройка товара, а не то, во что
    // он обошёлся магазину: правка карточки задним числом меняла прибыль по
    // всем прошлым продажам. Схема про это прямо предупреждает над
    // `InventoryValuationLayer` («Product.cost is only the current catalog
    // default»), но отчёт всё равно читал её. Из-за этого дашборд и
    // /finance/statements показывали РАЗНУЮ прибыль по одной и той же базе.
    //
    // Четыре дефекта уходят разом: в 5000 попадает `acquisitionCost` вместе с
    // капитализированными расходами на доставку и растаможку (раньше они были
    // невидимы, и прибыль завышалась); консигнация проводки не делает и больше
    // не даёт фантомной себестоимости; количественные товары списываются по
    // слоям FIFO и перестают показывать 100% маржи; сторно возврата приходит
    // кредитом в тот же счёт и вычитается само.
    //
    // Фильтр по `reversal` здесь НЕ нужен, в отличие от выручки: сторно пишется
    // зеркальными строками в тот же счёт, поэтому в сумме дебет−кредит оно
    // гасится само. Именно так считает /finance/statements — совпадение двух
    // экранов теперь обеспечено конструкцией, а не совпадением формул.
    //
    // Период сознательно НЕ вводится: выручка на обоих экранах-потребителях
    // считается за всё время, и урезание одной лишь себестоимости сделало бы
    // маржу «период против всей истории» — ровно то расхождение, которое здесь
    // однажды уже чинили.
    const totals = await this.prisma.accountingJournalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: { accountCode: COGS_ACCOUNT },
    });
    return (totals._sum.debit ?? 0) - (totals._sum.credit ?? 0);
  }

  /** Journal rows shaped like payments so revenue bucketing can merge them. */
  private static asRevenueRows(
    entries: { documentAmount: number | null; occurredAt: Date }[],
  ): { amount: number; createdAt: Date }[] {
    return entries
      .filter((entry) => (entry.documentAmount ?? 0) > 0)
      .map((entry) => ({ amount: entry.documentAmount as number, createdAt: entry.occurredAt }));
  }

  /** Daily revenue buckets for the last N days (UTC-consistent). Powers the dashboard chart. */
  async revenue(days = 7): Promise<{ day: string; amount: number }[]> {
    const span = clampDays(days);
    const now = new Date();
    const startMs = revenueWindowStartMs(span, now);
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
    return buildRevenueBuckets([...payments, ...ReportsService.asRevenueRows(cod)], span, now);
  }

  /** Period-over-period revenue trend: last N days vs the N days before them. */
  async revenueTrend(days = 7) {
    const span = clampDays(days);
    const now = new Date();
    const currentStart = new Date(revenueWindowStartMs(span, now));
    const prevStart = new Date(previousWindowStartMs(span, now));
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
    return buildRevenueTrend(
      (cur._sum.amount ?? 0) + (codCur._sum.documentAmount ?? 0),
      (prev._sum.amount ?? 0) + (codPrev._sum.documentAmount ?? 0),
    );
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
    const buckets = buildRangeBuckets([...payments, ...ReportsService.asRevenueRows(cod)], fromMs, toMs);
    const total = buckets.reduce((sum, b) => sum + b.amount, 0);
    const trend = buildRevenueTrend(
      total,
      (prevAgg._sum.amount ?? 0) + (prevCod._sum.documentAmount ?? 0),
    );
    return { from: fromIso, to: toIso, days: spanDays, total, buckets, trend };
  }

  /** Aggregated KPIs: money, orders, stock, ops, 7-day revenue. */
  async dashboard(staffId?: string) {
    const now = new Date();
    // Same UTC day boundary the revenue chart buckets on, so «сегодня» and the
    // chart's last bar always agree.
    const todayStart = new Date(revenueWindowStartMs(1, now));
    const [
      sales,
      refunds,
      expenses,
      ordersByStatus,
      unitsByStatus,
      byMethod,
      orderCount,
      openShifts,
      pendingApprovals,
      revenue7d,
      todaySales,
      todayOrders,
      openShiftRows,
      debtAggregate,
      overdueDebts,
      codAll,
      codToday,
    ] = await Promise.all([
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
        }),
        this.prisma.payment.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }),
        this.prisma.expense.aggregate({ _sum: { amount: true }, where: { status: 'paid' } }),
        this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.deviceUnit.groupBy({ by: ['status'], _count: { _all: true } }),
        // Статус фильтруется так же, как в salesGross. Без этого припаркованный
        // pending-платёж попадал в разбивку и не попадал в заголовок: сумма
        // столбиков превышала «продажи», и объяснить это было нечем.
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
        // Cash currently in drawers = opening float + cash taken, per open shift
        // (the same arithmetic ShiftsService.list uses for expectedCash).
        this.prisma.cashShift.findMany({
          where: {
            closedAt: null,
            ...(staffId ? { staffId: { not: staffId } } : {}),
          },
          select: {
            openCash: true,
            payments: { where: { method: 'cash' }, select: { amount: true } },
            // Та же арифметика, что в ShiftsService.expectedCash: без движений
            // «наличные в кассах» на дашборде расходились с актом закрытия.
            drawerMovements: { select: { amount: true } },
          },
        }),
        this.prisma.debtPlan.aggregate({ _sum: { balance: true }, where: { status: 'open' } }),
        this.prisma.debtPlan.count({ where: { status: 'open', dueDate: { lt: now } } }),
        this.prisma.accountingJournalEntry.aggregate({
          _sum: { documentAmount: true },
          where: ReportsService.COD_RECOGNISED_WHERE,
        }),
        this.prisma.accountingJournalEntry.aggregate({
          _sum: { documentAmount: true },
          where: { ...ReportsService.COD_RECOGNISED_WHERE, occurredAt: { gte: todayStart } },
        }),
      ]);

    // Payments + COD recognised at delivery (see codRecognisedRevenue) — without
    // the second term the courier channel is invisible here while it is present
    // in /finance/statements.
    const salesGross = (sales._sum.amount ?? 0) + (codAll._sum.documentAmount ?? 0);
    const refunded = Math.abs(refunds._sum.amount ?? 0);
    const operatingExpenses = expenses._sum.amount ?? 0;
    // Поле читается владельцем как прибыль, а вычитало только операционные
    // расходы: себестоимость проданного в него не входила вовсе, и «прибыль»
    // на дашборде отличалась от P&L на всю закупку.
    const cogs = await this.soldCogs();
    const cashInDrawers = openShiftRows.reduce(
      (sum, shift) => sum
        + shift.openCash
        + shift.payments.reduce((acc, p) => acc + p.amount, 0)
        + shift.drawerMovements.reduce((acc, m) => acc + m.amount, 0),
      0,
    );

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
      /** Today only (UTC day, matching the revenue chart's last bucket). */
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

  /** Owner KPIs: gross margin (revenue − COGS), average check, top products. */
  async kpi() {
    const paid = REVENUE_STATUSES;
    const [rev, codRevenue, cogs, paidOrders, top, sellerRows] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
      }),
      // Выручка бралась только из Payment, а себестоимость — по всем проданным
      // юнитам. COD-продажа помечает юнит `sold`, но Payment не создаёт, поэтому
      // на реальных данных маржа уходила в минус, а средний чек занижался вдвое:
      // два одинаковых телефона (закупка 80 000, цена 100 000), один картой и
      // один курьером, давали revenue 100 000 при cogs 160 000.
      this.prisma.accountingJournalEntry.aggregate({
        _sum: { documentAmount: true },
        where: ReportsService.COD_RECOGNISED_WHERE,
      }),
      this.soldCogs(),
      this.prisma.order.count({ where: { status: { in: paid } } }),
      this.topProductRows(),
      this.sellerRevenueTotals(),
    ]);
    const revenue = (rev._sum.amount ?? 0) + (codRevenue._sum.documentAmount ?? 0);
    return buildKpi({ revenue, cogs, paidOrders, productRows: top.rows, names: top.names, sellerRows });
  }

  /**
   * Seller payroll: base + commission on turnover, per seller (via shift.staffId).
   *
   * The comp model used to come from `DEFAULT_PAYROLL` here while HR read its own
   * `PAYROLL_CONFIG` constant — two hardcoded sources for the same numbers. Both
   * now read the Setting table, so the KPI screen and the HR payroll run cannot
   * quote different salaries.
   */
  async payroll() {
    // Та же сведённая выборка, что у KPI: раньше здесь поднимался в память весь
    // список выручковых платежей за всю историю магазина.
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
    return buildPayroll(sellers, { base, commissionPct: commissionBps / 100 });
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
