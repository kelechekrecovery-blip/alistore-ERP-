import { Injectable } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';

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

  async request(orderId: string, reason: string, requester: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      const ret = await tx.return.create({
        data: { orderId, reason, status: 'requested' },
      });
      return {
        result: ret,
        events: [
          {
            type: EventType.ReturnRequested,
            actor: requester,
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
