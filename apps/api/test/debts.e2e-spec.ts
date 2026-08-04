import { DebtPlan } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { DebtsService, DEBT_LIMIT } from '../src/debts/debts.service';
import { ReportsService } from '../src/reports/reports.service';
import { SettingsService } from '../src/settings/settings.service';
import { ConflictError, ValidationError } from '../src/common/errors';
import { OutboxService } from '../src/outbox/outbox.service';
import { LogNotificationTransport } from '../src/outbox/transports/log.transport';

/**
 * Debt / installment sales (Phase 9): book a sale on credit, gate debts over the
 * limit through approval, reduce the balance with payments until settled, and flag
 * overdue open debts in the Risk Center.
 */
describe('Debts (integration)', () => {
  let prisma: PrismaService;
  let debts: DebtsService;
  let approvals: ApprovalsService;
  let reports: ReportsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    const outbox = new OutboxService(prisma, new LogNotificationTransport());
    debts = new DebtsService(prisma, audit, approvals, outbox, new SettingsService(prisma, audit));
    reports = new ReportsService(prisma, new SettingsService(prisma, new AuditService(prisma)));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({ where: { entry: { sourceType: { startsWith: 'debt.' } } } }),
      prisma.accountingJournalEntry.deleteMany({ where: { sourceType: { startsWith: 'debt.' } } }),
    ]);
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.approval.deleteMany();
    // Наличное погашение теперь требует открытой смены — иначе деньги попадают
    // в ящик, о котором система не знает. Тесты ниже проверяют арифметику
    // баланса, а не кассовую политику, поэтому смена у актора просто есть.
    await prisma.cashShift.create({
      data: { staffId: 'cashier', point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
  });

  async function order(consent = true) {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967005${seq.toString().padStart(4, '0')}`, name: 'D', consent },
    });
    const o = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total: 100000, status: 'paid' },
    });
    return { customer, orderId: o.id };
  }

  it('books a debt within the limit and starts balance at principal', async () => {
    const { orderId } = await order();
    const debt = await debts.create({ orderId, principal: 30000, installments: 3 }, 'seller') as DebtPlan;
    expect(debt).toMatchObject({ principal: 30000, balance: 30000, status: 'open', installments: 3 });
    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: debt.accountingEntryId as string },
      include: { lines: true },
    });
    expect(entry).toMatchObject({ sourceType: 'debt.origination', sourceRef: debt.id, documentAmount: 30000, taxAmount: 0 });
    expect(entry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 30000, credit: 0 }),
      expect.objectContaining({ accountCode: '4000', debit: 0, credit: 30000 }),
    ]));
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['debt.created', 'accounting.entry_posted']));
  });

  it('recognizes only the unpaid taxable balance after a prepayment', async () => {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967035${seq.toString().padStart(4, '0')}`, name: 'Tax debt' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        total: 11200,
        taxBaseAmount: 10000,
        taxAmount: 1200,
        status: 'paid',
        items: { create: { lineNumber: 1, sku: `DEBT-TAX-${seq}`, qty: 1, price: 11200, taxCode: 'vat_standard', taxRateBps: 1200, taxBaseAmount: 10000, taxAmount: 1200 } },
        payments: { create: { amount: 5600, method: 'card', status: 'received' } },
      },
    });

    const debt = await debts.create({ orderId: order.id, principal: 5600, idempotencyKey: `debt-tax-${seq}` }, 'seller') as DebtPlan;
    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: debt.accountingEntryId as string },
      include: { lines: true },
    });
    expect(entry).toMatchObject({ documentAmount: 5600, taxAmount: 600, taxCode: 'vat_output:vat_standard', taxRateBps: 1200 });
    expect(entry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 5600 }),
      expect.objectContaining({ accountCode: '4000', credit: 5000 }),
      expect.objectContaining({ accountCode: '2200', credit: 600 }),
    ]));
  });

  it('rejects a debt above the server-derived unpaid order balance', async () => {
    const { orderId } = await order();
    await prisma.payment.create({ data: { orderId, amount: 80000, method: 'card', status: 'received' } });
    await expect(debts.create({ orderId, principal: 30000 }, 'seller')).rejects.toMatchObject({
      code: 'debt_principal_exceeds_outstanding',
    });
    expect(await prisma.debtPlan.count()).toBe(0);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'debt.origination' } })).toBe(0);
  });

  it('replays debt creation with the same stable idempotency key', async () => {
    const { orderId } = await order();
    const input = { orderId, principal: 12000, installments: 2, idempotencyKey: `debt-replay-${seq}` };
    const first = await debts.create(input, 'seller') as DebtPlan;
    const replay = await debts.create(input, 'seller') as DebtPlan;

    expect(replay.id).toBe(first.id);
    expect(await prisma.debtPlan.count({ where: { orderId } })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'debt.origination', sourceRef: first.id } })).toBe(1);
  });

  it('reduces the balance on payment and settles at zero', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 20000 }, 'seller')) as DebtPlan;

    const partial = await debts.pay(debt.id, { amount: 12000 }, 'cashier');
    expect(partial.debt.balance).toBe(8000);
    expect(partial.settled).toBe(false);

    const final = await debts.pay(debt.id, { amount: 8000 }, 'cashier');
    expect(final.debt.balance).toBe(0);
    expect(final.settled).toBe(true);
    expect(final.debt.status).toBe('settled');

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['debt.payment', 'debt.settled']));
    // Раньше здесь ожидалось `method: 'installment'` — значение описывало
    // назначение платежа, а не то, чем он внесён. Из-за этого наличное
    // погашение не попадало в кассовую смену (`expectedCash` фильтрует
    // `method: 'cash'`), а `paymentAccountCode('installment')` уводило деньги
    // на счёт 1020 «средства у провайдеров», хотя они лежали в ящике.
    // Назначение платежа не потеряно: оно в `sourceType: 'debt.payment'`
    // проводки и в связи с планом рассрочки.
    const payments = await prisma.payment.findMany({ where: { orderId, method: 'cash' } });
    expect(payments).toHaveLength(2);
  });

  it('does not double-charge when a debt payment is retried with the same idempotency key', async () => {
    // Дедуп погашения (`debt:${idempotencyKey}`) существует в debts.service, но
    // не проверялся ни одним тестом. Регрессия здесь означала бы: сетевой
    // ретрай кассира создаёт ВТОРОЙ Payment и списывает баланс дважды — клиент
    // платит вдвое. Тест это фиксирует.
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 20000 }, 'seller')) as DebtPlan;
    const key = `debt-pay-idem-${seq}`;

    const first = await debts.pay(debt.id, { amount: 12000, idempotencyKey: key }, 'cashier');
    expect(first.debt.balance).toBe(8000);
    expect(first.idempotent).toBeFalsy();

    // Тот же ключ, та же сумма — ретрай. Баланс не должен списаться второй раз.
    const replay = await debts.pay(debt.id, { amount: 12000, idempotencyKey: key }, 'cashier');
    expect(replay.idempotent).toBe(true);
    expect(replay.paymentId).toBe(first.paymentId);
    expect(replay.debt.balance).toBe(8000);

    // Ровно один платёж и одно списание в БД.
    const payments = await prisma.payment.findMany({ where: { orderId } });
    expect(payments).toHaveLength(1);
    const fresh = await prisma.debtPlan.findUniqueOrThrow({ where: { id: debt.id } });
    expect(fresh.balance).toBe(8000);
  });

  it('rejects a debt payment reusing an idempotency key with a different amount', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 20000 }, 'seller')) as DebtPlan;
    const key = `debt-pay-conflict-${seq}`;
    await debts.pay(debt.id, { amount: 5000, idempotencyKey: key }, 'cashier');
    const err = await debts.pay(debt.id, { amount: 7000, idempotencyKey: key }, 'cashier').catch((e) => e);
    expect(err).toMatchObject({ code: 'debt_payment_idempotency_conflict' });
  });

  it('rejects a payment over the remaining balance', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 5000 }, 'seller')) as DebtPlan;
    const err = await debts.pay(debt.id, { amount: 6000 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('invalid_debt_payment');
  });

  it('is race-safe: concurrent payments never lose an update', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 30000, installments: 2 }, 'seller')) as DebtPlan;
    // Two 15000 payments fired together must both land → balance 0, not 15000 (lost update).
    const results = await Promise.allSettled([
      debts.pay(debt.id, { amount: 15000 }, 'cashier'),
      debts.pay(debt.id, { amount: 15000 }, 'cashier'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(2);
    const after = await prisma.debtPlan.findUniqueOrThrow({ where: { id: debt.id } });
    expect(after.balance).toBe(0);
    expect(after.status).toBe('settled');
  });

  it('is race-safe: concurrent over-payments cannot over-decrement', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 30000 }, 'seller')) as DebtPlan;
    // Two 20000 payments together: only one fits (20000 ≤ 30000); the second must be rejected.
    const results = await Promise.allSettled([
      debts.pay(debt.id, { amount: 20000 }, 'cashier'),
      debts.pay(debt.id, { amount: 20000 }, 'cashier'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    const after = await prisma.debtPlan.findUniqueOrThrow({ where: { id: debt.id } });
    expect(after.balance).toBe(10000);
  });

  it('rejects paying a settled debt', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 4000 }, 'seller')) as DebtPlan;
    await debts.pay(debt.id, { amount: 4000 }, 'cashier');
    const err = await debts.pay(debt.id, { amount: 1 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('debt_not_open');
  });

  it('parks a debt over the limit for approval and books it only once approved', async () => {
    const { orderId } = await order();
    const parked = (await debts.create(
      { orderId, principal: DEBT_LIMIT + 25000, actor: 'seller' },
      'seller',
    )) as { approvalId: string; status: string };
    expect(parked.status).toBe('requested');
    expect(await prisma.debtPlan.count()).toBe(0); // not booked yet

    await approvals.decide(parked.approvalId, { status: 'approved', approver: 'owner', approverRole: 'owner' });
    const booked = await prisma.debtPlan.findMany();
    expect(booked).toHaveLength(1);
    expect(booked[0].principal).toBe(DEBT_LIMIT + 25000);
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['approval.approved', 'debt.created']));
  });

  it('surfaces an overdue open debt in the Risk Center', async () => {
    const { orderId, customer } = await order();
    await prisma.debtPlan.create({
      data: {
        orderId,
        customerId: customer.id,
        principal: 10000,
        balance: 10000,
        installments: 1,
        dueDate: new Date(Date.now() - 60_000),
        status: 'open',
      },
    });
    const r = await reports.risks();
    expect(r.signals.map((s) => s.kind)).toContain('debt_overdue');
  });

  it('queues due-soon and overdue reminders through outbox idempotently', async () => {
    const now = new Date('2026-07-07T08:00:00.000Z');
    const dueSoon = await order();
    const overdue = await order();
    const future = await order();
    const settled = await order();

    await prisma.debtPlan.createMany({
      data: [
        {
          orderId: dueSoon.orderId,
          customerId: dueSoon.customer.id,
          principal: 10000,
          balance: 7000,
          installments: 1,
          dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
          status: 'open',
        },
        {
          orderId: overdue.orderId,
          customerId: overdue.customer.id,
          principal: 15000,
          balance: 15000,
          installments: 1,
          dueDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          status: 'open',
        },
        {
          orderId: future.orderId,
          customerId: future.customer.id,
          principal: 20000,
          balance: 20000,
          installments: 1,
          dueDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
          status: 'open',
        },
        {
          orderId: settled.orderId,
          customerId: settled.customer.id,
          principal: 30000,
          balance: 0,
          installments: 1,
          dueDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          status: 'settled',
        },
      ],
    });

    expect(await debts.enqueueReminders({ now, dueSoonDays: 3 })).toEqual({ considered: 2, queued: 2 });
    expect(await debts.enqueueReminders({ now, dueSoonDays: 3 })).toEqual({ considered: 2, queued: 0 });

    const outbox = await prisma.outboxMessage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(outbox.map((message) => message.template).sort()).toEqual(['debt_due_soon', 'debt_overdue']);
    expect(outbox.every((message) => message.channel === 'sms' && message.status === 'pending')).toBe(true);

    const events = await prisma.auditEvent.findMany({ where: { type: 'debt.reminder_queued' } });
    expect(events).toHaveLength(2);
    expect(events.flatMap((event) => event.refs)).toEqual(
      expect.arrayContaining(['debt_due_soon', 'debt_overdue']),
    );
  });

  it('does not queue debt reminders for opted-out customers', async () => {
    const now = new Date('2026-07-07T08:00:00.000Z');
    const optedOut = await order(false);
    await prisma.debtPlan.create({
      data: {
        orderId: optedOut.orderId,
        customerId: optedOut.customer.id,
        principal: 10000,
        balance: 7000,
        installments: 1,
        dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        status: 'open',
      },
    });

    expect(await debts.enqueueReminders({ now, dueSoonDays: 3 })).toEqual({ considered: 1, queued: 0 });
    expect(await prisma.outboxMessage.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { type: 'debt.reminder_queued' } })).toBe(0);
  });

  /**
   * Наличное погашение долга обязано входить в ожидаемый остаток смены.
   *
   * `pay()` создавал платёж с `method: 'installment'`, `accountCode: '1000'`
   * («Наличные в кассе») и проводкой `Дт 1000` — но без `shiftId` и без
   * `point`. `ShiftsService.expectedCash` считает сумму по
   * `{ shiftId, method: 'cash' }`, поэтому эти деньги в ожидаемом остатке не
   * появлялись никогда.
   *
   * Практический смысл: клиент приносит 20 000 сом по рассрочке, кассир кладёт
   * их в ящик. Вечером в ящике на 20 000 больше ожидаемого — излишек, который
   * при самозакрытии система же и объяснит. За смену с несколькими погашениями
   * расхождение становится неразбираемым.
   *
   * Метод оплаты при этом был захардкожен: погашение картой всё равно ложилось
   * на счёт наличных.
   */
  it('наличное погашение попадает в ожидаемый остаток смены', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 20000 }, 'seller')) as DebtPlan;
    const shift = await prisma.cashShift.create({
      data: { staffId: 'cashier-debt-1', point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });

    await debts.pay(debt.id, { amount: 20000, method: 'cash' }, 'cashier-debt-1');

    const drawer = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { shiftId: shift.id, method: 'cash' },
    });
    expect(drawer._sum.amount).toBe(20000);
  });

  it('безналичное погашение в кассовый ящик не попадает', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 20000 }, 'seller')) as DebtPlan;
    const shift = await prisma.cashShift.create({
      data: { staffId: 'cashier-debt-2', point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });

    await debts.pay(debt.id, { amount: 20000, method: 'card' }, 'cashier-debt-2');

    const drawer = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { shiftId: shift.id, method: 'cash' },
    });
    expect(drawer._sum.amount ?? 0).toBe(0);
    const card = await prisma.payment.findFirst({ where: { method: 'card' }, select: { accountCode: true } });
    expect(card?.accountCode).toBe('1020');
  });
});
