import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { AuthzService } from '../authz/authz.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { PrismaService } from '../prisma/prisma.service';

type RealtimeSocket = Socket & { data: { principal?: AuthPrincipal } };

/**
 * Real-time push (socket.io) — clients subscribe to an order and receive status
 * updates and courier-tracking pushes without polling. Producers (order state
 * machine / outbox) call emitOrderStatus once wired.
 */
@WebSocketGateway({
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
        : true,
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer() server!: Server;

  constructor(
    @Optional() private readonly auth?: AuthService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly staffAuth?: StaffAuthService,
    @Optional() private readonly authz?: AuthzService,
  ) {}

  /** Authenticate every Socket.IO connection before any order room is reachable. */
  afterInit(server: Server): void {
    server.use(async (client: RealtimeSocket, next) => {
      try {
        const token = this.readToken(client);
        if (!token || !this.auth) throw new Error('missing_access_token');
        const principal = await this.auth.verifyAccessToken(token);
        if (principal.typ === 'staff') {
          await this.assertStaffQueueAccess(principal);
        }
        client.data.principal = principal;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  /** Client subscribes to live updates for one order (joins its room). */
  @SubscribeMessage('subscribe:order')
  async subscribeOrder(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() orderId: string,
  ): Promise<{ subscribed: string }> {
    const principal = client.data.principal;
    if (!principal || !this.prisma) throw new WsException('unauthorized');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order) throw new WsException('order_not_found');
    if (principal.typ === 'customer' && order.customerId !== principal.customerId) {
      throw new WsException('order_not_found');
    }
    if (principal.typ === 'staff') await this.assertStaffQueueAccess(principal);
    client.join(`order:${orderId}`);
    return { subscribed: orderId };
  }

  /** Push an order status change to its subscribers. */
  emitOrderStatus(
    orderId: string,
    status: string,
    payload: Record<string, unknown> = {},
  ): void {
    if (!this.server) return; // no adapter bound (e.g. unit tests) → no-op
    this.server
      .to(`order:${orderId}`)
      .emit('order:status', { orderId, status, ...payload });
  }

  private readToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();
    return undefined;
  }

  private async assertStaffQueueAccess(principal: AuthPrincipal): Promise<void> {
    if (principal.typ !== 'staff' || !principal.role || !this.staffAuth || !this.authz) {
      throw new Error('staff_authorization_unavailable');
    }
    await this.staffAuth.me(principal.customerId);
    if (!(await this.authz.can(principal.role, 'orders', 'queue'))) {
      throw new Error('staff_order_access_denied');
    }
  }
}
