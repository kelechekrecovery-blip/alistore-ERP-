import { PaymentsController } from '../src/payments/payments.controller';
import { OrdersController } from '../src/orders/orders.controller';
import { ValidationError } from '../src/common/errors';
import { assertVerifiedCustomerPhone } from '../src/customers/verified-phone';

describe('authenticated commerce verified-phone gates', () => {
  const required = new ValidationError(
    'phone_verification_required',
    'phone required',
  );

  it('rejects a deleted-phone tombstone even while an old access JWT remains valid', async () => {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          phone: 'deleted:customer-1',
          phoneVerifiedAt: new Date(),
        }),
      },
    };

    await expect(assertVerifiedCustomerPhone(prisma as never, 'customer-1'))
      .rejects.toMatchObject({ code: 'phone_verification_required' });
  });

  it('blocks authenticated order creation, including COD, before order mutation', async () => {
    const orders = {
      assertVerifiedPhone: jest.fn().mockRejectedValue(required),
      createFromCatalog: jest.fn(),
    };
    const controller = new OrdersController(
      orders as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(controller.createMine(
      { customerId: 'social-customer', typ: 'customer' },
      'order-key',
      { piiConsent: true, paymentMode: 'cod', items: [] } as never,
    )).rejects.toMatchObject({ code: 'phone_verification_required' });
    expect(orders.createFromCatalog).not.toHaveBeenCalled();
  });

  it('blocks authenticated payment and intent initiation before mutations', async () => {
    const payments = {
      assertVerifiedPhone: jest.fn().mockRejectedValue(required),
      payForCustomer: jest.fn(),
    };
    const intents = {
      assertVerifiedPhone: jest.fn().mockRejectedValue(required),
      createForCustomer: jest.fn(),
    };
    const controller = new PaymentsController(
      payments as never,
      intents as never,
      {} as never,
      {} as never,
      { name: 'none' } as never,
    );
    const user = { customerId: 'social-customer', typ: 'customer' };
    await expect(controller.pay(
      user,
      undefined,
      'payment-key',
      { orderId: 'order-1', method: 'gift_card', amount: 100 } as never,
    )).rejects.toMatchObject({ code: 'phone_verification_required' });
    await expect(controller.customerIntent(
      user,
      'intent-key',
      { orderId: 'order-1', method: 'card', amount: 100 } as never,
    )).rejects.toMatchObject({ code: 'phone_verification_required' });
    expect(payments.payForCustomer).not.toHaveBeenCalled();
    expect(intents.createForCustomer).not.toHaveBeenCalled();
  });
});
