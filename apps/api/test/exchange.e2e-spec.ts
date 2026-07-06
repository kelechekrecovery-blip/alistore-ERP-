import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ExchangesService } from '../src/exchanges/exchanges.service';
import { ValidationError } from '../src/common/errors';

/**
 * Обмен (Phase 6): atomic return + sale + surcharge. Old unit → returned, new
 * unit → sold on a new paid order, original order → exchanged, доплата collected.
 * A cheaper exchange is refused (must go through return + gated refund).
 */
describe('Exchange (integration)', () => {
  let prisma: PrismaService;
  let exchanges: ExchangesService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    exchanges = new ExchangesService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function setup(oldPrice: number, newPrice: number) {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967004${seq.toString().padStart(4, '0')}`, name: 'T' } });
    const oldProduct = await prisma.product.create({
      data: { sku: `EX-OLD-${seq}`, name: 'old', price: oldPrice, cost: 1, category: 'c', attrs: {} },
    });
    const newProduct = await prisma.product.create({
      data: { sku: `EX-NEW-${seq}`, name: 'new', price: newPrice, cost: 1, category: 'c', attrs: {} },
    });
    const oldImei = `EX-OLD-${seq}-1`;
    await prisma.deviceUnit.create({ data: { imei: oldImei, productId: oldProduct.id, status: 'sold', location: 'B' } });
    await prisma.deviceUnit.create({ data: { imei: `EX-NEW-${seq}-1`, productId: newProduct.id, status: 'in_stock', location: 'B' } });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id, channel: 'pos', total: oldPrice, status: 'paid',
        items: { create: [{ sku: oldProduct.sku, qty: 1, price: oldPrice, imei: oldImei }] },
      },
    });
    return { order, oldImei, newProduct };
  }

  it('swaps devices, collects surcharge, marks original exchanged', async () => {
    const { order, oldImei, newProduct } = await setup(100000, 130000);

    const res = await exchanges.exchange(
      { originalOrderId: order.id, oldImei, newProductId: newProduct.id, method: 'cash' },
      'senior_azamat',
    );
    expect(res.surcharge).toBe(30000);

    expect((await prisma.deviceUnit.findUnique({ where: { imei: oldImei } }))?.status).toBe('returned');
    expect((await prisma.deviceUnit.findUnique({ where: { imei: res.newImei } }))?.status).toBe('sold');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('exchanged');

    const newOrder = await prisma.order.findUnique({ where: { id: res.exchangeOrderId } });
    expect(newOrder?.status).toBe('paid');
    expect(newOrder?.channel).toBe('exchange');

    const payment = await prisma.payment.findFirst({ where: { orderId: res.exchangeOrderId } });
    expect(payment?.amount).toBe(30000);

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['unit.returned', 'return.completed', 'order.created', 'unit.sold', 'order.paid', 'payment.received', 'order.exchanged']),
    );
  });

  it('refuses a cheaper exchange (must use return + refund)', async () => {
    const { order, oldImei, newProduct } = await setup(130000, 100000);
    const err = await exchanges
      .exchange({ originalOrderId: order.id, oldImei, newProductId: newProduct.id, method: 'cash' }, 'a')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('exchange_needs_refund');
  });
});
