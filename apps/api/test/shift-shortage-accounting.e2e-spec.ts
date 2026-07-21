import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShiftsService } from '../src/shifts/shifts.service';

/**
 * Недостача кассы обязана попадать в бухгалтерию.
 *
 * У курьера она проводится (`courier.service.ts` — счёт 6990 «Финансовые
 * расхождения»), у кассы не проводилась вообще: `grep "'6990'"` давал два
 * попадания, оба курьерские. Закрытие смены писало событие в леджер и строку в
 * `CashShift`, но ни одной проводки.
 *
 * Практический смысл: смена ожидала 305 000, кассир пересчитал 295 000. Риск-
 * сигнал появляется, а `netProfit` в P&L завышен на 10 000 — навсегда. Владелец
 * видит прибыль, которой нет, и разницу не объяснит ни один отчёт.
 */
describe('Смена · недостача попадает в бухгалтерию', () => {
  let prisma: PrismaService;
  let shifts: ShiftsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    shifts = new ShiftsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.$transaction(async (tx) => {
      await tx.accountingJournalLine.deleteMany({
        where: { entry: { sourceType: 'shift.reconciliation' } },
      });
      await tx.accountingJournalEntry.deleteMany({ where: { sourceType: 'shift.reconciliation' } });
    });
  });

  async function openShift(openCash: number) {
    seq += 1;
    const staffId = `cashier-shortage-${seq}`;
    const shift = await shifts.open(
      { staffId, point: 'BISHKEK-1', openCash },
      staffId,
      `open-shortage-${seq}`,
    );
    return { shift, staffId };
  }

  it('проводит недостачу как Дт 6990 / Кт 1000', async () => {
    const { shift, staffId } = await openShift(5_000);
    await prisma.payment.create({
      data: { amount: 300_000, method: 'cash', status: 'received', shiftId: shift.id },
    });

    // Ожидается 305 000, в ящике 295 000.
    await shifts.close(
      shift.id,
      { closeCash: 295_000, reason: 'Пересчитано дважды' },
      staffId,
      `close-shortage-${seq}`,
      'cashier',
    );

    const entry = await prisma.accountingJournalEntry.findFirst({
      where: { sourceType: 'shift.reconciliation', sourceRef: shift.id },
      include: { lines: { orderBy: { accountCode: 'asc' } } },
    });

    expect(entry).not.toBeNull();
    expect(entry!.lines.find((line) => line.accountCode === '6990')?.debit).toBe(10_000);
    expect(entry!.lines.find((line) => line.accountCode === '1000')?.credit).toBe(10_000);
  });

  it('проводит излишек зеркально: Дт 1000 / Кт 6990', async () => {
    const { shift, staffId } = await openShift(5_000);
    await prisma.payment.create({
      data: { amount: 300_000, method: 'cash', status: 'received', shiftId: shift.id },
    });

    await shifts.close(
      shift.id,
      { closeCash: 312_000, reason: 'Найдены деньги за ящиком' },
      staffId,
      `close-surplus-${seq}`,
      'cashier',
    );

    const entry = await prisma.accountingJournalEntry.findFirstOrThrow({
      where: { sourceType: 'shift.reconciliation', sourceRef: shift.id },
      include: { lines: true },
    });
    expect(entry.lines.find((line) => line.accountCode === '1000')?.debit).toBe(7_000);
    expect(entry.lines.find((line) => line.accountCode === '6990')?.credit).toBe(7_000);
  });

  it('сошедшаяся касса проводки не создаёт', async () => {
    const { shift, staffId } = await openShift(5_000);
    await prisma.payment.create({
      data: { amount: 300_000, method: 'cash', status: 'received', shiftId: shift.id },
    });

    await shifts.close(shift.id, { closeCash: 305_000 }, staffId, `close-exact-${seq}`, 'cashier');

    expect(
      await prisma.accountingJournalEntry.count({
        where: { sourceType: 'shift.reconciliation', sourceRef: shift.id },
      }),
    ).toBe(0);
  });
});
