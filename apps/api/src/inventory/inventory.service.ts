import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import { MovementDto } from './inventory.dto';

/** write_off/adjust map to their Approval Rules Matrix action names. */
const ACTION_BY_TYPE: Record<MovementDto['type'], string> = {
  write_off: 'write_off',
  adjust: 'stock_adjust',
};

/**
 * Inventory movements. Write-off and stock adjustment are always approval-gated
 * (owner-approved with evidence per the matrix): they park an approval and the
 * movement is created only when the approval is approved.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
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
}
