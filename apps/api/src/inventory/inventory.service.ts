import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import { CountDto, MovementDto, ReceiveDto, ReceiveQuantityDto, TransferDto } from './inventory.dto';

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
    return this.approvals.request({
      action: ACTION_BY_TYPE[dto.type],
      requester,
      reason: dto.reason,
      payload: { productId: dto.productId, qty: dto.qty, reason: dto.reason },
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

    return this.audit.transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          qty: imeis.length,
          type: 'received',
          to: dto.location,
          reason: dto.reason ?? null,
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
      const balance = await tx.inventoryBalance.upsert({
        where: { productId_location: { productId: dto.productId, location } },
        create: { productId: dto.productId, location, onHand: dto.quantity },
        update: { onHand: { increment: dto.quantity } },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          qty: dto.quantity,
          type: 'received',
          to: location,
          reason: dto.reason?.trim() || null,
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
}
