import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceSupplierOfferDto } from './supplier-offers.dto';

const MINIMUM_MARGIN_BPS = 1000;
const DEFAULT_QUOTE_HOURS = 24;

@Injectable()
export class SupplierOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getActive(productId: string) {
    return this.prisma.supplierOffer.findFirst({
      where: { productId, active: true },
      include: { supplier: { select: { id: true, name: true } } },
    });
  }

  async replace(productId: string, dto: ReplaceSupplierOfferDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'supplier-offer:' + productId}))::text AS locked`;
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new ValidationError('product_not_found', `Товар ${productId} не найден`);
      if (product.supplyMode !== 'to_order') {
        throw new ConflictError(
          'supplier_offer_own_stock_forbidden',
          'Предложение поставщика можно активировать только для товара под заказ',
        );
      }
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { id: true },
      });
      if (!supplier) {
        throw new ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
      }

      const previous = await tx.supplierOffer.findFirst({
        where: { productId, active: true },
        orderBy: { createdAt: 'desc' },
      });
      await tx.supplierOffer.updateMany({
        where: { productId, active: true },
        data: { active: false },
      });
      const checkedAt = new Date();
      const validUntil = new Date(
        checkedAt.getTime() + (dto.validForHours ?? DEFAULT_QUOTE_HOURS) * 60 * 60 * 1000,
      );
      const offer = await tx.supplierOffer.create({
        data: {
          productId,
          supplierId: dto.supplierId,
          supplierSku: dto.supplierSku?.trim() || null,
          unitCost: dto.unitCost,
          availableQty: dto.availableQty,
          leadDays: dto.leadDays,
          checkedAt,
          validUntil,
          updatedBy: actor,
        },
      });
      await tx.product.update({
        where: { id: productId },
        data: {
          supplierId: dto.supplierId,
          supplyLeadDays: dto.leadDays,
        },
      });
      const marginBps = product.price > 0
        ? Math.floor(((product.price - dto.unitCost) * 10_000) / product.price)
        : -10_000;
      return {
        result: {
          ...offer,
          marginBps,
          minimumMarginBps: MINIMUM_MARGIN_BPS,
          requiresApproval: marginBps < MINIMUM_MARGIN_BPS,
        },
        events: [{
          type: EventType.SupplierOfferReplaced,
          actor,
          payload: {
            productId,
            previousOfferId: previous?.id ?? null,
            offerId: offer.id,
            supplierId: offer.supplierId,
            unitCost: offer.unitCost,
            availableQty: offer.availableQty,
            leadDays: offer.leadDays,
            validUntil: offer.validUntil.toISOString(),
            marginBps,
          },
          refs: [productId, offer.id, offer.supplierId, ...(previous ? [previous.id] : [])],
        }],
      };
    });
  }

  async deactivate(productId: string, actor: string) {
    return this.audit.transaction<{
      productId: string;
      offerId: string | null;
      active: boolean;
      idempotent: boolean;
    }>(async (tx) => {
      const active = await tx.supplierOffer.findFirst({
        where: { productId, active: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!active) {
        return {
          result: { productId, offerId: null, active: false, idempotent: true },
          events: [],
        };
      }
      await tx.supplierOffer.update({ where: { id: active.id }, data: { active: false } });
      return {
        result: { productId, offerId: active.id, active: false, idempotent: false },
        events: [{
          type: EventType.SupplierOfferDeactivated,
          actor,
          payload: { productId, offerId: active.id, supplierId: active.supplierId },
          refs: [productId, active.id, active.supplierId],
        }],
      };
    });
  }

  async integrity(actor: string) {
    return this.audit.transaction(async (tx) => {
      const now = new Date();
      const products = await tx.product.findMany({
        where: { supplyMode: 'to_order', archived: false },
        include: {
          supplierOffers: { where: { active: true } },
          units: { where: { status: 'in_stock' }, select: { id: true } },
          balances: {
            where: { OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
            select: { id: true, location: true, onHand: true, reserved: true },
          },
        },
        orderBy: { sku: 'asc' },
      });
      const issues = products.flatMap((product) => {
        const rows: Array<Record<string, unknown>> = [];
        if (product.units.length > 0 || product.balances.length > 0) {
          rows.push({
            code: 'to_order_has_stock',
            productId: product.id,
            sku: product.sku,
            serializedUnits: product.units.length,
            balances: product.balances,
          });
        }
        if (product.supplierOffers.length !== 1) {
          rows.push({
            code: 'active_supplier_offer_count',
            productId: product.id,
            sku: product.sku,
            count: product.supplierOffers.length,
          });
        } else {
          const offer = product.supplierOffers[0];
          if (offer.validUntil <= now) {
            rows.push({
              code: 'supplier_offer_expired',
              productId: product.id,
              sku: product.sku,
              offerId: offer.id,
              validUntil: offer.validUntil,
            });
          }
          if (offer.availableQty <= 0) {
            rows.push({
              code: 'supplier_offer_unavailable',
              productId: product.id,
              sku: product.sku,
              offerId: offer.id,
            });
          }
        }
        return rows;
      });
      return {
        result: { ok: issues.length === 0, checkedProducts: products.length, issues },
        events: [{
          type: EventType.SupplyIntegrityChecked,
          actor,
          payload: { checkedProducts: products.length, issueCount: issues.length },
          refs: products.map((product) => product.id),
        }],
      };
    });
  }
}
