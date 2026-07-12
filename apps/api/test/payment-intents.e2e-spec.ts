import { AuditService } from '../src/audit/audit.service';
import { ConflictError, ValidationError } from '../src/common/errors';
import { OrdersService } from '../src/orders/orders.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UnitsService } from '../src/units/units.service';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import { ProductionPaymentGatewayProvider } from '../src/payments/production-payment-gateway.provider';

describe('Online payment intents (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let intents: PaymentIntentsService;
  let payments: PaymentsService;
  let units: UnitsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    units = new UnitsService(prisma);
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, new ApprovalsService(prisma, audit));
    intents = new PaymentIntentsService(prisma, orders, payments, new SandboxPaymentGatewayProvider());
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
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function webOrder() {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967018${seq.toString().padStart(4, '0')}`, name: 'Pay Web' } });
    const product = await prisma.product.create({
      data: { sku: `PAY-${seq}`, name: 'iPhone Pay', price: 100000, cost: 82000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({ data: { imei: `PAY-IMEI-${seq}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' } });
    return orders.create(
      { customerId: customer.id, channel: 'web', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000 }] },
      'web',
    );
  }

  it('creates a QR intent by reserving stock, then confirms payment idempotently', async () => {
    const order = await webOrder();

    const intent = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    expect(intent.provider).toBe('mbank');
    expect(intent.orderStatus).toBe('awaiting_payment');
    expect(intent.qrPayload).toContain('alistore-mbank://pay');

    const reserved = await prisma.deviceUnit.findFirst({ where: { orderId: order.id } });
    expect(reserved?.status).toBe('reserved');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('awaiting_payment');

    const paid = await intents.webhook({
      orderId: order.id,
      method: 'qr_mbank',
      amount: 100000,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'mbank',
    });
    expect(paid.order?.status).toBe('paid');
    expect(paid.payment.method).toBe('qr_mbank');
    expect(paid.idempotent).toBe(false);

    const again = await intents.webhook({
      orderId: order.id,
      method: 'qr_mbank',
      amount: 100000,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'mbank',
    });
    expect(again.idempotent).toBe(true);
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold', orderId: order.id } })).toBe(1);
  });

  it('is race-safe: two concurrent webhooks with the same txnId apply the payment once', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    const hook = () =>
      intents.webhook({ orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: intent.txnId, status: 'succeeded', actor: 'mbank' });

    // Providers commonly re-deliver a webhook on timeout; both land simultaneously here.
    const results = await Promise.allSettled([hook(), hook()]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true); // no unhandled 500 for both
    // Applied exactly once regardless of the race — one payment, one sold unit, order paid.
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold', orderId: order.id } })).toBe(1);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('paid');
  });

  it('rejects an amount mismatch and already-paid orders', async () => {
    const order = await webOrder();
    const mismatch = await intents.create({ orderId: order.id, method: 'card', amount: 999 }).catch((e) => e);
    expect(mismatch).toBeInstanceOf(ValidationError);
    expect(mismatch.code).toBe('payment_amount_mismatch');

    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    await intents.webhook({ orderId: order.id, method: 'card', amount: 100000, txnId: intent.txnId, status: 'succeeded' });
    const paidAgain = await intents.create({ orderId: order.id, method: 'card', amount: 100000 }).catch((e) => e);
    expect(paidAgain).toBeInstanceOf(ConflictError);
    expect(paidAgain.code).toBe('order_already_paid');
  });

  it('creates a customer intent only for an order owned by that JWT principal', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    await expect(intents.createForCustomer('another-customer', {
      orderId: order.id,
      method: 'card',
      amount: 100000,
    })).rejects.toMatchObject({ code: 'order_not_found' });

    const intent = await intents.createForCustomer(stored.customerId, {
      orderId: order.id,
      method: 'card',
      amount: 100000,
    });
    expect(intent.orderId).toBe(order.id);
    expect(intent.orderStatus).toBe('awaiting_payment');
  });

  it('fails before reserving stock when the selected production adapter is not activated', async () => {
    const order = await webOrder();
    const production = new PaymentIntentsService(
      prisma,
      orders,
      payments,
      new ProductionPaymentGatewayProvider({
        apiUrl: 'https://payments.example.test',
        merchantId: 'merchant',
        apiKey: 'secret',
        webhookSecret: 'webhook-secret',
      }),
    );

    await expect(production.create({ orderId: order.id, method: 'card', amount: 100000 }))
      .rejects.toMatchObject({ status: 503 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('created');
    expect(await prisma.deviceUnit.count({ where: { status: 'in_stock' } })).toBe(1);
  });
});
