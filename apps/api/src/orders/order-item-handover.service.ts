import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { handOverReadyOrderItemOnTx } from './order-item-handover-on-tx';
import { deriveOrderStatusFromLineFulfillment } from './order-state-machine';

type OrderItemHandoverResult = {
  orderId: string;
  orderItemId: string;
  fulfillmentStatus: 'handed_over';
  handedOverAt: string;
  orderStatus: string;
  accountingEntryId: string;
};

@Injectable()
export class OrderItemHandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async handOver(
    orderId: string,
    orderItemId: string,
    actor: string,
    idempotencyKey: string,
  ): Promise<OrderItemHandoverResult> {
    if (this.config?.get<string>('SUPPLY_PARTIAL_HANDOVER_ENABLED')?.trim().toLowerCase() !== 'true') {
      throw new ConflictError('supply_partial_handover_disabled', 'Построчная выдача пока не включена');
    }
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) {
      throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    }
    const fingerprint = JSON.stringify({ actor, orderId, orderItemId });
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order-item-handover:' + key}))`;
      const replay = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (
          replay.resourceType !== 'order-item.handover'
          || replay.resourceId !== orderItemId
          || replay.fingerprint !== fingerprint
        ) {
          throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой операцией');
        }
        return { result: replay.response as unknown as OrderItemHandoverResult, events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, fulfillmentType: true, paymentMode: true, isDemo: true },
      });
      if (!order) throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      if (order.isDemo) throw new ValidationError('demo_order_blocked', 'Демо-заказ нельзя выдать');
      if (!['pickup', 'store'].includes(order.fulfillmentType)) {
        throw new ConflictError('order_item_handover_pickup_only', 'Построчная выдача доступна только для самовывоза');
      }
      const events: AuditInput[] = [];
      const outcome = await handOverReadyOrderItemOnTx(tx, {
        orderId,
        orderItemId,
        paymentMode: order.paymentMode,
        actor,
        units: this.units,
        events,
      });
      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { fulfillmentStatus: true },
      });
      const orderStatus = deriveOrderStatusFromLineFulfillment(
        orderItems.map((item) => item.fulfillmentStatus),
      );
      if (orderStatus !== order.status) {
        await tx.order.update({ where: { id: orderId }, data: { status: orderStatus } });
      }
      const result: OrderItemHandoverResult = {
        orderId,
        orderItemId,
        fulfillmentStatus: 'handed_over',
        handedOverAt: outcome.item.handedOverAt!.toISOString(),
        orderStatus,
        accountingEntryId: outcome.accountingEntry.id,
      };
      await tx.storeOperationCommand.create({
        data: {
          idempotencyKey: key,
          resourceType: 'order-item.handover',
          resourceId: orderItemId,
          fingerprint,
          response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        },
      });
      return { result, events };
    });
  }
}
