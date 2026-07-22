import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { CustomersService } from '../src/customers/customers.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PosService } from '../src/pos/pos.service';
import { ForbiddenError } from '../src/common/errors';

const RUN = `${process.pid}-${Date.now()}`;

/**
 * Одно одобрение скидки менеджером — одна продажа.
 *
 * У действия `discount` нет исполнителя в ACTION_EXECUTORS (в отличие от
 * refund/write_off/…), поэтому решение менеджера лишь ставит status='approved',
 * а списывает одобрение сама продажа. Раньше `assertDiscountApproved` только
 * проверяла статус и отпечаток, но не помечала одобрение израсходованным —
 * кассир мог проиграть один `approvalId` на неограниченное число продаж разным
 * покупателям. На количественных SKU (кабели, зарядки) это особенно опасно:
 * `costRef` пуст, отпечаток маржи стабилен, поэтому проверки проходили и во
 * второй раз. Для серийных устройств дыра самозакрывалась (у каждого IMEI свой
 * отпечаток), поэтому тест берёт именно количественный товар.
 */
describe('POS discount approval is single-use (money-loss guard)', () => {
  let prisma: PrismaService;
  let pos: PosService;
  let approvals: ApprovalsService;
  let shifts: ShiftsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    shifts = new ShiftsService(prisma, audit);
    pos = new PosService(
      prisma,
      new CustomersService(prisma, audit, new SettingsService(prisma, audit)),
      shifts,
      units,
      new OrdersService(prisma, audit, units),
      new PaymentsService(prisma, audit, units, approvals),
      approvals,
      new SettingsService(prisma, audit),
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const skus: string[] = [];

  async function cleanup() {
    if (skus.length === 0) return;
    const orderIds = (
      await prisma.order.findMany({ where: { items: { some: { sku: { in: skus } } } }, select: { id: true } })
    ).map((o) => o.id);
    await prisma.auditEvent.deleteMany({ where: { actor: { contains: RUN } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderQuantityAllocation.deleteMany({ where: { balance: { product: { sku: { in: skus } } } } });
    await prisma.reservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { sku: { in: skus } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); // before shifts (Order_posShiftId_fkey)
    await prisma.cashShift.deleteMany({ where: { staffId: { contains: RUN } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { product: { sku: { in: skus } } } });
    await prisma.inventoryMovement.deleteMany({ where: { product: { sku: { in: skus } } } });
    await prisma.inventoryBalance.deleteMany({ where: { product: { sku: { in: skus } } } });
    await prisma.approval.deleteMany({ where: { reason: { contains: RUN } } });
    await prisma.product.deleteMany({ where: { sku: { in: skus } } });
  }

  async function seedQuantityProduct(onHand: number) {
    seq += 1;
    const sku = `POSQ-${RUN}-${seq}`;
    skus.push(sku);
    const product = await prisma.product.create({
      // healthy margin (cost 50k / price 100k) so a 25% discount needs discount
      // approval but NOT margin approval — isolating the single-use property.
      data: { sku, name: 'Кабель', price: 100000, cost: 50000, category: 'accessories', attrs: {}, trackingMode: 'quantity' },
    });
    const balance = await prisma.inventoryBalance.create({
      // inventoryValue должен покрывать себестоимость списания на финализации
      // (order-inventory-sale.ts требует inventoryValue >= totalCost).
      data: { productId: product.id, location: 'BISHKEK-1', onHand, inventoryValue: onHand * 50000 },
    });
    // Количественная продажа списывает себестоимость по FIFO-слоям — без слоя
    // сама продажа падает на `inventory_valuation_missing`. Заводим слой на весь
    // остаток по цене закупки.
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: balance.id,
        location: 'BISHKEK-1',
        sourceType: 'seed',
        sourceRef: `seed-${sku}`,
        unitCost: 50000,
        quantityReceived: onHand,
        quantityRemaining: onHand,
      },
    });
    return product;
  }

  it('rejects a second sale that replays an already-used discount approval', async () => {
    const staffId = `staff-${RUN}`;
    const product = await seedQuantityProduct(5);
    const base = {
      staffId,
      point: 'BISHKEK-1',
      method: 'cash' as const,
      discountPct: 25, // over the 10% limit → needs approval
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    // 1. Over-limit discount parks for approval — no sale yet.
    const parked = await pos.sale(base);
    expect(parked.pendingApproval).toBe(true);
    const approvalId = (parked as { approvalId: string }).approvalId;

    // 2. Manager approves once.
    await approvals.decide(approvalId, { status: 'approved', approver: `senior-${RUN}`, approverRole: 'senior_seller' });
    await shifts.open({ staffId, point: 'BISHKEK-1', openCash: 0 }, staffId);

    // 3. First sale on the approval completes at 25% off.
    const first = await pos.sale({ ...base, approvalId, clientSaleId: `sale-A-${RUN}` });
    expect(first.pendingApproval).toBe(false);
    expect((first as { total: number }).total).toBe(75000);

    // 4. Replay: same approvalId, a FRESH clientSaleId (so it isn't deduped as a
    //    network retry) — this is the attack. It must be rejected, not sold.
    await expect(
      pos.sale({ ...base, approvalId, clientSaleId: `sale-B-${RUN}` }),
    ).rejects.toMatchObject({ code: 'discount_approval_already_used' });

    // 5. And no second discounted order/payment slipped through.
    const orders = await prisma.order.count({ where: { items: { some: { sku: product.sku } } } });
    expect(orders).toBe(1);

    // Sanity: the rejection is a ForbiddenError, not an incidental failure.
    const replayError = await pos
      .sale({ ...base, approvalId, clientSaleId: `sale-C-${RUN}` })
      .catch((error) => error);
    expect(replayError).toBeInstanceOf(ForbiddenError);
  });
});
