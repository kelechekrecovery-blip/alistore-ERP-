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
});
