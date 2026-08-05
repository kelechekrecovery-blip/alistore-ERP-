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
  let customerPhone = '+996700000001';

  beforeAll(async () => {
    httpServer = createServer();
    socketServer = new Server(httpServer, { cors: { origin: '*' } });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: '1' }]),
      customer: { findUnique: jest.fn(async () => ({ phone: customerPhone })) },
    };
    gateway = new RealtimeGateway(
      undefined,
      {
        order: { findUnique: jest.fn().mockResolvedValue({ customerId: 'customer-1' }) },
        $transaction: jest.fn(async (work) => work(tx)),
      } as never,
      undefined,
      undefined,
    );
    gateway.server = socketServer;
    socketServer.on('connection', (client) => {
      client.on('subscribe:order', (orderId: string, ack: (value: { subscribed: string }) => void) => {
        client.data.principal = { customerId: 'customer-1', typ: 'customer' };
        void gateway.subscribeOrder(client, orderId).then(ack);
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
      await gateway.emitOrderStatus('order-1', 'paid', { total: 100000 });

      const message = await received;
      expect(message.orderId).toBe('order-1');
      expect(message.status).toBe('paid');
    } finally {
      client.close();
    }
  });

  it('rejects a cross-customer room subscription', async () => {
    const gatewayWithForeignOrder = new RealtimeGateway(
      undefined,
      { order: { findUnique: jest.fn().mockResolvedValue({ customerId: 'other-customer' }) } } as never,
      undefined,
      undefined,
    );
    const client = {
      data: { principal: { customerId: 'customer-1', typ: 'customer' } },
      join: jest.fn(),
    };
    await expect(gatewayWithForeignOrder.subscribeOrder(client as never, 'order-1')).rejects.toThrow('order_not_found');
  });

  it('keeps customer and staff subscriptions in separate order rooms', async () => {
    const activeTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: '1' }]),
      customer: { findUnique: jest.fn().mockResolvedValue({ phone: '+996700000001' }) },
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ customerId: 'customer-1' }) },
      $transaction: jest.fn(async (work) => work(activeTx)),
    };
    const scopedGateway = new RealtimeGateway(
      undefined,
      prisma as never,
      { me: jest.fn().mockResolvedValue({ active: true }) } as never,
      { can: jest.fn().mockResolvedValue(true) } as never,
    );
    const customer = {
      data: { principal: { customerId: 'customer-1', typ: 'customer' } },
      join: jest.fn(),
    };
    const staff = {
      data: { principal: { customerId: 'staff-1', typ: 'staff', role: 'manager' } },
      join: jest.fn(),
    };

    await scopedGateway.subscribeOrder(customer as never, 'order-1');
    await scopedGateway.subscribeOrder(staff as never, 'order-1');

    expect(customer.join).toHaveBeenCalledWith([
      'customer:customer-1',
      'order:order-1:customer:customer-1',
    ]);
    expect(staff.join).toHaveBeenCalledWith('order:order-1:staff');
  });

  it('does not deliver to an established customer subscription after deletion', async () => {
    const client = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    const received: unknown[] = [];
    client.on('order:status', (message) => received.push(message));
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });
      await new Promise<void>((resolve) => client.emit('subscribe:order', 'order-1', () => resolve()));
      const disconnected = new Promise<void>((resolve) => client.once('disconnect', () => resolve()));

      customerPhone = 'deleted:customer-1';
      await gateway.emitOrderStatus('order-1', 'paid', { eventId: 'after-delete' });
      await disconnected;

      expect(received).toEqual([]);
    } finally {
      customerPhone = '+996700000001';
      client.close();
    }
  });

  it('rejects a tombstoned customer on an already-connected socket', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: '1' }]),
      customer: { findUnique: jest.fn().mockResolvedValue({ phone: 'deleted:customer-1' }) },
    };
    const gatewayWithDeletedCustomer = new RealtimeGateway(
      undefined,
      {
        order: { findUnique: jest.fn().mockResolvedValue({ customerId: 'customer-1' }) },
        $transaction: jest.fn(async (work) => work(tx)),
      } as never,
      undefined,
      undefined,
    );
    const client = {
      data: { principal: { customerId: 'customer-1', typ: 'customer' } },
      join: jest.fn(),
    };

    await expect(gatewayWithDeletedCustomer.subscribeOrder(client as never, 'order-1'))
      .rejects.toThrow('customer_session_revoked');
    expect(client.join).not.toHaveBeenCalled();
  });
});
