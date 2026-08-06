import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RealtimeNotificationTransport } from '../src/outbox/transports/realtime.transport';

describe('RealtimeNotificationTransport (outbox → socket.io)', () => {
  it('broadcasts the outbox message via the gateway (recipient = order room)', async () => {
    const gateway = new RealtimeGateway();
    const spy = jest
      .spyOn(gateway, 'emitOrderStatus')
      .mockResolvedValue(undefined);
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
    expect(client.data).toEqual({
      accessToken: 'access-token',
      principal: { customerId: 'customer-1', typ: 'customer' },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('disconnects an already-connected socket when its session is revoked before subscribe', async () => {
    const verifyAccessToken = jest.fn().mockRejectedValue(new Error('staff_session_revoked'));
    const gateway = new RealtimeGateway(
      { verifyAccessToken } as never,
      { order: { findUnique: jest.fn() } } as never,
    );
    const client = {
      data: {
        accessToken: 'stale-access-token',
        principal: { customerId: 'staff-1', typ: 'staff', role: 'owner' },
      },
      disconnect: jest.fn(),
      join: jest.fn(),
    };

    await expect(gateway.subscribeOrder(client as never, 'order-1')).rejects.toThrow('unauthorized');
    expect(verifyAccessToken).toHaveBeenCalledWith('stale-access-token');
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects revoked room members before emitting an order update', async () => {
    const verifyAccessToken = jest.fn().mockRejectedValue(new Error('customer_session_revoked'));
    const socket = {
      data: {
        accessToken: 'deleted-customer-token',
        principal: { customerId: 'customer-1', typ: 'customer' },
      },
      leave: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
    const emit = jest.fn();
    const server = {
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([socket]) }),
      to: jest.fn().mockReturnValue({ emit }),
    };
    const gateway = new RealtimeGateway({ verifyAccessToken } as never);
    gateway.server = server as never;

    await gateway.emitOrderStatus('order-1', 'paid');

    expect(socket.leave).toHaveBeenCalledWith('order:order-1');
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(emit).toHaveBeenCalledWith('order:status', {
      orderId: 'order-1',
      status: 'paid',
    });
  });
});
