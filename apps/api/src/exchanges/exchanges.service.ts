import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { assertTransition } from '../orders/order-state-machine';
import { ExchangeDto } from './exchanges.dto';

/**
 * Обмен товара — atomic return + sale + surcharge in one transaction:
 *   old unit sold → returned, a Return(reconciled, exchange) is recorded, the
 *   original order → exchanged; a new paid order for the new device is created,
 *   its unit sold, and the price difference (доплата ≥ 0) collected as a payment.
 * A cheaper exchange (money back) is refused here — that path is a return + the
 * approval-gated refund, so cash-back never bypasses approval.
 */
@Injectable()
export class ExchangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exchange(dto: ExchangeDto, actor: string, idempotencyKey?: string) {
    const key = idempotencyKey?.trim() ? `exchange:${idempotencyKey.trim()}` : undefined;
    if (key) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
      if (existing) return this.replayExchange(existing, dto);
    }
    return this.audit.transaction(async (tx) => {
      if (key) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
        const existing = await tx.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
        if (existing) return { result: await this.replayExchange(existing, dto, tx), events: [] };
      }
      const order = await tx.order.findUnique({
        where: { id: dto.originalOrderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${dto.originalOrderId} не найден`);
      }
      const oldItem = order.items.find((i) => i.imei === dto.oldImei);
      if (!oldItem) {
        throw new ValidationError('item_not_found', `IMEI ${dto.oldImei} не в этом заказе`);
      }
      const oldUnit = await tx.deviceUnit.findUnique({ where: { imei: dto.oldImei } });
      if (!oldUnit || oldUnit.status !== 'sold') {
        throw new ConflictError('not_exchangeable', `IMEI ${dto.oldImei} не продан — обмен невозможен`);
      }
      assertTransition(order.status, 'exchanged');

      const newProduct = await tx.product.findUnique({ where: { id: dto.newProductId } });
      if (!newProduct) {
        throw new ValidationError('product_not_found', 'Новый товар не найден');
      }
      const surcharge = newProduct.price - oldItem.price;
      if (surcharge < 0) {
        throw new ValidationError(
          'exchange_needs_refund',
          'Новый товар дешевле — оформите возврат + refund (через approval)',
        );
      }
      const newUnit = await tx.deviceUnit.findFirst({
        where: { productId: newProduct.id, status: 'in_stock' },
        orderBy: { id: 'asc' },
      });
      if (!newUnit) {
        throw new ConflictError('no_stock', `Нет свободных единиц ${newProduct.sku}`);
      }

      const events: AuditInput[] = [];

      // 1) return the old unit
      await tx.deviceUnit.update({
        where: { imei: dto.oldImei },
        data: { status: 'returned', orderId: null },
      });
      events.push({
        type: EventType.UnitReturned,
        actor,
        payload: { imei: dto.oldImei, orderId: order.id },
        refs: [order.id, dto.oldImei],
      });
      const ret = await tx.return.create({
        data: { orderId: order.id, reason: 'обмен', status: 'reconciled' },
      });
      events.push({
        type: EventType.ReturnCompleted,
        actor,
        payload: { returnId: ret.id, orderId: order.id, kind: 'exchange' },
        refs: [ret.id, order.id],
      });

      // 2) new paid order for the new device
      const newOrder = await tx.order.create({
        data: {
          customerId: order.customerId,
          idempotencyKey: key,
          channel: 'exchange',
          total: newProduct.price,
          status: 'paid',
          items: { create: [{ sku: newProduct.sku, qty: 1, price: newProduct.price, imei: newUnit.imei }] },
        },
      });
      await tx.deviceUnit.update({
        where: { imei: newUnit.imei },
        data: { status: 'sold', orderId: newOrder.id },
      });
      events.push(
        { type: EventType.OrderCreated, actor, payload: { orderId: newOrder.id, channel: 'exchange' }, refs: [newOrder.id] },
        { type: EventType.UnitSold, actor, payload: { orderId: newOrder.id, imei: newUnit.imei }, refs: [newOrder.id, newUnit.imei] },
        { type: EventType.OrderPaid, actor, payload: { orderId: newOrder.id, total: newProduct.price }, refs: [newOrder.id] },
      );

      // 3) collect surcharge (доплата)
      if (surcharge > 0) {
        const payment = await tx.payment.create({
          data: { orderId: newOrder.id, amount: surcharge, method: dto.method, status: 'received' },
        });
        events.push({
          type: EventType.PaymentReceived,
          actor,
          payload: { orderId: newOrder.id, amount: surcharge, method: dto.method, kind: 'exchange_surcharge' },
          refs: [newOrder.id, payment.id],
        });
      }

      // 4) original order → exchanged
      await tx.order.update({ where: { id: order.id }, data: { status: 'exchanged' } });
      events.push({
        type: EventType.OrderExchanged,
        actor,
        payload: { orderId: order.id, into: newOrder.id, oldImei: dto.oldImei, newImei: newUnit.imei },
        refs: [order.id, newOrder.id],
      });

      return {
        result: {
          exchangeOrderId: newOrder.id,
          returnId: ret.id,
          surcharge,
          oldImei: dto.oldImei,
          newImei: newUnit.imei,
          idempotent: false,
        },
        events,
      };
    });
  }

  private async replayExchange(
    exchangeOrder: { id: string; items: { sku: string; imei: string | null }[] },
    dto: ExchangeDto,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const [product, event, ret, payment] = await Promise.all([
      db.product.findUnique({ where: { id: dto.newProductId } }),
      db.auditEvent.findFirst({ where: { type: EventType.OrderExchanged, refs: { has: exchangeOrder.id } }, orderBy: { ts: 'desc' } }),
      db.return.findFirst({ where: { orderId: dto.originalOrderId, reason: 'обмен' }, orderBy: { createdAt: 'desc' } }),
      db.payment.findFirst({ where: { orderId: exchangeOrder.id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const payload = (event?.payload ?? {}) as Record<string, unknown>;
    if (
      !product || exchangeOrder.items[0]?.sku !== product.sku ||
      payload.orderId !== dto.originalOrderId || payload.oldImei !== dto.oldImei || !ret
    ) {
      throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован для другого обмена');
    }
    return {
      exchangeOrderId: exchangeOrder.id,
      returnId: ret.id,
      surcharge: payment?.amount ?? 0,
      oldImei: dto.oldImei,
      newImei: exchangeOrder.items[0]?.imei ?? String(payload.newImei ?? ''),
      idempotent: true,
    };
  }
}
