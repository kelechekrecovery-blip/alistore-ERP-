import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io } from 'socket.io-client';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';

/** socket.io push: a subscribed client receives the order status update. */
describe('RealtimeGateway (socket.io)', () => {
  let app: INestApplication;
  let gateway: RealtimeGateway;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RealtimeGateway],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    gateway = moduleRef.get(RealtimeGateway);
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('delivers an order status push to a subscribed client', async () => {
    const client = io(url, { transports: ['websocket'] });
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));

    // Subscribe and wait for the ack so the room join has completed.
    await new Promise<void>((resolve) =>
      client.emit('subscribe:order', 'order-1', () => resolve()),
    );

    const received = new Promise<{ orderId: string; status: string }>(
      (resolve) => client.on('order:status', resolve),
    );
    gateway.emitOrderStatus('order-1', 'paid', { total: 100000 });

    const message = await received;
    expect(message.orderId).toBe('order-1');
    expect(message.status).toBe('paid');
    client.close();
  });
});
