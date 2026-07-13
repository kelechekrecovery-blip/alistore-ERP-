import { Injectable } from '@nestjs/common';
import { Return as ReturnRecord, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';

/**
 * Return requests (Return state machine). Recording a return is separate from the
 * money: the actual refund is an approval-gated action on the payment
 * (PaymentsService.refund), so a return moving to `paid` reflects an approved,
 * executed refund — the ledger stays the single source of truth.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(id: string) {
    return this.prisma.return.findUnique({ where: { id } });
  }

  list(status?: string) {
    return this.prisma.return.findMany({
      where: status ? { status: status as ReturnStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listByCustomer(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      select: { id: true, total: true, createdAt: true, items: true },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    const returns = await this.prisma.return.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return returns.map((ret) => ({ ...ret, order: byId.get(ret.orderId)! }));
  }

  async request(orderId: string, reason: string, requester?: string, expectedCustomerId?: string, idempotencyKey?: string) {
    const key = idempotencyKey?.trim() || undefined;
    if (key) {
      const existing = await this.prisma.return.findUnique({ where: { idempotencyKey: key } });
      if (existing) return replayReturn(existing, orderId, reason);
    }
    return this.audit.transaction(async (tx) => {
      if (key) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'return:' + key}))::text AS locked`;
        const replay = await tx.return.findUnique({ where: { idempotencyKey: key } });
        if (replay) return { result: replayReturn(replay, orderId, reason), events: [] };
      }
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      if (expectedCustomerId && order.customerId !== expectedCustomerId) {
        throw new ForbiddenError('return_order_forbidden', 'Нельзя оформить возврат по чужому заказу');
      }
      const actor = requester ?? order.customerId;
      const ret = await tx.return.create({
        data: { orderId, reason, status: 'requested', idempotencyKey: key },
      });
      return {
        result: ret,
        events: [
          {
            type: EventType.ReturnRequested,
            actor,
            payload: { returnId: ret.id, orderId, reason },
            refs: [ret.id, orderId],
          },
        ],
      };
    });
  }

  async transition(id: string, status: ReturnStatus, actor: string) {
    return this.audit.transaction(async (tx) => {
      const ret = await tx.return.findUnique({ where: { id } });
      if (!ret) {
        throw new ValidationError('return_not_found', `Возврат ${id} не найден`);
      }
      const updated = await tx.return.update({ where: { id }, data: { status } });
      const type =
        status === 'reconciled' || status === 'paid'
          ? EventType.ReturnCompleted
          : `return.${status}`;
      return {
        result: updated,
        events: [
          {
            type,
            actor,
            payload: { returnId: id, from: ret.status, to: status },
            refs: [id, ret.orderId],
          },
        ],
      };
    });
  }
}

function replayReturn(ret: ReturnRecord, orderId: string, reason: string) {
  if (ret.orderId !== orderId || ret.reason !== reason) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим возвратом');
  }
  return ret;
}
