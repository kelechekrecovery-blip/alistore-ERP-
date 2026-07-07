import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { CreateProductReviewDto } from './products.dto';

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

  async reviews(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.archived) {
      throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
    }

    const [summary, items] = await this.prisma.$transaction([
      this.prisma.productReview.aggregate({
        where: { productId },
        _count: { _all: true },
        _avg: { rating: true },
      }),
      this.prisma.productReview.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const avg = summary._avg.rating;
    return {
      productId,
      sku: product.sku,
      count: summary._count._all,
      avgRating: avg === null ? null : Math.round(avg * 10) / 10,
      items: items.map((review) => ({
        id: review.id,
        rating: review.rating,
        text: review.text,
        customerName: review.customerName,
        createdAt: review.createdAt,
      })),
    };
  }

  async createReview(productId: string, user: AuthPrincipal, dto: CreateProductReviewDto) {
    if (user.typ !== 'customer') {
      throw new ForbiddenError('customer_token_required', 'Отзывы оставляют только клиенты');
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.archived) {
      throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
    }

    const order = await this.prisma.order.findFirst({
      where: {
        customerId: user.customerId,
        ...(dto.orderId ? { id: dto.orderId } : {}),
        status: { in: ['paid', 'completed'] },
        items: { some: { sku: product.sku } },
      },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, phone: true } } },
    });
    if (!order) {
      throw new ForbiddenError('review_purchase_required', 'Отзыв доступен после покупки товара');
    }

    const existing = await this.prisma.productReview.findUnique({
      where: {
        productId_customerId_orderId: {
          productId,
          customerId: user.customerId,
          orderId: order.id,
        },
      },
    });
    if (existing) {
      throw new ConflictError('review_already_exists', 'Отзыв по этому заказу уже оставлен');
    }

    const text = dto.text?.trim() || null;
    const customerName = order.customer.name.trim() || this.maskPhone(order.customer.phone);
    return this.prisma.productReview.create({
      data: {
        productId,
        sku: product.sku,
        customerId: user.customerId,
        customerName,
        orderId: order.id,
        rating: dto.rating,
        text,
      },
    });
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

  private maskPhone(phone: string): string {
    return phone.length > 4 ? `Клиент ${phone.slice(-4)}` : 'Клиент';
  }
}
