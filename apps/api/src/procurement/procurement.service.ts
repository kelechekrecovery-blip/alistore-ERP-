import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Grade, Prisma, PurchaseOrderStatus } from '@prisma/client';
import { AuditService, AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from './procurement.dto';
import { assertCanCancel, assertCanReceive, assertCanSend } from './purchase-order-state';

const DETAIL_INCLUDE = {
  supplier: { select: { id: true, name: true, contact: true } },
  items: {
    include: { product: { select: { id: true, sku: true, name: true } } },
    orderBy: { id: 'asc' as const },
  },
  receipts: { select: { id: true, idempotencyKey: true, actor: true, createdAt: true }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(status?: string) {
    const allowed: PurchaseOrderStatus[] = ['draft', 'sent', 'receiving', 'received', 'cancelled'];
    if (status && !allowed.includes(status as PurchaseOrderStatus)) {
      throw new ValidationError('invalid_purchase_order_status', `Неизвестный статус PO: ${status}`);
    }
    return this.prisma.purchaseOrder.findMany({
      where: status ? { status: status as PurchaseOrderStatus } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!order) throw new ValidationError('purchase_order_not_found', `PO ${id} не найден`);
    return order;
  }

  async create(dto: CreatePurchaseOrderDto, actor: string) {
    const location = dto.location.trim();
    const note = dto.note?.trim() || null;
    if (!location) {
      throw new ValidationError('purchase_order_location_required', 'Укажите склад назначения');
    }
    const productIds = dto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new ValidationError('duplicate_purchase_order_product', 'Один товар нельзя добавить в PO дважды');
    }
    const existing = await this.prisma.purchaseOrder.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: DETAIL_INCLUDE,
    });
    if (existing) return replayCreatedOrder(existing, dto, location, note);

    const [supplier, products] = await Promise.all([
      this.prisma.supplier.findUnique({ where: { id: dto.supplierId } }),
      this.prisma.product.findMany({ where: { id: { in: productIds }, archived: false }, select: { id: true } }),
    ]);
    if (!supplier) throw new ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
    if (products.length !== productIds.length) {
      throw new ValidationError('purchase_order_product_not_found', 'Один или несколько товаров не найдены');
    }
    const number = purchaseOrderNumber();
    try {
      return await this.audit.transaction(async (tx) => {
        const order = await tx.purchaseOrder.create({
          data: {
            number,
            idempotencyKey: dto.idempotencyKey,
            supplierId: dto.supplierId,
            location,
            note,
            createdBy: actor,
            items: { create: dto.items.map((item) => ({ productId: item.productId, orderedQty: item.qty, unitCost: item.unitCost })) },
          },
          include: DETAIL_INCLUDE,
        });
        return {
          result: order,
          events: [{
            type: EventType.PurchaseOrderCreated,
            actor,
            payload: { purchaseOrderId: order.id, number, supplierId: dto.supplierId, location: order.location, items: dto.items.length },
            refs: [order.id, dto.supplierId, ...productIds],
          }],
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.purchaseOrder.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: DETAIL_INCLUDE,
        });
        if (replay) return replayCreatedOrder(replay, dto, location, note);
      }
      throw error;
    }
  }

  send(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new ValidationError('purchase_order_not_found', `PO ${id} не найден`);
      assertCanSend(order.status);
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'sent', sentAt: new Date() }, include: DETAIL_INCLUDE });
      return {
        result: updated,
        events: [{ type: EventType.PurchaseOrderSent, actor, payload: { purchaseOrderId: id, number: order.number }, refs: [id, order.supplierId] }],
      };
    });
  }

  cancel(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new ValidationError('purchase_order_not_found', `PO ${id} не найден`);
      assertCanCancel(order.status);
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: 'cancelled' }, include: DETAIL_INCLUDE });
      return {
        result: updated,
        events: [{ type: EventType.PurchaseOrderCancelled, actor, payload: { purchaseOrderId: id, from: order.status }, refs: [id, order.supplierId] }],
      };
    });
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto, actor: string) {
    const itemIds = dto.lines.map((line) => line.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new ValidationError('duplicate_purchase_order_item', 'Строка PO повторяется в приёмке');
    }
    const normalizedLines = dto.lines.map((line) => ({ ...line, imeis: line.imeis.map((imei) => imei.trim()).filter(Boolean) }));
    const allImeis = normalizedLines.flatMap((line) => line.imeis);
    if (normalizedLines.some((line) => line.imeis.length === 0) || new Set(allImeis).size !== allImeis.length) {
      throw new ValidationError('duplicate_or_empty_imei', 'IMEI должны быть непустыми и уникальными в приёмке');
    }
    if (allImeis.length > 200) {
      throw new ValidationError('purchase_receipt_too_large', 'За одну приёмку можно принять не более 200 устройств');
    }
    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
        const existing = await tx.purchaseReceipt.findUnique({
          where: { purchaseOrderId_idempotencyKey: { purchaseOrderId: id, idempotencyKey: dto.idempotencyKey } },
        });
        if (existing) {
          if (receiptPayloadFingerprint(existing.payload) !== receiptPayloadFingerprint(normalizedLines)) {
            throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим составом приёмки');
          }
          const replayed = await tx.purchaseOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
          if (!replayed) throw new ValidationError('purchase_order_not_found', `PO ${id} не найден`);
          return { result: { ...replayed, idempotent: true, receiptId: existing.id }, events: [] };
        }

        const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
        if (!order) throw new ValidationError('purchase_order_not_found', `PO ${id} не найден`);
        assertCanReceive(order.status);
        const byId = new Map(order.items.map((item) => [item.id, item]));
        for (const line of normalizedLines) {
          const item = byId.get(line.itemId);
          if (!item) throw new ValidationError('purchase_order_item_not_found', `Строка ${line.itemId} не принадлежит PO`);
          if (item.receivedQty + line.imeis.length > item.orderedQty) {
            throw new ConflictError('purchase_order_over_receipt', `По строке ${line.itemId} принято больше заказанного`);
          }
        }
        const duplicateUnits = await tx.deviceUnit.findMany({ where: { imei: { in: allImeis } }, select: { imei: true } });
        if (duplicateUnits.length) {
          throw new ConflictError('imei_already_exists', `IMEI уже есть в базе: ${duplicateUnits.map((unit) => unit.imei).join(', ')}`);
        }

        const receipt = await tx.purchaseReceipt.create({
          data: { purchaseOrderId: id, idempotencyKey: dto.idempotencyKey, actor, payload: normalizedLines },
        });
        const events: AuditInput[] = [];
        const nextReceived = new Map(order.items.map((item) => [item.id, item.receivedQty]));
        for (const line of normalizedLines) {
          const item = byId.get(line.itemId)!;
          await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: line.imeis.length } } });
          const movement = await tx.inventoryMovement.create({
            data: { productId: item.productId, qty: line.imeis.length, type: 'received', to: order.location, reason: order.number },
          });
          await tx.deviceUnit.createMany({
            data: line.imeis.map((imei) => ({ imei, productId: item.productId, status: 'in_stock', location: order.location, grade: (line.grade ?? null) as Grade | null })),
          });
          nextReceived.set(item.id, item.receivedQty + line.imeis.length);
          events.push({
            type: EventType.StockReceived,
            actor,
            payload: { purchaseOrderId: id, receiptId: receipt.id, productId: item.productId, qty: line.imeis.length, location: order.location, movementId: movement.id },
            refs: [id, receipt.id, item.productId, movement.id],
          });
          events.push(...line.imeis.map((imei) => ({
            type: EventType.UnitReceived,
            actor,
            payload: { purchaseOrderId: id, receiptId: receipt.id, productId: item.productId, imei, location: order.location, grade: line.grade ?? null },
            refs: [id, receipt.id, item.productId, imei],
          })));
        }
        const complete = order.items.every((item) => nextReceived.get(item.id) === item.orderedQty);
        const status: PurchaseOrderStatus = complete ? 'received' : 'receiving';
        const updated = await tx.purchaseOrder.update({
          where: { id },
          data: { status, ...(complete ? { receivedAt: new Date() } : {}) },
          include: DETAIL_INCLUDE,
        });
        events.push({
          type: complete ? EventType.PurchaseOrderReceived : EventType.PurchaseOrderReceiving,
          actor,
          payload: { purchaseOrderId: id, receiptId: receipt.id, status, units: allImeis.length },
          refs: [id, receipt.id, order.supplierId, ...allImeis],
        });
        return { result: { ...updated, idempotent: false, receiptId: receipt.id }, events };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('imei_already_exists', 'Один или несколько IMEI уже приняты');
      }
      throw error;
    }
  }
}

function purchaseOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `PO-${date}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function replayCreatedOrder(
  order: Prisma.PurchaseOrderGetPayload<{ include: typeof DETAIL_INCLUDE }>,
  dto: CreatePurchaseOrderDto,
  location: string,
  note: string | null,
) {
  const expectedItems = dto.items
    .map((item) => `${item.productId}:${item.qty}:${item.unitCost}`)
    .sort();
  const actualItems = order.items
    .map((item) => `${item.productId}:${item.orderedQty}:${item.unitCost}`)
    .sort();
  const samePayload = order.supplierId === dto.supplierId
    && order.location === location
    && order.note === note
    && JSON.stringify(actualItems) === JSON.stringify(expectedItems);
  if (!samePayload) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим Purchase Order');
  }
  return { ...order, idempotent: true };
}

function receiptPayloadFingerprint(payload: unknown): string {
  if (!Array.isArray(payload)) return '';
  return JSON.stringify(payload.map((value) => {
    if (!value || typeof value !== 'object') return null;
    const line = value as Record<string, unknown>;
    return {
      itemId: typeof line.itemId === 'string' ? line.itemId : '',
      grade: typeof line.grade === 'string' ? line.grade : null,
      imeis: Array.isArray(line.imeis) ? line.imeis.filter((imei): imei is string => typeof imei === 'string') : [],
    };
  }));
}
