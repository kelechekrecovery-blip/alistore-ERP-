import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  CountDto,
  CreateConsignmentPayoutDto,
  MovementDto,
  PayConsignmentPayoutDto,
  ReceiveConsignmentDto,
  ReceiveQuantityConsignmentDto,
  ReceiveDto,
  ReceiveQuantityDto,
  TransferDto,
  TransferQuantityDto,
} from './inventory.dto';
import { transferQuantityConsignmentOnTx } from './consignment-accounting';

/** write_off/adjust map to their Approval Rules Matrix action names. */
const ACTION_BY_TYPE: Record<MovementDto['type'], string> = {
  write_off: 'write_off',
  adjust: 'stock_adjust',
};

/**
 * Inventory movements. Write-off and stock adjustment are always approval-gated
 * (owner-approved with evidence per the matrix): they park an approval and the
 * movement is created only when the approval is approved. Inter-branch transfers
 * of an in_stock unit are routine (not gated) but write stock.moved to the ledger.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
  ) {}

  async movement(dto: MovementDto, requester: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    }
    if (product.trackingMode !== 'quantity') {
      throw new ValidationError('serialized_movement_requires_unit', 'Для серийного товара укажите конкретный IMEI');
    }
    const location = dto.location?.trim();
    if (!location) throw new ValidationError('location_required', 'Укажите склад корректировки');
    const direction = dto.type === 'write_off' ? 'decrease' : (dto.direction ?? 'increase');
    return this.approvals.request({
      action: ACTION_BY_TYPE[dto.type],
      requester,
      reason: dto.reason,
      payload: { productId: dto.productId, qty: dto.qty, location, direction, reason: dto.reason },
    });
  }

  /** Receive a batch of physical IMEI units into stock. */
  async receive(dto: ReceiveDto, actor: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    }
    if (product.trackingMode !== 'serialized') {
      throw new ValidationError('serialized_product_required', 'Для этого товара используется количественный учёт');
    }

    const imeis = dto.imeis.map((imei) => imei.trim()).filter(Boolean);
    if (imeis.length === 0) {
      throw new ValidationError('imei_required', 'Нужен хотя бы один IMEI');
    }
    if (new Set(imeis).size !== imeis.length) {
      throw new ValidationError('duplicate_imei', 'IMEI в партии не должны повторяться');
    }

    const existing = await this.prisma.deviceUnit.findMany({
      where: { imei: { in: imeis } },
      select: { imei: true },
    });
    if (existing.length > 0) {
      throw new ConflictError(
        'imei_already_exists',
        `IMEI уже есть в базе: ${existing.map((unit) => unit.imei).join(', ')}`,
      );
    }

    const unitCost = dto.unitCost ?? product.cost;
    return this.audit.transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          qty: imeis.length,
          type: 'received',
          to: dto.location,
          reason: dto.reason ?? null,
          unitCost,
          totalValue: imeis.length * unitCost,
        },
      });
      for (const imei of imeis) {
        await tx.deviceUnit.create({
          data: {
            imei,
            productId: dto.productId,
            status: 'in_stock',
            location: dto.location,
            grade: dto.grade,
            acquisitionCost: unitCost,
          },
        });
      }
      return {
        result: {
          productId: dto.productId,
          location: dto.location,
          received: imeis.length,
          imeis,
          movementId: movement.id,
        },
        events: [
          {
            type: EventType.StockReceived,
            actor,
            payload: { productId: dto.productId, location: dto.location, qty: imeis.length, movementId: movement.id },
            refs: [dto.productId, movement.id],
          },
          ...imeis.map((imei) => ({
            type: EventType.UnitReceived,
            actor,
            payload: { productId: dto.productId, imei, location: dto.location, grade: dto.grade ?? null },
            refs: [dto.productId, imei, movement.id],
          })),
        ],
      };
    });
  }

  /** Receive non-serialized stock into the authoritative balance for a location. */
  async receiveQuantity(dto: ReceiveQuantityDto, actor: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { _count: { select: { bundleComponents: true } } },
    });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    }
    if (product.trackingMode !== 'quantity') {
      throw new ValidationError('quantity_product_required', 'Для этого товара используется серийный учёт');
    }
    if (product._count.bundleComponents > 0) {
      throw new ValidationError('virtual_bundle_receive_forbidden', 'Виртуальный набор принимается по его компонентам');
    }
    const location = dto.location.trim();
    if (!location) throw new ValidationError('location_required', 'Укажите склад приёмки');

    return this.audit.transaction(async (tx) => {
      const unitCost = dto.unitCost ?? product.cost;
      const balance = await tx.inventoryBalance.upsert({
        where: { productId_location: { productId: dto.productId, location } },
        create: { productId: dto.productId, location, onHand: dto.quantity, inventoryValue: dto.quantity * unitCost },
        update: { onHand: { increment: dto.quantity }, inventoryValue: { increment: dto.quantity * unitCost } },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          qty: dto.quantity,
          type: 'received',
          to: location,
          reason: dto.reason?.trim() || null,
          unitCost,
          totalValue: dto.quantity * unitCost,
        },
      });
      await tx.inventoryValuationLayer.create({
        data: {
          productId: dto.productId,
          balanceId: balance.id,
          location,
          sourceType: 'inventory.receive',
          sourceRef: movement.id,
          unitCost,
          quantityReceived: dto.quantity,
          quantityRemaining: dto.quantity,
        },
      });
      return {
        result: {
          productId: dto.productId,
          location,
          received: dto.quantity,
          onHand: balance.onHand,
          reserved: balance.reserved,
          available: balance.onHand - balance.reserved,
          movementId: movement.id,
        },
        events: [{
          type: EventType.StockReceived,
          actor,
          payload: {
            productId: dto.productId,
            location,
            qty: dto.quantity,
            trackingMode: 'quantity',
            movementId: movement.id,
          },
          refs: [dto.productId, movement.id],
        }],
      };
    });
  }

  /** Receive one serialized unit owned by a third party and keep its liability separate. */
  async receiveConsignment(dto: ReceiveConsignmentDto, actor: string) {
    const existing = await this.prisma.consignmentItem.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { unit: true, product: true },
    });
    if (existing) {
      const samePayload = existing.productId === dto.productId
        && existing.unit.imei === dto.imei.trim()
        && existing.unit.location === dto.location.trim()
        && existing.ownerName === dto.ownerName.trim()
        && (existing.ownerContact ?? '') === (dto.ownerContact?.trim() ?? '')
        && existing.commissionBps === dto.commissionBps
        && (existing.unit.grade ?? null) === (dto.grade ?? null);
      if (!samePayload) throw new ConflictError('consignment_idempotency_mismatch', 'Ключ приёмки уже использован с другими данными');
      return existing;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { _count: { select: { includedInBundles: true, bundleComponents: true } } },
    });
    if (!product) throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    if (product.trackingMode !== 'serialized') {
      throw new ValidationError('serialized_product_required', 'Комиссионная приёмка пока поддерживает серийный товар');
    }
    if (product._count.includedInBundles > 0 || product._count.bundleComponents > 0) {
      throw new ValidationError('consignment_bundle_forbidden', 'Комиссионный товар нельзя использовать как виртуальный набор или его компонент');
    }
    const imei = dto.imei.trim();
    const ownerName = dto.ownerName.trim();
    const location = dto.location.trim();
    if (!imei || !ownerName || !location) throw new ValidationError('consignment_fields_required', 'Заполните IMEI, владельца и склад');
    if (await this.prisma.deviceUnit.findUnique({ where: { imei } })) {
      throw new ConflictError('imei_already_exists', `IMEI ${imei} уже есть в базе`);
    }

    return this.audit.transaction(async (tx) => {
      const unit = await tx.deviceUnit.create({
        data: { imei, productId: product.id, location, grade: dto.grade, status: 'in_stock' },
      });
      const item = await tx.consignmentItem.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          unitId: unit.id,
          productId: product.id,
          ownerName,
          ownerContact: dto.ownerContact?.trim() || null,
          commissionBps: dto.commissionBps,
          createdBy: actor,
        },
        include: { unit: true, product: true },
      });
      const movement = await tx.inventoryMovement.create({
        data: { productId: product.id, qty: 1, type: 'consignment_received', to: location, reason: ownerName },
      });
      return {
        result: item,
        events: [{
          type: EventType.ConsignmentReceived,
          actor,
          payload: {
            consignmentItemId: item.id,
            productId: product.id,
            imei,
            location,
            ownerName,
            commissionBps: dto.commissionBps,
          },
          refs: [item.id, product.id, imei, movement.id],
        }],
      };
    });
  }

  /** Receive homogeneous third-party stock while InventoryBalance remains authoritative. */
  async receiveQuantityConsignment(dto: ReceiveQuantityConsignmentDto, actor: string) {
    const normalized = {
      location: dto.location.trim(),
      ownerName: dto.ownerName.trim(),
      ownerContact: dto.ownerContact?.trim() || null,
    };
    if (!normalized.location || !normalized.ownerName) {
      throw new ValidationError('consignment_fields_required', 'Заполните владельца и склад');
    }
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { _count: { select: { includedInBundles: true, bundleComponents: true } } },
    });
    if (!product) throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    if (product.trackingMode !== 'quantity') {
      throw new ValidationError('quantity_product_required', 'Для серийного товара используйте приёмку по IMEI');
    }
    if (product._count.includedInBundles > 0 || product._count.bundleComponents > 0) {
      throw new ValidationError('consignment_bundle_forbidden', 'Комиссионный товар нельзя использовать в виртуальном наборе');
    }

    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'quantity-consignment:' + dto.idempotencyKey}))::text AS locked`;
      const existing = await tx.quantityConsignmentLot.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) {
        const same = existing.productId === dto.productId
          && existing.location === normalized.location
          && existing.ownerName === normalized.ownerName
          && existing.ownerContact === normalized.ownerContact
          && existing.commissionBps === dto.commissionBps
          && existing.receivedQty === dto.quantity;
        if (!same) throw new ConflictError('consignment_idempotency_mismatch', 'Ключ приёмки уже использован с другими данными');
        return { result: existing, events: [] };
      }
      const balance = await tx.inventoryBalance.upsert({
        where: { productId_location: { productId: dto.productId, location: normalized.location } },
        create: { productId: dto.productId, location: normalized.location, onHand: dto.quantity },
        update: { onHand: { increment: dto.quantity } },
      });
      const lot = await tx.quantityConsignmentLot.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          productId: dto.productId,
          balanceId: balance.id,
          location: normalized.location,
          ownerName: normalized.ownerName,
          ownerContact: normalized.ownerContact,
          commissionBps: dto.commissionBps,
          receivedQty: dto.quantity,
          availableQty: dto.quantity,
          createdBy: actor,
        },
        include: { product: { select: { id: true, sku: true, name: true, price: true } } },
      });
      const movement = await tx.inventoryMovement.create({
        data: { productId: dto.productId, qty: dto.quantity, type: 'consignment_received', to: normalized.location, reason: normalized.ownerName },
      });
      return {
        result: lot,
        events: [{
          type: EventType.ConsignmentReceived,
          actor,
          payload: { lotId: lot.id, productId: dto.productId, location: normalized.location, qty: dto.quantity, ownerName: normalized.ownerName, commissionBps: dto.commissionBps },
          refs: [lot.id, dto.productId, movement.id],
        }],
      };
    });
  }

  listConsignments() {
    return this.prisma.consignmentItem.findMany({
      include: {
        unit: { select: { imei: true, location: true, status: true } },
        product: { select: { id: true, sku: true, name: true, price: true } },
        saleOrder: { select: { id: true, status: true, createdAt: true } },
        payout: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listQuantityConsignments() {
    return this.prisma.quantityConsignmentLot.findMany({
      include: {
        product: { select: { id: true, sku: true, name: true, price: true } },
        allocations: {
          include: {
            saleOrder: { select: { id: true, status: true, createdAt: true } },
            payout: { select: { id: true, status: true, paidAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listConsignmentPayouts() {
    return this.prisma.consignmentPayout.findMany({
      include: {
        items: { select: { id: true, ownerAmount: true, saleOrderId: true } },
        quantityAllocations: { select: { id: true, ownerAmount: true, returnedOwnerAmount: true, saleOrderId: true, qty: true, returnedQty: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  listConsignmentAdjustments() {
    return Promise.all([
      this.prisma.consignmentAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.quantityConsignmentAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]).then(([serialized, quantity]) => [...serialized, ...quantity].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }

  async createConsignmentPayout(dto: CreateConsignmentPayoutDto, actor: string) {
    const existing = await this.prisma.consignmentPayout.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { items: true, quantityAllocations: true },
    });
    if (existing) {
      const requestedItems = [...new Set(dto.itemIds ?? [])].sort();
      const requestedQuantity = [...new Set(dto.quantityAllocationIds ?? [])].sort();
      if (!sameIds(requestedItems, existing.items.map((item) => item.id).sort())
        || !sameIds(requestedQuantity, existing.quantityAllocations.map((item) => item.id).sort())) {
        throw new ConflictError('consignment_idempotency_mismatch', 'Ключ выплаты уже использован с другим набором позиций');
      }
      return existing;
    }

    return this.audit.transaction(async (tx) => {
      const ids = [...new Set(dto.itemIds ?? [])];
      const quantityIds = [...new Set(dto.quantityAllocationIds ?? [])];
      if (ids.length + quantityIds.length === 0) {
        throw new ValidationError('consignment_items_required', 'Выберите хотя бы одну комиссионную продажу');
      }
      for (const itemId of [...ids].sort()) {
        await tx.$queryRaw`SELECT id FROM "ConsignmentItem" WHERE id = ${itemId} FOR UPDATE`;
      }
      for (const allocationId of [...quantityIds].sort()) {
        await tx.$queryRaw`SELECT id FROM "QuantityConsignmentAllocation" WHERE id = ${allocationId} FOR UPDATE`;
      }
      const items = await tx.consignmentItem.findMany({
        where: { id: { in: ids } },
        include: { saleOrder: { select: { id: true, status: true } } },
      });
      if (items.length !== ids.length) throw new ValidationError('consignment_not_found', 'Часть комиссионных позиций не найдена');
      const quantityAllocations = await tx.quantityConsignmentAllocation.findMany({
        where: { id: { in: quantityIds } },
        include: { lot: true, saleOrder: { select: { id: true, status: true } } },
      });
      if (quantityAllocations.length !== quantityIds.length) {
        throw new ValidationError('consignment_not_found', 'Часть количественных комиссионных продаж не найдена');
      }
      const owners = [
        ...items.map((item) => ({ name: item.ownerName, contact: item.ownerContact })),
        ...quantityAllocations.map((item) => ({ name: item.lot.ownerName, contact: item.lot.ownerContact })),
      ];
      const first = owners[0];
      if (owners.some((owner) => owner.name !== first.name || owner.contact !== first.contact)) {
        throw new ValidationError('consignment_owner_mismatch', 'Одна выплата может содержать позиции только одного владельца');
      }
      if (items.some((item) => item.status !== 'sold' || item.payoutId || item.saleOrder?.status !== 'completed')) {
        throw new ConflictError('consignment_not_settleable', 'Выплата доступна только для завершённых продаж без предыдущей выплаты');
      }
      if (quantityAllocations.some((item) => item.status !== 'sold' || item.payoutId || item.saleOrder?.status !== 'completed')) {
        throw new ConflictError('consignment_not_settleable', 'Выплата доступна только для завершённых продаж без предыдущей выплаты');
      }
      const orderIds = [
        ...items.flatMap((item) => item.saleOrderId ? [item.saleOrderId] : []),
        ...quantityAllocations.flatMap((item) => item.saleOrderId ? [item.saleOrderId] : []),
      ];
      const blockedReturn = await tx.return.findFirst({
        where: { orderId: { in: orderIds }, status: { notIn: ['rejected', 'reconciled'] } },
        select: { id: true },
      });
      if (blockedReturn) throw new ConflictError('consignment_return_pending', 'Нельзя выплатить владельцу при активном или согласованном возврате');
      const grossAmount = items.reduce((sum, item) => sum + (item.salePrice ?? 0), 0)
        + quantityAllocations.reduce((sum, item) => sum + (item.salePrice ?? 0) - item.returnedSaleAmount, 0);
      const commissionAmount = items.reduce((sum, item) => sum + (item.commissionAmount ?? 0), 0)
        + quantityAllocations.reduce((sum, item) => sum + (item.commissionAmount ?? 0) - item.returnedCommissionAmount, 0);
      const ownerAmount = items.reduce((sum, item) => sum + (item.ownerAmount ?? 0), 0)
        + quantityAllocations.reduce((sum, item) => sum + (item.ownerAmount ?? 0) - item.returnedOwnerAmount, 0);
      const payout = await tx.consignmentPayout.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          ownerName: first.name,
          ownerContact: first.contact,
          grossAmount,
          commissionAmount,
          ownerAmount,
          createdBy: actor,
          items: { connect: ids.map((id) => ({ id })) },
          quantityAllocations: { connect: quantityIds.map((id) => ({ id })) },
        },
        include: { items: true, quantityAllocations: true },
      });
      return {
        result: payout,
        events: [{
          type: EventType.ConsignmentPayoutCreated,
          actor,
          payload: { payoutId: payout.id, ownerName: payout.ownerName, grossAmount, commissionAmount, ownerAmount, items: ids.length, quantityAllocations: quantityIds.length },
          refs: [payout.id, ...ids, ...quantityIds, ...orderIds],
        }],
      };
    });
  }

  async payConsignmentPayout(id: string, dto: PayConsignmentPayoutDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ConsignmentPayout" WHERE id = ${id} FOR UPDATE`;
      const payout = await tx.consignmentPayout.findUnique({ where: { id }, include: { items: true, quantityAllocations: true } });
      if (!payout) throw new ValidationError('consignment_payout_not_found', `Выплата ${id} не найдена`);
      if (payout.status === 'cancelled') {
        throw new ConflictError('consignment_payout_cancelled', 'Отменённую выплату нельзя провести');
      }
      if (payout.status === 'paid') {
        if (payout.paymentKey !== dto.paymentKey) throw new ConflictError('consignment_payment_key_reused', 'Выплата уже проведена с другим ключом');
        return { result: payout, events: [] };
      }
      const duplicate = await tx.consignmentPayout.findUnique({ where: { paymentKey: dto.paymentKey } });
      if (duplicate && duplicate.id !== id) throw new ConflictError('consignment_payment_key_reused', 'Ключ платежа уже использован');
      const paid = await tx.consignmentPayout.update({
        where: { id },
        data: { status: 'paid', paymentKey: dto.paymentKey, paidBy: actor, paidAt: new Date() },
        include: { items: true, quantityAllocations: true },
      });
      await tx.consignmentItem.updateMany({ where: { payoutId: id, status: 'sold' }, data: { status: 'settled' } });
      await tx.quantityConsignmentAllocation.updateMany({ where: { payoutId: id, status: 'sold' }, data: { status: 'settled' } });
      return {
        result: paid,
        events: [{
          type: EventType.ConsignmentPayoutPaid,
          actor,
          payload: { payoutId: id, ownerName: paid.ownerName, ownerAmount: paid.ownerAmount, paymentKey: dto.paymentKey },
          refs: [id, ...paid.items.map((item) => item.id), ...paid.quantityAllocations.map((item) => item.id)],
        }],
      };
    });
  }

  /**
   * Take inventory for one product at a location: compare counted vs the in_stock
   * units on record (inventory.counted). A non-zero diff is recorded for follow-up;
   * the actual correction is a separate approval-gated stock adjustment.
   */
  async count(dto: CountDto, actor: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    }
    const expected = product.trackingMode === 'quantity'
      ? (await this.prisma.inventoryBalance.findUnique({
          where: { productId_location: { productId: dto.productId, location: dto.location } },
        }))?.onHand ?? 0
      : await this.prisma.deviceUnit.count({
          where: { productId: dto.productId, location: dto.location, status: 'in_stock' },
        });
    const diff = dto.counted - expected;
    return this.audit.transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          qty: diff,
          type: 'count',
          from: dto.location,
          reason: `counted ${dto.counted} vs expected ${expected}`,
        },
      });
      return {
        result: { productId: dto.productId, location: dto.location, expected, counted: dto.counted, diff, movementId: movement.id },
        events: [
          {
            type: EventType.InventoryCounted,
            actor,
            payload: { productId: dto.productId, location: dto.location, expected, counted: dto.counted, diff },
            refs: [dto.productId, movement.id],
          },
        ],
      };
    });
  }

  /** Move an in_stock unit to another branch/location (stock.moved). */
  async transfer(dto: TransferDto, actor: string) {
    const unit = await this.prisma.deviceUnit.findUnique({ where: { imei: dto.imei } });
    if (!unit) {
      throw new ValidationError('unit_not_found', `IMEI ${dto.imei} не найден`);
    }
    if (unit.status !== 'in_stock') {
      throw new ConflictError(
        'not_transferable',
        `IMEI ${dto.imei} нельзя перемещать (статус: ${unit.status})`,
      );
    }
    if (unit.location === dto.to) {
      throw new ValidationError('same_location', `IMEI ${dto.imei} уже на складе ${dto.to}`);
    }
    return this.audit.transaction(async (tx) => {
      const from = unit.location;
      await tx.deviceUnit.update({ where: { imei: dto.imei }, data: { location: dto.to } });
      const movement = await tx.inventoryMovement.create({
        data: { productId: unit.productId, qty: 1, type: 'moved', from, to: dto.to, reason: dto.reason ?? null },
      });
      return {
        result: { imei: dto.imei, from, to: dto.to, movementId: movement.id },
        events: [
          {
            type: EventType.StockMoved,
            actor,
            payload: { imei: dto.imei, from, to: dto.to, movementId: movement.id },
            refs: [dto.imei, unit.productId, movement.id],
          },
        ],
      };
    });
  }


  /** Move available quantity stock between two authoritative location balances exactly once. */
  async transferQuantity(dto: TransferQuantityDto, actor: string) {
    const existing = await this.prisma.inventoryMovement.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return replayQuantityTransfer(existing, dto);
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new ValidationError('product_not_found', `Товар ${dto.productId} не найден`);
    if (product.trackingMode !== 'quantity') {
      throw new ValidationError('quantity_product_required', 'Для серийного товара используйте перемещение по IMEI');
    }
    const from = dto.from.trim();
    const to = dto.to.trim();
    if (!from || !to) throw new ValidationError('location_required', 'Укажите склады отправления и назначения');
    if (from === to) throw new ValidationError('same_location', 'Склады отправления и назначения совпадают');

    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'quantity-transfer:' + dto.idempotencyKey}))::text AS locked`;
      const replay = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (replay) return { result: replayQuantityTransfer(replay, dto), events: [] };
      const source = await tx.inventoryBalance.findUnique({
        where: { productId_location: { productId: dto.productId, location: from } },
      });
      if (!source || source.onHand - source.reserved < dto.qty) {
        throw new ConflictError('insufficient_available_stock', `На складе ${from} недостаточно свободного остатка`);
      }
      await tx.inventoryBalance.update({
        where: { id: source.id },
        data: { onHand: { decrement: dto.qty } },
      });
      const destination = await tx.inventoryBalance.upsert({
        where: { productId_location: { productId: dto.productId, location: to } },
        create: { productId: dto.productId, location: to, onHand: dto.qty },
        update: { onHand: { increment: dto.qty } },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          productId: dto.productId,
          qty: dto.qty,
          type: 'moved',
          from,
          to,
          reason: dto.reason?.trim() || null,
        },
      });
      const consignmentQty = await transferQuantityConsignmentOnTx(tx, {
        movementId: movement.id,
        sourceBalanceId: source.id,
        destinationBalanceId: destination.id,
        destination: to,
        qty: dto.qty,
        actor,
      });
      return {
        result: {
          movementId: movement.id,
          productId: dto.productId,
          from,
          to,
          qty: dto.qty,
          consignmentQty,
          idempotent: false,
        },
        events: [{
          type: EventType.StockMoved,
          actor,
          payload: { movementId: movement.id, productId: dto.productId, trackingMode: 'quantity', from, to, qty: dto.qty, consignmentQty },
          refs: [movement.id, dto.productId],
        }],
      };
    });
  }
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function replayQuantityTransfer(movement: { id: string; productId: string; qty: number; type: string; from: string | null; to: string | null }, dto: TransferQuantityDto) {
  if (movement.type !== 'moved'
    || movement.productId !== dto.productId
    || movement.qty !== dto.qty
    || movement.from !== dto.from.trim()
    || movement.to !== dto.to.trim()) {
    throw new ConflictError('idempotency_key_reused', 'Ключ перемещения уже использован с другими данными');
  }
  return {
    movementId: movement.id,
    productId: movement.productId,
    from: movement.from,
    to: movement.to,
    qty: movement.qty,
    idempotent: true,
  };
}
