import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RealtimeNotificationTransport } from '../src/outbox/transports/realtime.transport';

describe('RealtimeNotificationTransport (outbox → socket.io)', () => {
  it('broadcasts the outbox message via the gateway (recipient = order room)', async () => {
    const gateway = new RealtimeGateway();
    const spy = jest
      .spyOn(gateway, 'emitOrderStatus')
      .mockImplementation(() => undefined);
    const transport = new RealtimeNotificationTransport(gateway);

    await transport.deliver({
      channel: 'push',
      recipient: 'order-1',
      template: 'paid',
      payload: { total: 100000 },
    });

    expect(spy).toHaveBeenCalledWith('order-1', 'paid', { total: 100000 });
  });

  it('is a no-op-safe when the gateway has no bound server', async () => {
    const gateway = new RealtimeGateway(); // no socket server attached
    const transport = new RealtimeNotificationTransport(gateway);
    await expect(
      transport.deliver({
        channel: 'push',
        recipient: 'order-2',
        template: 'packed',
        payload: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('requires an access token before a socket can subscribe', async () => {
    const gateway = new RealtimeGateway({ verifyAccessToken: jest.fn() } as never);
    const use = jest.fn();
    gateway.afterInit({ use } as never);
    const middleware = use.mock.calls[0][0] as (client: unknown, next: (error?: Error) => void) => Promise<void>;
    const next = jest.fn();

    await middleware({ handshake: { auth: {}, headers: {} }, data: {} }, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('unauthorized');
  });

  it('stores the verified customer principal on the socket', async () => {
    const verifyAccessToken = jest.fn().mockResolvedValue({ customerId: 'customer-1', typ: 'customer' });
    const gateway = new RealtimeGateway({ verifyAccessToken } as never);
    const use = jest.fn();
    gateway.afterInit({ use } as never);
    const middleware = use.mock.calls[0][0] as (client: unknown, next: (error?: Error) => void) => Promise<void>;
    const next = jest.fn();
    const client = { handshake: { auth: { token: 'access-token' }, headers: {} }, data: {} };

    await middleware(client, next);

    expect(verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(client.data).toEqual({ principal: { customerId: 'customer-1', typ: 'customer' } });
    expect(next).toHaveBeenCalledWith();
  });
});
