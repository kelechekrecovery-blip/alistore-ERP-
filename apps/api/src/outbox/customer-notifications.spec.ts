import {
  customerNotificationProjection,
  enqueueSupplyCustomerNotice,
  redactCustomerNotificationPayload,
} from './customer-notifications';
import { notificationText } from './transports/message-text';

describe('supply customer notifications', () => {
  it('maps lifecycle templates to Russian customer copy without procurement internals', () => {
    const projection = customerNotificationProjection({
      customerId: 'customer-1',
      template: 'supply_late',
      payload: {
        orderId: 'order-123456',
        expectedAt: '2026-08-04T00:00:00.000Z',
      },
    });

    expect(projection).toMatchObject({
      title: 'Срок поставки изменился',
      route: 'order',
      referenceId: 'order-123456',
    });
    expect(projection.detail).toContain('123456');
    expect(projection.detail).toContain('04.08.2026');
  });

  it('recursively removes supplier, cost, evidence and approval-only fields', () => {
    expect(redactCustomerNotificationPayload({
      orderId: 'order-1',
      supplierId: 'supplier-secret',
      unitCost: 50000,
      evidence: { url: 'private' },
      nested: {
        purchase_cost: 40000,
        owner_reason: 'internal',
        expectedAt: '2026-08-04',
      },
      lines: [{ sku: 'PUBLIC-SKU', supplier_sku: 'SECRET-SKU', cost: 10 }],
    })).toEqual({
      orderId: 'order-1',
      nested: { expectedAt: '2026-08-04' },
      lines: [{ sku: 'PUBLIC-SKU' }],
    });
  });

  it('uses stable inbox/outbox keys and queues only sanitized payload', async () => {
    const tx = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          phone: '+996700000001',
          consent: false,
        }),
      },
      customerNotification: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const outbox = { enqueueOnTx: jest.fn().mockResolvedValue(undefined) };

    const input = {
      customerId: 'customer-1',
      template: 'supply_refund_queued' as const,
      eventKey: 'refund-1',
      payload: {
        orderId: 'order-1',
        amount: 12000,
        refundId: 'refund-1',
        supplierId: 'must-not-leak',
      },
    };
    await enqueueSupplyCustomerNotice(tx as never, outbox as never, input);
    await enqueueSupplyCustomerNotice(tx as never, outbox as never, input);

    expect(tx.customerNotification.upsert).toHaveBeenCalledTimes(2);
    const firstId = tx.customerNotification.upsert.mock.calls[0][0].where.id;
    const secondId = tx.customerNotification.upsert.mock.calls[1][0].where.id;
    expect(firstId).toBe(secondId);
    expect(outbox.enqueueOnTx).toHaveBeenLastCalledWith(
      tx,
      expect.objectContaining({
        dedupKey: 'supply:supply_refund_queued:refund-1',
        payload: {
          customerId: 'customer-1',
          orderId: 'order-1',
          amount: 12000,
          refundId: 'refund-1',
        },
      }),
    );
  });

  it('renders concise RU transport text instead of serializing payload JSON', () => {
    const text = notificationText({
      channel: 'sms',
      recipient: '+996700000001',
      template: 'supply_balance_due',
      payload: {
        customerId: 'customer-1',
        orderId: 'order-123456',
        amount: 74990,
      },
    });

    expect(text).toBe('AliStore: по заказу №123456 осталось оплатить 74 990 сом.');
    expect(text).not.toContain('customerId');
  });
});
