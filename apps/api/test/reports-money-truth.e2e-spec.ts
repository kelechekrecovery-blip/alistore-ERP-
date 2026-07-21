import { AuditService } from '../src/audit/audit.service';
import { postAccountingEntryOnTx } from '../src/finance/accounting-journal';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsService } from '../src/reports/reports.service';
import { SettingsService } from '../src/settings/settings.service';

/**
 * Одна выручка — один ответ.
 *
 * Дашборд, KPI и P&L считали её тремя способами, и разрывы измерялись сотнями
 * тысяч сомов на одном месяце. Владелец видел на одном экране оборот, на
 * соседнем — убыточную маржу, и не мог понять, какому верить.
 *
 * Тесты ниже фиксируют не «формулу», а совпадение того, что видит человек:
 * COD-продажа существует для всех экранов одинаково, исправленная ошибка
 * исчезает отовсюду, прибыль учитывает себестоимость, разбивка не превышает
 * заголовок, и два экрана зарплаты не спорят.
 */
describe('Отчёты · одна правда о деньгах', () => {
  let prisma: PrismaService;
  let reports: ReportsService;
  let seq = 0;
  // Прогоны делят одну тестовую БД: без метки прогона `staffUser` от прошлого
  // раза ловит unique-конфликт по username.
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    reports = new ReportsService(prisma, new SettingsService(prisma, new AuditService(prisma)));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.$transaction(async (tx) => {
      // Только свои проводки. Сплошное `deleteMany()` роняло чужие спеки: на
      // журнал ссылаются CashIncassation и CashDrawerMovement, и тест, стирающий
      // общий леджер, ловит не дефект продукта, а сам себя.
      const mine = { sourceType: { in: ['cod.receivable', 'accounting.reversal'] } };
      await tx.accountingJournalLine.deleteMany({ where: { entry: mine } });
      await tx.accountingJournalEntry.deleteMany({ where: mine });
    });
    await prisma.customer.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: 'seller-payroll-' } } });
  });

  /** Два одинаковых телефона: один продан картой, второй доставлен курьером. */
  async function twoPhonesOneCardOneCod() {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99670091${seq.toString().padStart(4, '0')}`, name: 'Money truth' },
    });
    const product = await prisma.product.create({
      data: { sku: `MT-${seq}`, name: 'iPhone', price: 100_000, cost: 80_000, category: 'phones', attrs: {} },
    });
    // Обе единицы проданы — так их видит расчёт себестоимости.
    await prisma.deviceUnit.createMany({
      data: [
        { imei: `MT-${seq}-A`, productId: product.id, status: 'sold', location: 'BISHKEK-1' },
        { imei: `MT-${seq}-B`, productId: product.id, status: 'sold', location: 'BISHKEK-1' },
      ],
    });
    const cardOrder = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', status: 'paid', total: 100_000 },
    });
    await prisma.payment.create({
      data: { orderId: cardOrder.id, amount: 100_000, method: 'card', status: 'received' },
    });
    // COD не создаёт Payment: курьер признаёт дебиторку проводкой.
    const codOrder = await prisma.order.create({
      data: {
        customerId: customer.id, channel: 'web', status: 'delivered',
        fulfillmentType: 'courier', paymentMode: 'cod', total: 100_000,
      },
    });
    await prisma.$transaction(async (tx) => {
      await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:cod.receivable:${codOrder.id}`,
        sourceType: 'cod.receivable',
        sourceRef: codOrder.id,
        description: `Признание COD ${codOrder.id}`,
        documentAmount: 100_000,
        baseAmount: 100_000,
        occurredAt: new Date(),
        createdBy: 'courier-1',
        lines: [
          { accountCode: '1100', debit: 100_000, credit: 0, memo: 'Дебиторка COD' },
          { accountCode: '4000', debit: 0, credit: 100_000, memo: 'Выручка COD' },
        ],
      });
    });
    return { customer, product, codOrder };
  }

  /**
   * KPI брал выручку только из `Payment`, а себестоимость — по всем проданным
   * юнитам. COD-продажа помечает юнит `sold`, но платежа не создаёт, поэтому
   * маржа уходила в минус на совершенно здоровых данных.
   */
  it('KPI считает выручку и себестоимость по одному множеству продаж', async () => {
    await twoPhonesOneCardOneCod();

    const kpi = await reports.kpi();

    expect(kpi.revenue).toBe(200_000);
    expect(kpi.cogs).toBe(160_000);
    expect(kpi.grossMargin).toBe(40_000);
    expect(kpi.marginPct).toBeGreaterThan(0);
  });

  /**
   * Сторно — единственный штатный способ исправить ошибку курьера. Дашборд
   * выбирал проводки по `sourceType: 'cod.receivable'` и не исключал
   * сторнированные, поэтому исправление ошибки портило отчёт навсегда.
   */
  it('сторнированная COD-проводка исчезает из выручки дашборда', async () => {
    const { codOrder } = await twoPhonesOneCardOneCod();
    const before = await reports.dashboard();
    expect(before.money.salesGross).toBe(200_000);

    const original = await prisma.accountingJournalEntry.findFirstOrThrow({
      where: { sourceType: 'cod.receivable', sourceRef: codOrder.id },
      include: { lines: true },
    });
    await prisma.$transaction(async (tx) => {
      const reversal = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:reversal:${original.id}:test`,
        sourceType: 'accounting.reversal',
        sourceRef: `${original.id}:test`,
        description: `Сторно ${original.id}`,
        occurredAt: new Date(),
        createdBy: 'owner-1',
        lines: original.lines.map((line) => ({
          accountCode: line.accountCode,
          debit: line.credit,
          credit: line.debit,
          memo: 'Сторно',
        })),
      });
      await tx.accountingJournalEntry.update({
        where: { id: reversal.id },
        data: { reversalOfId: original.id },
      });
    });

    const after = await reports.dashboard();
    expect(after.money.salesGross).toBe(100_000);
  });

  /**
   * `operatingProfit` читается владельцем как прибыль, а вычитал только
   * операционные расходы: себестоимость проданного в него не входила вовсе.
   */
  it('операционная прибыль вычитает себестоимость проданного', async () => {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99670092${seq.toString().padStart(4, '0')}`, name: 'Profit' },
    });
    const product = await prisma.product.create({
      data: { sku: `PR-${seq}`, name: 'x', price: 100_000, cost: 80_000, category: 'c', attrs: {} },
    });
    await prisma.deviceUnit.create({
      data: { imei: `PR-${seq}-A`, productId: product.id, status: 'sold', location: 'BISHKEK-1' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', status: 'paid', total: 100_000 },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 100_000, method: 'card', status: 'received' },
    });
    await prisma.expense.create({
      data: {
        idempotencyKey: `expense-profit-${seq}`,
        category: 'rent',
        description: 'Аренда точки',
        amount: 10_000,
        documentAmount: 10_000,
        taxBaseAmount: 10_000,
        requestedBy: 'owner-1',
        status: 'paid',
      },
    });

    const dashboard = await reports.dashboard();

    // 100 000 выручки − 80 000 себестоимости − 10 000 аренды.
    expect(dashboard.money.operatingProfit).toBe(10_000);
  });

  /**
   * `salesGross` фильтрует статус платежа, `byMethod` — нет. Припаркованный
   * `pending`-платёж делал сумму столбиков больше заголовка, и объяснить это по
   * интерфейсу было нечем.
   */
  it('разбивка по методам не превышает заголовок продаж', async () => {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99670093${seq.toString().padStart(4, '0')}`, name: 'ByMethod' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', status: 'paid', total: 100_000 },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 100_000, method: 'card', status: 'received' },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 50_000, method: 'card', status: 'pending' },
    });

    const dashboard = await reports.dashboard();
    const byMethodTotal = dashboard.money.byMethod.reduce((sum, row) => sum + row.amount, 0);

    expect(byMethodTotal).toBe(dashboard.money.salesGross);
  });

  /**
   * Два экрана зарплаты расходились в десять раз.
   *
   * `/reports/payroll` выбирал платежи по `shiftId: { not: null }` и относил их
   * на владельца смены. `shiftId` пишется только для наличных, поэтому продавец
   * с оборотом 1 000 000 (900 000 картой) видел там выручку 100 000, а на
   * экране HR — 1 000 000. Спор о зарплате в первую же неделю.
   */
  it('оба экрана зарплаты дают продавцу одну выручку', async () => {
    seq += 1;
    const seller = await prisma.staffUser.create({
      data: {
        username: `seller-payroll-${run}-${seq}`,
        passwordHash: 'x',
        role: 'seller',
        point: 'BISHKEK-1',
      },
    });
    const customer = await prisma.customer.create({
      data: { phone: `+99670094${seq.toString().padStart(4, '0')}`, name: 'Payroll' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', status: 'paid', total: 1_000_000 },
    });
    // Карта: смены нет вовсе — раньше платёж в расчёт не попадал.
    await prisma.payment.create({
      data: {
        orderId: order.id, amount: 900_000, method: 'card', status: 'received',
        point: 'BISHKEK-1', receivedBy: seller.id,
      },
    });
    const shift = await prisma.cashShift.create({
      data: { staffId: `cashier-payroll-${seq}`, point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id, amount: 100_000, method: 'cash', status: 'received',
        shiftId: shift.id, point: 'BISHKEK-1', receivedBy: seller.id,
      },
    });

    const payroll = await reports.payroll();
    const row = payroll.rows.find((entry: { staffId: string }) => entry.staffId === seller.id);

    expect(row?.revenue).toBe(1_000_000);
    // Кассир смены не продавал ничего.
    expect(payroll.rows.find((entry: { staffId: string }) => entry.staffId === shift.staffId)).toBeUndefined();

  });
});
