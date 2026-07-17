import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentIntentsService } from './payment-intents.service';
import { StaffAuthController } from '../staff-auth/staff-auth.controller';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { AuthzService } from '../authz/authz.service';
import { issueGuestCheckoutCapability, issueGuestOrderCapability } from '../auth/guest-capability';

/**
 * GAP-PAY-GUARD-001 / GAP-STAFF-AUTH-RL-001 regression spec.
 *
 * Boots the REAL controllers with mocked services (same harness as
 * test/auth-throttle.e2e-spec.ts) and pins the auth contract of POST /payments:
 * anonymous callers may only pay by gift card AND must present a valid
 * `x-guest-capability` token scoped `payments:gift_card` — everything else is
 * rejected before any service/DB work happens. Also pins the staff login
 * brute-force throttle (10/min → 429 on the 11th attempt).
 */
describe('POST /payments guest guard (GAP-PAY-GUARD-001)', () => {
  let app: INestApplication;
  const paymentsService = {
    pay: jest.fn(),
    payForCustomer: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // ThrottlerModule is needed only to satisfy the ThrottlerGuard DI on the
      // intent/webhook routes; POST /payments itself is not throttled.
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: paymentsService },
        { provide: PaymentIntentsService, useValue: {} },
        { provide: StaffAuthService, useValue: {} },
        // PermissionGuard (on the staff-only routes) is instantiated by DI even
        // though these tests only exercise the anonymous path.
        { provide: AuthzService, useValue: { can: async () => true } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    paymentsService.payForCustomer.mockResolvedValue({ id: 'payment-1' });
  });

  it('rejects anonymous cash/card payments with 401 payment_requires_auth', async () => {
    const server = app.getHttpServer();
    for (const method of ['cash', 'card']) {
      const response = await request(server)
        .post('/payments')
        .send({ orderId: 'order-1', method, amount: 1000 })
        .expect(401);
      expect(response.body.message).toBe('payment_requires_auth');
    }
    expect(paymentsService.pay).not.toHaveBeenCalled();
    expect(paymentsService.payForCustomer).not.toHaveBeenCalled();
  });

  it('rejects anonymous gift_card payment without the x-guest-capability header', async () => {
    const response = await request(app.getHttpServer())
      .post('/payments')
      .send({ orderId: 'order-1', method: 'gift_card', amount: 1000, giftCardCode: 'GC-TEST' })
      .expect(401);
    expect(response.body.message).toBe('guest_capability_required');
    expect(paymentsService.pay).not.toHaveBeenCalled();
    expect(paymentsService.payForCustomer).not.toHaveBeenCalled();
  });

  it('rejects a gift_card payment whose capability lacks the payments:gift_card scope', async () => {
    const orderCapability = issueGuestOrderCapability('customer-1', 'order-1');
    const response = await request(app.getHttpServer())
      .post('/payments')
      .set('x-guest-capability', orderCapability)
      .send({ orderId: 'order-1', method: 'gift_card', amount: 1000, giftCardCode: 'GC-TEST' })
      .expect(403);
    expect(response.body.message).toBe('guest_capability_scope_denied');
    expect(paymentsService.payForCustomer).not.toHaveBeenCalled();
  });

  it('lets a guest pay by gift_card with a valid payments:gift_card capability', async () => {
    const capability = issueGuestCheckoutCapability('customer-1');
    await request(app.getHttpServer())
      .post('/payments')
      .set('x-guest-capability', capability)
      .send({ orderId: 'order-1', method: 'gift_card', amount: 1000, giftCardCode: 'GC-TEST' })
      .expect(201);
    expect(paymentsService.payForCustomer).toHaveBeenCalledWith(
      'customer-1',
      expect.objectContaining({ orderId: 'order-1', method: 'gift_card' }),
      'guest:customer-1',
    );
  });
});

describe('POST /staff-auth/login throttle (GAP-STAFF-AUTH-RL-001)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [StaffAuthController],
      providers: [
        {
          provide: StaffAuthService,
          useValue: {
            login: async () => ({ accessToken: 'stub', role: 'owner' }),
          },
        },
        // PermissionGuard (on POST /staff-auth/staff) is instantiated by DI even
        // though this test only exercises the throttled login route.
        { provide: AuthzService, useValue: { can: async () => true } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 10 logins per minute then returns 429 on the 11th', async () => {
    const server = app.getHttpServer();
    const body = { username: 'cashier', password: 'whatever' };
    for (let i = 0; i < 10; i += 1) {
      await request(server).post('/staff-auth/login').send(body).expect(201);
    }
    await request(server).post('/staff-auth/login').send(body).expect(429);
  });
});
