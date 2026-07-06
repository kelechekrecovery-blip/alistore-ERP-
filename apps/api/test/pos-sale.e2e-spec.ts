import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { CustomersService } from '../src/customers/customers.service';
import { PosService } from '../src/pos/pos.service';
import { ConflictError } from '../src/common/errors';

/**
 * POS counter sale: one call opens a shift, assigns IMEI units, and drives the
 * order created→reserved→paid, marking units sold and writing the ledger.
 */
describe('POS sale (integration)', () => {
  let prisma: PrismaService;
  let pos: PosService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    pos = new PosService(
      new CustomersService(prisma),
      new ShiftsService(prisma, audit),
      units,
      new OrdersService(prisma, audit, units),
      new PaymentsService(prisma, audit, units),
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
    await prisma.product.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.customer.deleteMany();
  });

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

    const result = await pos.sale({
      staffId: 'staff_pos_1',
      point: 'BISHKEK-1',
      method: 'cash',
      discountPct: 10,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    });

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
    const first = await pos.sale({
      staffId: 'staff_pos_2', point: 'BISHKEK-1', method: 'cash',
      lines: [{ productId: p1.id, sku: p1.sku, price: 100000, qty: 1 }],
    });
    const second = await pos.sale({
      staffId: 'staff_pos_2', point: 'BISHKEK-1', method: 'card',
      lines: [{ productId: p2.id, sku: p2.sku, price: 100000, qty: 1 }],
    });
    expect(second.shiftId).toBe(first.shiftId);
    const shifts = await prisma.cashShift.count({ where: { staffId: 'staff_pos_2' } });
    expect(shifts).toBe(1);
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
});
