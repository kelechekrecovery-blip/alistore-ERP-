import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { ValidationError } from '../src/common/errors';

/**
 * ReceiptsService.renderOrder against a real order in Postgres — proves the
 * receiptline integration is wired to actual sales without touching POS code.
 */
describe('ReceiptsService.renderOrder (integration)', () => {
  let prisma: PrismaService;
  let receipts: ReceiptsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = {
      get: (key: string) =>
        ({ STORE_NAME: 'AliStore', STORE_ADDRESS: 'Бишкек' } as Record<
          string,
          string
        >)[key],
    } as unknown as ConfigService;
    receipts = new ReceiptsService(prisma, config);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // No global wipe — the grown schema has many FK-linked tables; instead each
  // test seeds unique rows and reads its order back by id, so leftovers are harmless.
  const RUN = Math.floor(Math.random() * 1_000_000);

  async function seedPaidOrder() {
    seq += 1;
    const suffix = `${RUN}-${seq}`;
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}${seq}`, name: 'Клиент' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-R-${suffix}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        total: 100000,
        status: 'paid',
        items: { create: [{ sku: product.sku, qty: 1, price: 100000 }] },
      },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'cash', status: 'received' },
    });
    return order;
  }

  it('renders a receipt for a real order (product name, total, payment)', async () => {
    const order = await seedPaidOrder();
    const out = await receipts.renderOrder(order.id);

    expect(out.markup).toContain('AliStore');
    expect(out.markup).toContain('iPhone 15'); // name resolved by SKU
    expect(out.markup).toContain('100 000');
    expect(out.markup).toContain('Оплата: cash');
    expect(out.svg.startsWith('<svg')).toBe(true);
    expect(Buffer.from(out.escposBase64, 'base64').length).toBeGreaterThan(0);
  });

  it('throws 422 for an unknown order', async () => {
    const err = await receipts.renderOrder('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('order_not_found');
  });
});
