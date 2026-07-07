import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Real-time push (socket.io) — clients subscribe to an order and receive status
 * updates and courier-tracking pushes without polling. Producers (order state
 * machine / outbox) call emitOrderStatus once wired.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway {
  @WebSocketServer() server!: Server;

  /** Client subscribes to live updates for one order (joins its room). */
  @SubscribeMessage('subscribe:order')
  subscribeOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() orderId: string,
  ): { subscribed: string } {
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
}
