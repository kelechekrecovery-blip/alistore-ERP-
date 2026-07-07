import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { CustomersService } from '../src/customers/customers.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PosService } from '../src/pos/pos.service';
import { ConflictError } from '../src/common/errors';

/**
 * POS counter sale: one call opens a shift, assigns IMEI units, and drives the
 * order created→reserved→paid, marking units sold and writing the ledger.
 */
describe('POS sale (integration)', () => {
  let prisma: PrismaService;
  let pos: PosService;
  let approvals: ApprovalsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    pos = new PosService(
      new CustomersService(prisma, audit),
      new ShiftsService(prisma, audit),
      units,
      new OrdersService(prisma, audit, units),
      new PaymentsService(prisma, audit, units, approvals),
      approvals,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  /** Narrow the sale() union to the completed variant, failing if it parked instead. */
  function expectCompleted<T extends { pendingApproval: boolean }>(r: T): Extract<T, { pendingApproval: false }> {
    if (r.pendingApproval) throw new Error('expected a completed sale, got pending approval');
    return r as Extract<T, { pendingApproval: false }>;
  }

  async function seedProduct(units: number) {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `POS-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    for (let n = 0; n < units; n += 1) {
      await prisma.deviceUnit.create({
        data: { imei: `IMEI-POS-${seq}-${n}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      });
    }
    return product;
  }

  it('completes a cash sale: order paid, unit sold, shift + ledger recorded', async () => {
    const product = await seedProduct(2);

    const result = expectCompleted(await pos.sale({
      staffId: 'staff_pos_1',
      point: 'BISHKEK-1',
      method: 'cash',
      discountPct: 10,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    }));

    expect(result.status).toBe('paid');
    expect(result.total).toBe(90000); // 10% off
    expect(result.imeis).toHaveLength(1);
    expect(result.receiptNo).toMatch(/^POS-/);

    // one unit sold, one still in stock
    const sold = await prisma.deviceUnit.count({ where: { status: 'sold' } });
    const inStock = await prisma.deviceUnit.count({ where: { status: 'in_stock' } });
    expect(sold).toBe(1);
    expect(inStock).toBe(1);

    // payment attached to the shift, at the discounted total
    const payment = await prisma.payment.findFirst({ where: { shiftId: result.shiftId } });
    expect(payment?.amount).toBe(90000);
    expect(payment?.method).toBe('cash');

    // ledger trail
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['shift.opened', 'order.created', 'order.reserved', 'payment.received', 'unit.sold', 'order.paid']),
    );
  });

  it('reuses an already-open shift instead of opening a second', async () => {
    const p1 = await seedProduct(1);
    const p2 = await seedProduct(1);
    const first = expectCompleted(await pos.sale({
      staffId: 'staff_pos_2', point: 'BISHKEK-1', method: 'cash',
      lines: [{ productId: p1.id, sku: p1.sku, price: 100000, qty: 1 }],
    }));
    const second = expectCompleted(await pos.sale({
      staffId: 'staff_pos_2', point: 'BISHKEK-1', method: 'card',
      lines: [{ productId: p2.id, sku: p2.sku, price: 100000, qty: 1 }],
    }));
    expect(second.shiftId).toBe(first.shiftId);
    const shifts = await prisma.cashShift.count({ where: { staffId: 'staff_pos_2' } });
    expect(shifts).toBe(1);
  });

  it('deduplicates offline POS retries by clientSaleId', async () => {
    const product = await seedProduct(1);
    const dto = {
      staffId: 'staff_pos_offline',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'offline-pos-1',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    const first = expectCompleted(await pos.sale(dto));
    const retry = expectCompleted(await pos.sale(dto));

    expect(retry.orderId).toBe(first.orderId);
    expect((retry as { idempotent?: boolean }).idempotent).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('rejects a sale that exceeds available stock (409)', async () => {
    const product = await seedProduct(1);
    const err = await pos
      .sale({
        staffId: 'staff_pos_3', point: 'BISHKEK-1', method: 'cash',
        lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 3 }],
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('insufficient_stock');
  });

  it('parks a discount over the limit for approval, then completes on the approved retry', async () => {
    const product = await seedProduct(1);
    const dto = {
      staffId: 'staff_pos_4', point: 'BISHKEK-1', method: 'cash' as const, discountPct: 25,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    // over the 10% limit → parked, sale NOT executed
    const parked = await pos.sale(dto);
    expect(parked.pendingApproval).toBe(true);
    const approvalId = (parked as { approvalId: string }).approvalId;
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(0);

    // senior approves, cashier retries with the approvalId → sale completes at 25% off
    await approvals.decide(approvalId, { status: 'approved', approver: 'senior_1', approverRole: 'senior_seller' });
    const done = expectCompleted(await pos.sale({ ...dto, approvalId }));
    expect(done.total).toBe(75000);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('refuses to complete a discounted sale whose approval % does not match', async () => {
    const product = await seedProduct(1);
    const parked = await pos.sale({
      staffId: 'staff_pos_5', point: 'BISHKEK-1', method: 'cash', discountPct: 20,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    });
    const approvalId = (parked as { approvalId: string }).approvalId;
    await approvals.decide(approvalId, { status: 'approved', approver: 'owner', approverRole: 'owner' });

    // tamper: approved for 20%, try to apply 50%
    const err = await pos
      .sale({
        staffId: 'staff_pos_5', point: 'BISHKEK-1', method: 'cash', discountPct: 50, approvalId,
        lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
      })
      .catch((e) => e);
    expect(err.code).toBe('discount_mismatch');
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(0);
  });
});
