import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { CustomersController } from '../src/customers/customers.controller';
import { CustomersService } from '../src/customers/customers.service';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';
import { PaymentsService } from '../src/payments/payments.service';
import { RateLimitModule } from '../src/rate-limit/rate-limit.module';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { SupportController } from '../src/support/support.controller';
import { SupportService } from '../src/support/support.service';
import { AuthzService } from '../src/authz/authz.service';
import { issueGuestCheckoutCapability } from '../src/auth/guest-capability';

/**
 * Abuse guardrails for public write endpoints: checkout path and support tickets
 * are rate-limited; provider webhooks must reject arbitrary public writes.
 */
describe('public endpoint rate limits', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), RateLimitModule],
      controllers: [CustomersController, OrdersController, PaymentsController, SupportController],
      providers: [
        { provide: CustomersService, useValue: { upsert: async () => ({ id: 'customer-1' }) } },
        { provide: OrdersService, useValue: { createFromCatalog: async () => ({ id: 'order-1' }) } },
        { provide: PaymentsService, useValue: { find: async () => [], pay: async () => ({ id: 'pay-1' }), payForCustomer: async () => ({ id: 'pay-1' }) } },
        { provide: PaymentIntentsService, useValue: { create: async () => ({ id: 'intent-1' }), webhook: async () => ({ ok: true }) } },
        { provide: SupportService, useValue: { open: async () => ({ id: 'ticket-1' }), list: async () => [] } },
        { provide: StaffAuthService, useValue: { me: async () => ({ id: 'staff-1' }) } },
        { provide: AuthzService, useValue: { can: async () => true } },
        { provide: ReceiptsService, useValue: { build: async () => ({ markup: '' }) } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function exhaust(
    path: string,
    body: Record<string, unknown>,
    allowed: number,
    okStatus: number,
    headers?: Record<string, string>,
  ) {
    const server = app.getHttpServer();
    const connectionHeaders = { connection: 'close', ...(headers ?? {}) };
    for (let i = 0; i < allowed; i += 1) {
      await request(server).post(path).set(connectionHeaders).send(body).expect(okStatus);
    }
    await request(server).post(path).set(connectionHeaders).send(body).expect(429);
  }

  it('rate-limits checkout customer creation', async () => {
    await exhaust('/customers', { phone: '+996700111222', name: 'Checkout' }, 30, 201);
  });

  it('rate-limits checkout order creation', async () => {
    await exhaust(
      '/orders',
      { customerId: 'customer-1', channel: 'web', total: 1000, items: [{ sku: 'SKU', qty: 1, price: 1000 }] },
      20,
      201,
      { 'x-guest-capability': issueGuestCheckoutCapability('customer-1') },
    );
  });

  it('rate-limits public support ticket creation', async () => {
    await exhaust(
      '/support/tickets',
      { customerId: 'customer-1', channel: 'web', subject: 'Help' },
      5,
      201,
      { 'x-guest-capability': issueGuestCheckoutCapability('customer-1') },
    );
  });

  it('does not accept direct sandbox/provider payment webhooks by default', async () => {
    await request(app.getHttpServer())
      .post('/payments/webhooks/sandbox')
      .send({ orderId: 'order-1', method: 'card', amount: 1000, txnId: 'txn-1', status: 'succeeded' })
      .expect(404);
  });
});
