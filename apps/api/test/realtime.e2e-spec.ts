import { createServer, Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';

/** Socket.IO push: a subscribed client receives the order status update. */
describe('RealtimeGateway (socket.io)', () => {
  let httpServer: HttpServer;
  let socketServer: Server;
  let gateway: RealtimeGateway;
  let url: string;

  beforeAll(async () => {
    httpServer = createServer();
    socketServer = new Server(httpServer, { cors: { origin: '*' } });
    gateway = new RealtimeGateway();
    gateway.server = socketServer;
    socketServer.on('connection', (client) => {
      client.on('subscribe:order', (orderId: string, ack: (value: { subscribed: string }) => void) => {
        ack(gateway.subscribeOrder(client, orderId));
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await socketServer.close();
    httpServer.close();
  });

  it('delivers an order status push to a subscribed client', async () => {
    const handshake = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);
    expect(handshake.status).toBe(200);
    const client = io(url, { transports: ['websocket'], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', () => resolve());
        client.once('connect_error', reject);
      });
      await new Promise<void>((resolve) => client.emit('subscribe:order', 'order-1', () => resolve()));

      const received = new Promise<{ orderId: string; status: string }>(
        (resolve) => client.once('order:status', resolve),
      );
      gateway.emitOrderStatus('order-1', 'paid', { total: 100000 });

      const message = await received;
      expect(message.orderId).toBe('order-1');
      expect(message.status).toBe('paid');
    } finally {
      client.close();
    }
  });
});
