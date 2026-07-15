import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { assertTaxClassification } from '../finance/sales-tax';
import { ApprovalsService } from '../approvals/approvals.service';
import { ModerationService } from '../ai/moderation.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
import {
  CreateProductDto,
  CreateProductReviewDto,
  ModerateProductReviewDto,
  ProductBundleComponentDto,
  ProductListQueryDto,
  UpdateProductDto,
} from './products.dto';

/** Price change beyond ±15% needs approval (Approval Rules Matrix). */
const PRICE_APPROVAL_THRESHOLD_PCT = 15;

type ProductWithStockCount = Prisma.ProductGetPayload<{
  include: {
    _count: {
      select: {
        units: {
          where: {
            status: 'in_stock';
          };
        };
      };
    };
    balances: true;
    bundleComponents: {
      include: {
        componentProduct: {
          include: {
            balances: true;
            _count: {
              select: {
                units: {
                  where: { status: 'in_stock' };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

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
    @Optional() private readonly moderation?: ModerationService,
  ) {}

  get(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async list(query: ProductListQueryDto) {
    const normalized = {
      q: query.q?.trim() || undefined,
      includeArchived: query.includeArchived ?? false,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
    const where: Prisma.ProductWhereInput = {
      ...(normalized.includeArchived ? {} : { archived: false }),
      ...(normalized.q
        ? {
            OR: [
              { name: { contains: normalized.q, mode: 'insensitive' } },
              { sku: { contains: normalized.q, mode: 'insensitive' } },
              { barcode: { contains: normalized.q, mode: 'insensitive' } },
              { variantGroup: { contains: normalized.q, mode: 'insensitive' } },
              { category: { contains: normalized.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: normalized.offset,
        take: normalized.limit,
        orderBy: [{ archived: 'asc' }, { category: 'asc' }, { name: 'asc' }],
        include: this.stockCountInclude(),
      }),
    ]);

    return {
      total,
      limit: normalized.limit,
      offset: normalized.offset,
      items: products.map((product) => this.toAdminProduct(product)),
    };
  }

  async create(dto: CreateProductDto, requester: string) {
    const sku = dto.sku.trim();
    const name = dto.name.trim();
    const category = dto.category.trim();
    const barcode = this.optionalValue(dto.barcode);
    const variantGroup = this.optionalValue(dto.variantGroup);
    const taxCode = dto.taxCode?.trim() || 'vat_standard';
    const taxRateBps = dto.taxRateBps ?? 1200;
    assertTaxClassification({ taxCode, taxRateBps });
    if (!sku || !name || !category) {
      throw new ValidationError('product_fields_required', 'SKU, название и категория обязательны');
    }

    const existing = await this.prisma.product.findUnique({ where: { sku } });
    if (existing) {
      throw new ConflictError('product_sku_exists', `SKU ${sku} уже существует`);
    }
    if (barcode && await this.prisma.product.findUnique({ where: { barcode } })) {
      throw new ConflictError('product_barcode_exists', `Штрихкод ${barcode} уже существует`);
    }

    return this.audit.transaction(async (tx) => {
      const bundleComponents = await this.resolveBundleComponents(tx, sku, dto.bundleComponents);
      const product = await tx.product.create({
        data: {
          sku,
          barcode,
          variantGroup,
          name,
          price: dto.price,
          cost: dto.cost,
          category,
          taxCode,
          taxRateBps,
          trackingMode: dto.trackingMode ?? 'serialized',
          attrs: (dto.attrs ?? {}) as Prisma.InputJsonValue,
          ...(bundleComponents.length > 0
            ? { bundleComponents: { create: bundleComponents } }
            : {}),
        },
        include: this.stockCountInclude(),
      });
      return {
        result: this.toAdminProduct(product),
        events: [
          {
            type: EventType.ProductCreated,
            actor: requester,
            payload: {
              productId: product.id,
              sku,
              barcode,
              variantGroup,
              name,
              price: dto.price,
              cost: dto.cost,
              category,
              taxCode,
              taxRateBps,
              trackingMode: product.trackingMode,
            },
            refs: [product.id, sku],
          },
        ],
      };
    });
  }

  async update(productId: string, dto: UpdateProductDto, requester: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.barcode !== undefined) {
      const barcode = this.optionalValue(dto.barcode);
      if (barcode) {
        const existing = await this.prisma.product.findUnique({ where: { barcode } });
        if (existing && existing.id !== productId) {
          throw new ConflictError('product_barcode_exists', `Штрихкод ${barcode} уже существует`);
        }
      }
      data.barcode = barcode;
    }
    if (dto.variantGroup !== undefined) data.variantGroup = this.optionalValue(dto.variantGroup);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new ValidationError('product_name_required', 'Название товара обязательно');
      data.name = name;
    }
    if (dto.cost !== undefined) data.cost = dto.cost;
    if (dto.category !== undefined) {
      const category = dto.category.trim();
      if (!category) throw new ValidationError('product_category_required', 'Категория обязательна');
      data.category = category;
    }
    if (dto.taxCode !== undefined || dto.taxRateBps !== undefined) {
      const taxCode = dto.taxCode?.trim() || product.taxCode;
      const taxRateBps = dto.taxRateBps ?? product.taxRateBps;
      assertTaxClassification({ taxCode, taxRateBps });
      data.taxCode = taxCode;
      data.taxRateBps = taxRateBps;
    }
    if (dto.trackingMode !== undefined && dto.trackingMode !== product.trackingMode) {
      const [unitCount, balanceCount, bundleUse] = await Promise.all([
        this.prisma.deviceUnit.count({ where: { productId } }),
        this.prisma.inventoryBalance.count({ where: { productId, onHand: { gt: 0 } } }),
        this.prisma.productBundleComponent.count({ where: { componentProductId: productId } }),
      ]);
      if (unitCount > 0 || balanceCount > 0 || bundleUse > 0) {
        throw new ConflictError(
          'tracking_mode_in_use',
          'Тип складского учёта нельзя менять при наличии остатков или использовании в наборе',
        );
      }
      data.trackingMode = dto.trackingMode;
    }
    if (dto.attrs !== undefined) data.attrs = dto.attrs as Prisma.InputJsonValue;

    return this.audit.transaction(async (tx) => {
      if (dto.bundleComponents !== undefined) {
        const components = await this.resolveBundleComponents(tx, product.sku, dto.bundleComponents);
        if (components.length > 0) {
          const [directStock, componentUse] = await Promise.all([
            tx.deviceUnit.count({ where: { productId } }),
            tx.productBundleComponent.count({ where: { componentProductId: productId } }),
          ]);
          if (directStock > 0) {
            throw new ValidationError(
              'bundle_has_direct_stock',
              'Товар с собственными складскими единицами нельзя превратить в виртуальный набор',
            );
          }
          if (componentUse > 0) {
            throw new ValidationError(
              'bundle_component_in_use',
              'Компонент существующего набора нельзя превратить во вложенный набор',
            );
          }
        }
        data.bundleComponents = { deleteMany: {}, create: components };
      }
      const updated = await tx.product.update({
        where: { id: productId },
        data,
        include: this.stockCountInclude(),
      });
      return {
        result: this.toAdminProduct(updated),
        events: [
          {
            type: EventType.ProductUpdated,
            actor: requester,
            payload: {
              productId,
              sku: product.sku,
              changes: Object.keys(data),
            },
            refs: [productId, product.sku],
          },
        ],
      };
    });
  }

  async reviews(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.archived) {
      throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
    }

    const [summary, items] = await this.prisma.$transaction([
      this.prisma.productReview.aggregate({
        where: { productId, status: 'approved' },
        _count: { _all: true },
        _avg: { rating: true },
      }),
      this.prisma.productReview.findMany({
        where: { productId, status: 'approved' },
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

    // AI moderation runs BEFORE the transaction (an LLM call must not hold a DB tx open).
    // It never throws — falls back to keyless rules / no-op without a provider key. When it
    // blocks, the review is created already rejected; clean text stays 'pending' for the
    // existing human moderation queue.
    const verdict = text && this.moderation ? await this.moderation.moderate(text) : null;
    const rejected = verdict ? !verdict.allowed : false;
    const moderationReason = rejected ? verdict!.reason || verdict!.categories.join(', ') : null;

    return this.audit.transaction(async (tx) => {
      const review = await tx.productReview.create({
        data: {
          productId,
          sku: product.sku,
          customerId: user.customerId,
          customerName,
          orderId: order.id,
          rating: dto.rating,
          text,
          status: rejected ? 'rejected' : 'pending',
          ...(rejected ? { moderatedBy: 'ai', moderatedAt: new Date(), moderationReason } : {}),
        },
      });
      const events: AuditInput[] = [
        {
          type: EventType.ProductReviewSubmitted,
          actor: user.customerId,
          payload: { reviewId: review.id, productId, orderId: order.id, rating: dto.rating },
          refs: [review.id, productId, order.id, user.customerId],
        },
      ];
      if (rejected) {
        events.push({
          type: EventType.ProductReviewRejected,
          actor: 'ai',
          payload: { reviewId: review.id, productId, status: 'rejected', reason: moderationReason },
          refs: [review.id, productId, order.id, user.customerId],
        });
      }
      return { result: review, events };
    });
  }

  async reviewModerationQueue(status: 'pending' | 'approved' | 'rejected') {
    const reviews = await this.prisma.productReview.findMany({
      where: { status },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: reviews.map((review) => review.productId) } },
      select: { id: true, name: true },
    });
    const names = new Map(products.map((product) => [product.id, product.name]));
    return {
      status,
      items: reviews.map((review) => ({
        ...review,
        productName: names.get(review.productId) ?? review.sku,
      })),
    };
  }

  async moderateReview(reviewId: string, dto: ModerateProductReviewDto, actor: string) {
    const targetStatus = dto.action === 'approve' ? 'approved' : 'rejected';
    const reason = dto.reason?.trim() || null;
    if (targetStatus === 'rejected' && !reason) {
      throw new ValidationError('review_rejection_reason_required', 'Укажите причину отклонения');
    }
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`product-review:${reviewId}`}))`;
      const review = await tx.productReview.findUnique({ where: { id: reviewId } });
      if (!review) throw new ValidationError('review_not_found', 'Отзыв не найден');
      if (review.status === targetStatus) return { result: review, events: [] };
      if (review.status !== 'pending') {
        throw new ConflictError('review_already_moderated', 'Решение по отзыву уже принято');
      }
      const moderated = await tx.productReview.update({
        where: { id: reviewId },
        data: {
          status: targetStatus,
          moderatedBy: actor,
          moderatedAt: new Date(),
          moderationReason: reason,
        },
      });
      return {
        result: moderated,
        events: [{
          type: targetStatus === 'approved' ? EventType.ProductReviewApproved : EventType.ProductReviewRejected,
          actor,
          payload: { reviewId, productId: review.productId, status: targetStatus, reason },
          refs: [reviewId, review.productId, review.orderId, review.customerId],
        }],
      };
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

  private toAdminProduct(product: ProductWithStockCount) {
    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      variantGroup: product.variantGroup,
      name: product.name,
      price: product.price,
      cost: product.cost,
      category: product.category,
      taxCode: product.taxCode,
      taxRateBps: product.taxRateBps,
      trackingMode: product.trackingMode,
      attrs: product.attrs,
      bundleComponents: product.bundleComponents.map((component) => ({
        productId: component.componentProductId,
        sku: component.componentProduct.sku,
        name: component.componentProduct.name,
        qty: component.qty,
      })),
      archived: product.archived,
      availableUnits: this.availableUnits(product),
    };
  }

  private stockCountInclude() {
    return {
      _count: {
        select: {
          units: { where: { status: 'in_stock' as const } },
        },
      },
      bundleComponents: {
        orderBy: { componentProductId: 'asc' as const },
        include: {
          componentProduct: {
            include: {
              balances: true,
              _count: {
                select: {
                  units: { where: { status: 'in_stock' as const } },
                },
              },
            },
          },
        },
      },
      balances: true,
    };
  }

  private availableUnits(product: ProductWithStockCount): number {
    if (product.bundleComponents.length === 0) return this.directAvailability(product);
    return Math.min(
      ...product.bundleComponents.map((component) =>
        Math.floor(this.directAvailability(component.componentProduct) / component.qty),
      ),
    );
  }

  private directAvailability(product: {
    trackingMode: 'serialized' | 'quantity';
    _count: { units: number };
    balances: Array<{ onHand: number; reserved: number }>;
  }): number {
    if (product.trackingMode === 'serialized') return product._count.units;
    return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
  }

  private async resolveBundleComponents(
    tx: Prisma.TransactionClient,
    bundleSku: string,
    input: ProductBundleComponentDto[] | undefined,
  ): Promise<Array<{ componentProductId: string; qty: number }>> {
    if (!input?.length) return [];
    const normalized = input.map((component) => ({ sku: component.sku.trim(), qty: component.qty }));
    if (normalized.some((component) => !component.sku || component.sku === bundleSku)) {
      throw new ValidationError('bundle_component_invalid', 'Набор не может содержать пустой SKU или самого себя');
    }
    if (new Set(normalized.map((component) => component.sku)).size !== normalized.length) {
      throw new ValidationError('bundle_component_duplicate', 'Компоненты набора не должны повторяться');
    }
    const products = await tx.product.findMany({
      where: { sku: { in: normalized.map((component) => component.sku) }, archived: false },
      include: { _count: { select: { bundleComponents: true } } },
    });
    if (products.length !== normalized.length) {
      const found = new Set(products.map((component) => component.sku));
      const missing = normalized.find((component) => !found.has(component.sku))?.sku;
      throw new ValidationError('bundle_component_not_found', `Компонент ${missing} не найден`);
    }
    const nested = products.find((component) => component._count.bundleComponents > 0);
    if (nested) {
      throw new ValidationError('nested_bundle_forbidden', `Набор ${nested.sku} нельзя вложить в другой набор`);
    }
    const bySku = new Map(products.map((component) => [component.sku, component]));
    return normalized.map((component) => ({
      componentProductId: bySku.get(component.sku)!.id,
      qty: component.qty,
    }));
  }

  private optionalValue(value: string | undefined): string | null {
    return value?.trim() || null;
  }
}
