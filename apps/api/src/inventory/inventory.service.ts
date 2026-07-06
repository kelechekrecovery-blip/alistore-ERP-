import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import { MovementDto, TransferDto } from './inventory.dto';

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
