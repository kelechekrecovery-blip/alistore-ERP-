import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';

/** Price change beyond ±15% needs approval (Approval Rules Matrix). */
const PRICE_APPROVAL_THRESHOLD_PCT = 15;

/**
 * Product mutations with the Approval Rules Matrix applied:
 *  - price change within ±15% applies directly; beyond → parked for approval;
 *  - delete is always approval-gated and resolves to a soft-delete (archived).
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
  ) {}

  get(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async changePrice(productId: string, newPrice: number, reason: string, requester: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
    }
    const deltaPct =
      product.price === 0 ? Infinity : (Math.abs(newPrice - product.price) / product.price) * 100;

    if (deltaPct > PRICE_APPROVAL_THRESHOLD_PCT) {
      return this.approvals.request({
        action: 'price',
        requester,
        reason,
        payload: { productId, newPrice, oldPrice: product.price },
      });
    }

    // within threshold — apply directly
    return this.audit.transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: { price: newPrice },
      });
      return {
        result: { applied: true as const, productId, price: updated.price },
        events: [
          {
            type: EventType.PriceChanged,
            actor: requester,
            payload: { productId, from: product.price, to: newPrice },
            refs: [productId],
          },
        ],
      };
    });
  }

  /** Delete is always gated; on approval it becomes a soft-delete (archived). */
  async archive(productId: string, reason: string, requester: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
    }
    return this.approvals.request({
      action: 'delete',
      requester,
      reason,
      payload: { productId },
    });
  }
}
