import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { CustomersService } from '../src/customers/customers.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PosService } from '../src/pos/pos.service';
import { ConflictError, ForbiddenError, ValidationError } from '../src/common/errors';

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
      prisma,
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

  it('completes a split payment sale and records each tender separately', async () => {
    const product = await seedProduct(1);

    const result = expectCompleted(await pos.sale({
      staffId: 'staff_pos_split',
      point: 'BISHKEK-1',
      payments: [
        { method: 'cash', amount: 40000 },
        { method: 'card', amount: 60000 },
      ],
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    }));

    expect(result.status).toBe('paid');
    expect(result.total).toBe(100000);

    const payments = await prisma.payment.findMany({
      where: { orderId: result.orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(2);
    expect(payments.map((payment) => ({ method: payment.method, amount: payment.amount }))).toEqual([
      { method: 'cash', amount: 40000 },
      { method: 'card', amount: 60000 },
    ]);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types.filter((type) => type === 'payment.received')).toHaveLength(2);
    expect(types.filter((type) => type === 'order.paid')).toHaveLength(1);
  });

  it('rejects split payments when tender amounts do not equal the sale total', async () => {
    const product = await seedProduct(1);

    const err = await pos
      .sale({
        staffId: 'staff_pos_split_bad',
        point: 'BISHKEK-1',
        payments: [
          { method: 'cash', amount: 30000 },
          { method: 'card', amount: 50000 },
        ],
        lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('payment_split_mismatch');
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(0);
  });

  it('rejects a client-supplied price that differs from the server catalog', async () => {
    const product = await seedProduct(1);

    const err = await pos
      .sale({
        staffId: 'staff_pos_price_tamper',
        point: 'BISHKEK-1',
        method: 'cash',
        lines: [{ productId: product.id, sku: product.sku, price: 1, qty: 1 }],
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('product_price_mismatch');
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('rejects an authenticated cashier attempting to sell from another active point', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const staff = await prisma.staffUser.create({
      data: { username: `pos-point-${suffix}`, passwordHash: 'test', role: 'cashier', point: 'BISHKEK-1' },
    });
    const otherPoint = await prisma.storePoint.create({
      data: {
        code: `pos-other-${suffix}`,
        name: 'Other POS point',
        address: 'Бишкек, другая точка',
        inventoryLocation: `POS-OTHER-${suffix}`.toUpperCase(),
        hours: '10:00–20:00',
        createdBy: 'pos-test',
        idempotencyKey: `pos-test:${suffix}`,
      },
    });
    const product = await seedProduct(1);

    const err = await pos.sale({
      staffId: staff.id,
      point: otherPoint.id,
      method: 'cash',
      lines: [{ productId: product.id, sku: product.sku, price: product.price, qty: 1 }],
    }).catch((error) => error);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe('staff_point_mismatch');
    expect(await prisma.order.count()).toBe(0);
    await prisma.storePoint.delete({ where: { id: otherPoint.id } });
    await prisma.staffUser.delete({ where: { id: staff.id } });
  });

  it('sells the exact in-stock IMEI selected by the POS scanner', async () => {
    const product = await seedProduct(2);
    const selected = await prisma.deviceUnit.findFirstOrThrow({
      where: { productId: product.id, status: 'in_stock' },
      orderBy: { id: 'desc' },
    });

    const result = expectCompleted(await pos.sale({
      staffId: 'staff_pos_scanner',
      point: 'BISHKEK-1',
      method: 'card',
      lines: [{ productId: product.id, sku: product.sku, price: product.price, qty: 1, imei: selected.imei }],
    }));

    expect(result.imeis).toEqual([selected.imei]);
    expect((await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: selected.imei } })).status).toBe('sold');
    expect(await prisma.deviceUnit.count({ where: { productId: product.id, status: 'in_stock' } })).toBe(1);
  });

  it('rejects a scanned IMEI that belongs to another product', async () => {
    const product = await seedProduct(1);
    const other = await seedProduct(1);
    const selected = await prisma.deviceUnit.findFirstOrThrow({ where: { productId: other.id } });

    const err = await pos.sale({
      staffId: 'staff_pos_wrong_imei',
      point: 'BISHKEK-1',
      method: 'cash',
      lines: [{ productId: product.id, sku: product.sku, price: product.price, qty: 1, imei: selected.imei }],
    }).catch((error) => error);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('imei_product_mismatch');
    expect(await prisma.order.count()).toBe(0);
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

  it('deduplicates a retry with no clientSaleId via the windowed cart fingerprint (M-5)', async () => {
    const product = await seedProduct(2); // two units: a dedup miss would sell the second
    const dto = {
      staffId: 'staff_pos_nokey',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    const first = expectCompleted(await pos.sale(dto));
    const retry = expectCompleted(await pos.sale(dto)); // same cart, same window → same key

    expect(retry.orderId).toBe(first.orderId);
    expect((retry as { idempotent?: boolean }).idempotent).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'in_stock' } })).toBe(1);
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

  it('parks an under-margin POS sale even when the discount is within the normal limit', async () => {
    const product = await seedProduct(1);
    await prisma.product.update({ where: { id: product.id }, data: { cost: 98000 } });
    const dto = {
      staffId: 'staff_pos_margin',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      discountPct: 5,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    const parked = await pos.sale(dto);
    expect(parked.pendingApproval).toBe(true);
    expect((parked as { reason: string }).reason).toBe('margin');
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(0);

    const approvalId = (parked as { approvalId: string }).approvalId;
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
    const payload = approval?.evidence as { payload?: { marginBreaches?: Array<{ sku: string; margin: number }> } } | null;
    expect(payload?.payload?.marginBreaches?.[0]).toMatchObject({ sku: product.sku, margin: -3000 });

    await approvals.decide(approvalId, { status: 'approved', approver: 'senior_1', approverRole: 'senior_seller' });
    const done = expectCompleted(await pos.sale({ ...dto, approvalId }));
    expect(done.total).toBe(95000);
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

  it('refuses to reuse an approved margin breach for a changed sale payload', async () => {
    const product = await seedProduct(1);
    await prisma.product.update({ where: { id: product.id }, data: { cost: 98000 } });
    const parked = await pos.sale({
      staffId: 'staff_pos_margin_tamper',
      point: 'BISHKEK-1',
      method: 'cash',
      discountPct: 5,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    });
    const approvalId = (parked as { approvalId: string }).approvalId;
    await approvals.decide(approvalId, { status: 'approved', approver: 'senior_1', approverRole: 'senior_seller' });

    const err = await pos
      .sale({
        staffId: 'staff_pos_margin_tamper',
        point: 'BISHKEK-1',
        method: 'cash',
        discountPct: 5,
        approvalId,
        lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 2 }],
      })
      .catch((e) => e);
    expect(err.code).toBe('margin_mismatch');
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(0);
  });
});
