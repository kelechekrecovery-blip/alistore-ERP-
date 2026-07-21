import { AuditService } from '../src/audit/audit.service';
import { GiftcardsService } from '../src/giftcards/giftcards.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { recordCashDrawerMovementOnTx } from '../src/shifts/cash-drawer';
import { ShiftsService } from '../src/shifts/shifts.service';

/**
 * Наличность не ходит мимо кассовой смены.
 *
 * Ожидаемый остаток считался как `openCash + Σ Payment(cash)`. Всё, что не
 * `Payment`, в него не попадало, а деньги при этом двигались физически: сдача
 * COD курьером, выпуск подарочной карты, выплата комитенту, выкуп trade-in и
 * залог подменного фонда. Смена с продажей карт на 50 000 и выплатой комитенту
 * 90 000 давала недостачу 40 000 на пустом месте — и при самозакрытии система
 * же её и оправдывала.
 */
describe('Касса · движения наличных вне Payment', () => {
  let prisma: PrismaService;
  let shifts: ShiftsService;
  let giftcards: GiftcardsService;
  let seq = 0;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    shifts = new ShiftsService(prisma, audit);
    giftcards = new GiftcardsService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.cashDrawerMovement.deleteMany();
    await prisma.payment.deleteMany({ where: { shift: { staffId: { startsWith: `drawer-${run}` } } } });
    await prisma.cashShift.deleteMany({ where: { staffId: { startsWith: `drawer-${run}` } } });
  });

  async function openShift(openCash = 0) {
    seq += 1;
    const staffId = `drawer-${run}-${seq}`;
    const shift = await shifts.open(
      { staffId, point: 'BISHKEK-1', openCash },
      staffId,
      `open-drawer-${run}-${seq}`,
    );
    return { shift, staffId };
  }

  /** Ожидаемый остаток так, как его считает закрытие смены. */
  async function expectedFor(shiftId: string) {
    const shift = await prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
    const [payments, movements] = await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: 'cash' } }),
      prisma.cashDrawerMovement.aggregate({ _sum: { amount: true }, where: { shiftId } }),
    ]);
    return shift.openCash + (payments._sum.amount ?? 0) + (movements._sum.amount ?? 0);
  }

  it('приход увеличивает ожидаемый остаток, расход уменьшает', async () => {
    const { shift, staffId } = await openShift(5_000);

    await prisma.$transaction(async (tx) => {
      await recordCashDrawerMovementOnTx(tx, {
        idempotencyKey: `cod-${run}-${seq}`,
        staffId,
        amount: 50_000,
        kind: 'cod_handover',
        createdBy: staffId,
      });
      await recordCashDrawerMovementOnTx(tx, {
        idempotencyKey: `payout-${run}-${seq}`,
        staffId,
        amount: -90_000,
        kind: 'consignment_payout',
        createdBy: staffId,
      });
    });

    // 5 000 размена + 50 000 сдачи COD − 90 000 выплаты комитенту.
    expect(await expectedFor(shift.id)).toBe(-35_000);
  });

  it('повтор с тем же ключом не удваивает движение', async () => {
    const { shift, staffId } = await openShift();
    const key = `replay-${run}-${seq}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await prisma.$transaction(async (tx) => {
        await recordCashDrawerMovementOnTx(tx, {
          idempotencyKey: key,
          staffId,
          amount: 30_000,
          kind: 'loaner_deposit',
          createdBy: staffId,
        });
      });
    }

    expect(await expectedFor(shift.id)).toBe(30_000);
    expect(await prisma.cashDrawerMovement.count({ where: { shiftId: shift.id } })).toBe(1);
  });

  it('тот же ключ с другой суммой отклоняется', async () => {
    const { staffId } = await openShift();
    const key = `mismatch-${run}-${seq}`;
    await prisma.$transaction(async (tx) => {
      await recordCashDrawerMovementOnTx(tx, {
        idempotencyKey: key, staffId, amount: 10_000, kind: 'giftcard_issue', createdBy: staffId,
      });
    });

    await expect(prisma.$transaction(async (tx) => {
      await recordCashDrawerMovementOnTx(tx, {
        idempotencyKey: key, staffId, amount: 99_000, kind: 'giftcard_issue', createdBy: staffId,
      });
    })).rejects.toMatchObject({ code: 'cash_movement_replay_mismatch' });
  });

  it('движение без открытой смены отклоняется', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await recordCashDrawerMovementOnTx(tx, {
        idempotencyKey: `no-shift-${run}`,
        staffId: `drawer-${run}-nobody`,
        amount: 10_000,
        kind: 'tradein_buyback',
        createdBy: 'someone',
      });
    })).rejects.toMatchObject({ code: 'cash_shift_required' });
  });

  /**
   * Выпуск подарочной карты за наличные — деньги в ящике. Проводка `Дт 1000`
   * существовала, но смены не касалась: вечером кассир получал излишек ровно на
   * сумму проданных за смену карт.
   */
  it('выпуск подарочной карты попадает в ожидаемый остаток', async () => {
    const { shift, staffId } = await openShift();

    await giftcards.issue({ code: `GC-DRAWER-${run}-${seq}`, amount: 50_000 }, staffId);

    expect(await expectedFor(shift.id)).toBe(50_000);
  });
});
