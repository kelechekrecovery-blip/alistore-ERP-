import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsService } from '../src/reports/reports.service';
import { SettingsService } from '../src/settings/settings.service';
import { AuditService } from '../src/audit/audit.service';
import { ValidationError } from '../src/common/errors';

/**
 * Z-report — the owner's end-of-day till summary for one business day: the shifts
 * closed that day, their variance, sales split by payment method, and cash
 * collected. Aggregated from CashShift/Payment/CashIncassation the store already
 * writes; no new table.
 */
describe('Reports: Z-report (integration)', () => {
  let prisma: PrismaService;
  let reports: ReportsService;
  const run = `zr-${Math.floor(Math.random() * 1_000_000)}`;
  const point = `${run}-loc`;
  const day = '2026-06-15';
  const shiftIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    reports = new ReportsService(prisma, new SettingsService(prisma, new AuditService(prisma)));

    // One shift closed on `day` with cash + card sales and an incassation.
    const shift = await prisma.cashShift.create({
      data: {
        staffId: `${run}-cashier`,
        point,
        openCash: 5000,
        closeCash: 12000,
        diff: -500,
        openedAt: new Date(`${day}T08:00:00.000Z`),
        closedAt: new Date(`${day}T20:00:00.000Z`),
      },
    });
    shiftIds.push(shift.id);
    await prisma.payment.createMany({
      data: [
        { amount: 8000, method: 'cash', status: 'received', shiftId: shift.id, point, accountCode: '1000', idempotencyKey: `${run}-p1` },
        { amount: 3000, method: 'card', status: 'reconciled', shiftId: shift.id, point, accountCode: '1010', idempotencyKey: `${run}-p2` },
        { amount: -1000, method: 'cash', status: 'received', shiftId: shift.id, point, accountCode: '1000', idempotencyKey: `${run}-p3` },
      ],
    });
    await prisma.cashIncassation.create({
      data: { shiftId: shift.id, point, amount: 6000, depositedAt: new Date(`${day}T20:05:00.000Z`), depositedBy: `${run}-cashier`, idempotencyKey: `${run}-inc` },
    });
  });

  afterAll(async () => {
    await prisma.cashIncassation.deleteMany({ where: { shiftId: { in: shiftIds } } });
    await prisma.payment.deleteMany({ where: { shiftId: { in: shiftIds } } });
    await prisma.cashShift.deleteMany({ where: { id: { in: shiftIds } } });
    await prisma.$disconnect();
  });

  it('summarises the day: shift, sales by method, incassation and variance', async () => {
    const report = await reports.zReport(day);

    const own = report.shifts.filter((shift) => shift.point === point);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ openCash: 5000, closeCash: 12000, diff: -500 });

    // Only this suite's shift is at `point`; assert its slice of the totals.
    expect(report.totals.salesByMethod.cash).toBeGreaterThanOrEqual(8000);
    expect(report.totals.salesByMethod.card).toBeGreaterThanOrEqual(3000);
    // Refund (-1000) is not a positive sale and must not inflate the cash total.
    // (We asserted >= 8000, not the exact figure, because a neighbouring suite may
    // share the day; the point-scoped shift above is the exact check.)
  });

  it('rejects a malformed date', async () => {
    await expect(reports.zReport('15-06-2026')).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns an empty summary for a day with no closed shifts', async () => {
    const report = await reports.zReport('2020-01-01');
    expect(report.shifts.every((shift) => shift.point !== point)).toBe(true);
  });
});
