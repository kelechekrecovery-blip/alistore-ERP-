import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, StorePoint } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';
import { ConflictError, ValidationError } from '../common/errors';
import { assertTransition } from './order-state-machine';
import { CreateOrderDto } from './orders.dto';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { earnLoyaltyOnTx, redeemLoyaltyOnTx } from '../customers/loyalty-ledger';
import {
  accrueConsignmentSalesOnTx,
  accrueQuantityConsignmentSalesOnTx,
  releaseQuantityConsignmentOnTx,
  reserveQuantityConsignmentOnTx,
} from '../inventory/consignment-accounting';
import { LogisticsService } from '../logistics/logistics.service';
import { PromotionLine, PromotionsService } from '../promotions/promotions.service';
import { CampaignAttributionService } from '../campaigns/campaign-attribution.service';
import { consumeQuantityValuationOnTx } from '../inventory/inventory-valuation';

/** Reservation lifetime — every reservation must have expiresAt (invariant #7). */
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 минут
interface CanonicalPricing {
  subtotal: number;
  deliveryFee: number;
  promoCode: string | null;
  promoDiscount: number;
  loyaltyPoints: number;
  promotionLines?: PromotionLine[];
  unitCosts?: Record<string, number>;
}

function defaultFulfillment(channel: string): NonNullable<CreateOrderDto['fulfillmentType']> {
  if (channel === 'pos' || channel === 'staff_mobile') return 'store';
  return 'pickup';
}

function pickupCode(): string {
  return `PU-${randomBytes(3).toString('hex').toUpperCase()}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    @Optional() private readonly outbox?: OutboxService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly logistics?: LogisticsService,
    @Optional() private readonly promotions?: PromotionsService,
    @Optional() private readonly campaignAttribution?: CampaignAttributionService,
  ) {}

  get(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
  }

  getGuest(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        channel: true,
        fulfillmentType: true,
        pickupPoint: true,
        deliveryAddress: true,
        deliverySlot: true,
        pickupCode: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { sku: true, qty: true, price: true, imei: true } },
        payments: { select: { amount: true, method: true, status: true } },
      },
    });
  }

  /** Orders belonging to one customer, newest first (personal account). */
  listByCustomer(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Ledger events for one order, scoped by the controller before this is called. */
  ledger(orderId: string) {
    return this.prisma.auditEvent.findMany({
      where: { refs: { has: orderId } },
      orderBy: { ts: 'desc' },
      take: 50,
    });
  }

  /** Create an order (status `created`) and write order.created to the ledger. */
  async createFromCatalog(dto: CreateOrderDto, actor: string, idempotencyKey?: string, allowLoyalty = false) {
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existing) {
        if (existing.customerId !== dto.customerId) {
          throw new ConflictError('order_idempotency_owner_mismatch', 'Ключ заказа уже использован');
        }
        return existing;
      }
    }

    if (['courier', 'express'].includes(dto.fulfillmentType ?? '') && !dto.deliveryAddress?.trim()) {
      throw new ValidationError('delivery_address_required', 'Укажите адрес доставки');
    }
    if ((dto.deliveryZoneId && !dto.deliverySlotId) || (!dto.deliveryZoneId && dto.deliverySlotId)) {
      throw new ValidationError('delivery_selection_incomplete', 'Выберите зону и слот доставки вместе');
    }
    if (dto.deliveryZoneId && dto.fulfillmentType !== 'courier') {
      throw new ValidationError('delivery_selection_forbidden', 'Зона и слот доступны только для курьерской доставки');
    }
    const fulfillmentType: NonNullable<CreateOrderDto['fulfillmentType']> = dto.fulfillmentType ?? defaultFulfillment(dto.channel);
    const requiresPointSelection = fulfillmentType === 'pickup';
    const storePoint = this.logistics
      ? await this.logistics.resolveStorePoint(
          dto.storePointId,
          fulfillmentType === 'store' ? dto.pickupPoint : undefined,
          requiresPointSelection,
        )
      : await this.resolveStorePointFromDatabase(
          dto.storePointId,
          fulfillmentType === 'store' ? dto.pickupPoint : undefined,
          false,
        );
    const deliveryAddress = fulfillmentType === 'pickup' || fulfillmentType === 'store'
      ? undefined
      : dto.deliveryAddress?.trim();
    const quantities = new Map<string, number>();
    for (const item of dto.items) quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + item.qty);
    const skus = [...quantities.keys()];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus }, archived: false },
      include: {
        units: { where: { status: 'in_stock', location: storePoint.inventoryLocation }, select: { id: true } },
        balances: { where: { location: storePoint.inventoryLocation }, select: { onHand: true, reserved: true } },
        bundleComponents: {
          include: {
            componentProduct: {
              include: {
                units: { where: { status: 'in_stock', location: storePoint.inventoryLocation }, select: { id: true } },
                balances: { where: { location: storePoint.inventoryLocation }, select: { onHand: true, reserved: true } },
              },
            },
          },
        },
      },
    });
    const bySku = new Map(products.map((product) => [product.sku, product]));
    const items = skus.map((sku) => {
      const product = bySku.get(sku);
      if (!product) throw new ValidationError('product_not_found', `Товар ${sku} не найден`);
      const qty = quantities.get(sku)!;
      const available = product.bundleComponents.length > 0
        ? Math.min(...product.bundleComponents.map((component) =>
            Math.floor(directAvailability(component.componentProduct) / component.qty),
          ))
        : directAvailability(product);
      if (available < qty) {
        throw new ConflictError('insufficient_stock', `Недостаточно товара ${sku}: доступно ${available}`);
      }
      return { sku, qty, price: product.price, productId: product.id, category: product.category.trim().toLowerCase() };
    });
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliverySelection = dto.deliveryZoneId && dto.deliverySlotId
      ? await this.deliverySelection(dto.deliveryZoneId, dto.deliverySlotId)
      : null;
    const deliveryFee = deliverySelection?.zone.fee ?? fulfillmentFee(dto.fulfillmentType);
    const promoCode = normalizePromo(dto.promoCode);
    const promoDiscount = 0;
    const loyaltyPoints = dto.loyaltyPoints ?? 0;
    if (loyaltyPoints > 0 && !allowLoyalty) {
      throw new ConflictError('loyalty_auth_required', 'Списание бонусов доступно только после входа в аккаунт');
    }
    const pricing: CanonicalPricing = {
      subtotal,
      deliveryFee,
      promoCode,
      promoDiscount,
      loyaltyPoints,
      promotionLines: items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        category: item.category,
        price: item.price,
        qty: item.qty,
      })),
      unitCosts: Object.fromEntries(products.map((product) => [product.sku, product.cost])),
    };
    return this.create(
      {
        ...dto,
        fulfillmentType,
        storePointId: storePoint.id,
        pickupPoint: undefined,
        deliveryAddress,
        total: subtotal + deliveryFee - promoDiscount,
        items,
      },
      actor,
      idempotencyKey,
      pricing,
      storePoint,
    );
  }

  async create(
    dto: CreateOrderDto,
    actor: string,
    idempotencyKey?: string,
    pricing?: CanonicalPricing,
    storePoint?: StorePoint,
  ) {
    const isDemo = this.config?.get<string>('PUBLIC_DEMO_MODE')?.trim().toLowerCase() === 'true';
    const fulfillmentType = dto.fulfillmentType ?? defaultFulfillment(dto.channel);
    const canonicalStorePoint = storePoint ?? (this.logistics
      ? await this.logistics.resolveStorePoint(dto.storePointId, dto.pickupPoint, fulfillmentType === 'pickup')
      : await this.resolveStorePointFromDatabase(dto.storePointId, dto.pickupPoint, false));
    try {
      return await this.audit.transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.order.findUnique({
            where: { idempotencyKey },
            include: { items: true },
          });
          if (existing) {
            if (existing.customerId !== dto.customerId) {
              throw new ConflictError('order_idempotency_owner_mismatch', 'Ключ заказа уже использован');
            }
            return { result: existing, events: [] };
          }
        }
        const canonical = pricing ?? {
          subtotal: dto.total,
          deliveryFee: 0,
          promoCode: null,
          promoDiscount: 0,
          loyaltyPoints: 0,
        };
        if (isDemo && canonical.loyaltyPoints > 0) {
          throw new ConflictError('demo_loyalty_forbidden', 'Демо-заказ не списывает бонусы');
        }
        const events: AuditInput[] = [];
        const appliedPromotion = canonical.promoCode
          ? await this.requirePromotions().evaluateForOrderOnTx(tx, {
              code: canonical.promoCode,
              customerId: dto.customerId,
              lines: canonical.promotionLines ?? [],
            })
          : null;
        const promoDiscount = appliedPromotion?.discount ?? canonical.promoDiscount;
        const preparedAttribution = this.campaignAttribution
          ? await this.campaignAttribution.prepareForOrder(
              tx,
              dto.customerId,
              dto.attribution,
              appliedPromotion?.code ?? canonical.promoCode,
            )
          : null;
        if (!isDemo && dto.deliverySlotId && dto.deliveryZoneId) {
          await tx.$queryRaw`SELECT id FROM "DeliverySlot" WHERE id = ${dto.deliverySlotId} FOR UPDATE`;
          const slot = await tx.deliverySlot.findUnique({ where: { id: dto.deliverySlotId } });
          if (!slot?.active || slot.zoneId !== dto.deliveryZoneId || slot.endsAt <= new Date()) {
            throw new ConflictError('delivery_slot_unavailable', 'Слот доставки больше недоступен');
          }
          const booked = await tx.order.count({
            where: { deliverySlotId: slot.id, isDemo: false, status: { in: ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment', 'paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery'] } },
          });
          if (booked >= slot.capacity) throw new ConflictError('delivery_slot_full', 'Слот доставки уже занят');
        }
        const baseTotal = canonical.subtotal + canonical.deliveryFee - promoDiscount;
        const initialOrder = await tx.order.create({
          data: {
            idempotencyKey,
            isDemo,
            customerId: dto.customerId,
            channel: dto.channel,
            fulfillmentType,
            storePointId: canonicalStorePoint.id,
            storePointCode: canonicalStorePoint.code,
            storePointName: canonicalStorePoint.name,
            storePointAddress: canonicalStorePoint.address,
            pickupPoint: ['pickup', 'store'].includes(fulfillmentType) ? canonicalStorePoint.name : null,
            pickupAddress: ['pickup', 'store'].includes(fulfillmentType) ? canonicalStorePoint.address : null,
            fulfillmentLocation: canonicalStorePoint.inventoryLocation,
            deliveryAddress: dto.deliveryAddress,
            deliverySlot: dto.deliverySlot,
            deliveryZoneId: isDemo ? null : dto.deliveryZoneId,
            deliverySlotId: isDemo ? null : dto.deliverySlotId,
            pickupCode: pickupCode(),
            subtotal: canonical.subtotal,
            deliveryFee: canonical.deliveryFee,
            promoCode: appliedPromotion?.code ?? canonical.promoCode,
            promoDiscount,
            total: baseTotal,
            status: 'created',
            items: {
              create: dto.items.map((i) => ({
                sku: i.sku,
                qty: i.qty,
                price: i.price,
                unitCost: canonical.unitCosts?.[i.sku] ?? 0,
                imei: i.imei,
              })),
            },
            ...(preparedAttribution ? { attribution: { create: preparedAttribution.data } } : {}),
          },
          include: { items: true },
        });
        if (preparedAttribution?.campaignId) {
          await this.campaignAttribution?.recordCheckoutOnTx(
            tx,
            preparedAttribution.campaignId,
            preparedAttribution.data.journeyHash,
            initialOrder.id,
          );
        }
        if (appliedPromotion && !isDemo) {
          await this.requirePromotions().registerRedemptionOnTx(
            tx,
            appliedPromotion,
            dto.customerId,
            initialOrder.id,
            actor,
            events,
          );
        }
        const loyaltyRedeemed = await redeemLoyaltyOnTx(tx, {
          customerId: dto.customerId,
          orderId: initialOrder.id,
          requested: canonical.loyaltyPoints,
          maximum: Math.max(0, canonical.subtotal - promoDiscount),
          actor,
        }, events);
        const order = loyaltyRedeemed > 0
          ? await tx.order.update({
              where: { id: initialOrder.id },
              data: { loyaltyRedeemed, total: baseTotal - loyaltyRedeemed },
              include: { items: true },
            })
          : initialOrder;
        if (this.outbox && !order.isDemo) {
          await enqueueConsentedCustomerNotice(tx, this.outbox, {
            customerId: order.customerId,
            template: 'order_confirmed',
            payload: { orderId: order.id, channel: order.channel, total: order.total },
          });
        }
        events.unshift(
          {
            type: EventType.OrderCreated,
            actor,
            payload: {
              orderId: order.id,
              channel: order.channel,
              fulfillmentType: order.fulfillmentType,
              storePointId: order.storePointId,
              pickupPoint: order.pickupPoint,
              pickupAddress: order.pickupAddress,
              fulfillmentLocation: order.fulfillmentLocation,
              deliveryAddress: order.deliveryAddress,
              deliverySlot: order.deliverySlot,
              pickupCode: order.pickupCode,
              subtotal: order.subtotal,
              deliveryFee: order.deliveryFee,
              promoCode: order.promoCode,
              promoDiscount: order.promoDiscount,
              loyaltyRedeemed: order.loyaltyRedeemed,
              total: order.total,
              isDemo: order.isDemo,
            },
            refs: [order.id],
          },
        );
        if (preparedAttribution?.campaignId) {
          events.push({
            type: EventType.CampaignAttributed,
            actor,
            payload: {
              orderId: order.id,
              campaignId: preparedAttribution.campaignId,
              trackingCode: preparedAttribution.trackingCode,
            },
            refs: [order.id, preparedAttribution.campaignId],
          });
        }
        return {
          result: order,
          events,
        };
      });
    } catch (error) {
      if (idempotencyKey && typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const existing = await this.prisma.order.findUnique({
          where: { idempotencyKey },
          include: { items: true },
        });
        if (existing) {
          if (existing.customerId !== dto.customerId) {
            throw new ConflictError('order_idempotency_owner_mismatch', 'Ключ заказа уже использован');
          }
          return existing;
        }
      }
      throw error;
    }
  }

  private async deliverySelection(zoneId: string, slotId: string) {
    const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId }, include: { zone: true } });
    if (!slot?.active || !slot.zone.active || slot.zoneId !== zoneId || slot.endsAt <= new Date()) {
      throw new ValidationError('delivery_slot_unavailable', 'Зона или слот доставки недоступны');
    }
    return slot;
  }

  private requirePromotions(): PromotionsService {
    if (!this.promotions) throw new ValidationError('promotions_unavailable', 'Сервис промокодов недоступен');
    return this.promotions;
  }

  /**
   * Reserve stock for the order: each IMEI item locks its unit (in_stock → reserved)
   * with a bounded-life Reservation, then the order moves to `reserved`.
   * A unit that is already reserved or sold blocks the reservation (409) — this is
   * where the double-sale guard fires for a second order on the same IMEI.
   */
  async reserve(orderId: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      this.assertNotDemo(order);
      assertTransition(order.status, 'reserved');

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const events: AuditInput[] = [];
      for (const item of order.items) {
        if (item.imei) {
          const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
          if (!unit || (order.fulfillmentLocation && unit.location !== order.fulfillmentLocation)) {
            throw new ConflictError('unit_wrong_store_point', `Единица ${item.imei} недоступна в выбранной точке`);
          }
          await this.units.reserveOnTx(tx, item.imei, orderId);
          await tx.reservation.create({
            data: { orderId, imei: item.imei, expiresAt, active: true },
          });
          events.push({
            type: EventType.StockReserved,
            actor,
            payload: { orderId, imei: item.imei },
            refs: [orderId, item.imei],
          });
          continue;
        }
        const product = await tx.product.findUnique({ where: { sku: item.sku } });
        if (product?.trackingMode === 'quantity') {
          await this.reserveQuantityOnTx(
            tx, orderId, item.id, product.id, product.sku, item.qty,
            order.fulfillmentLocation, expiresAt, actor, events,
          );
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'reserved' },
      });
      events.push({
        type: EventType.OrderReserved,
        actor,
        payload: { orderId },
        refs: [orderId],
      });
      return { result: updated, events };
    });
  }

  /** Generic guarded status transition (writes an order.* ledger event). */
  async transition(orderId: string, to: OrderStatus, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          payments: { where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } }, orderBy: { createdAt: 'asc' } },
          courierRun: true,
        },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      this.assertNotDemo(order);
      assertTransition(order.status, to);
      if (to === 'completed') assertOrderMoneyReconciled(order);
      const releaseEvents: AuditInput[] = [];
      if (to === 'cancelled') {
        const reservations = await tx.reservation.findMany({
          where: { orderId, active: true },
          include: { quantityAllocation: true },
        });
        for (const reservation of reservations) {
          if (reservation.imei) {
            const released = await this.units.releaseOnTx(tx, reservation.imei, orderId);
            if (released) {
              releaseEvents.push({
                type: EventType.StockReleased,
                actor,
                payload: { orderId, imei: reservation.imei, reason: 'order_cancelled' },
                refs: [orderId, reservation.imei],
              });
            }
          }
          const allocation = reservation.quantityAllocation;
          if (allocation?.active) {
            const released = await tx.inventoryBalance.updateMany({
              where: { id: allocation.balanceId, reserved: { gte: allocation.qty } },
              data: { reserved: { decrement: allocation.qty } },
            });
            if (released.count === 1) {
              await releaseQuantityConsignmentOnTx(tx, allocation.id);
              await tx.orderQuantityAllocation.update({
                where: { id: allocation.id },
                data: { active: false },
              });
              releaseEvents.push({
                type: EventType.StockReleased,
                actor,
                payload: { orderId, sku: allocation.sku, qty: allocation.qty, reason: 'order_cancelled' },
                refs: [orderId, allocation.productId, allocation.id],
              });
            }
          }
        }
        await tx.reservation.updateMany({
          where: { orderId, active: true },
          data: { active: false },
        });
      }
      let updated = await tx.order.update({
        where: { id: orderId },
        data: { status: to },
      });
      const events: AuditInput[] = [
        ...releaseEvents,
        {
          type: `order.${to}`,
          actor,
          payload: { orderId, from: order.status, to },
          refs: [orderId],
        },
      ];
      if (to === 'completed') {
        const loyaltyEarned = await earnLoyaltyOnTx(tx, {
          customerId: order.customerId,
          orderId,
          paidTotal: order.total,
          paymentId: order.payments[0]?.id,
          actor,
        }, events);
        updated = await tx.order.update({ where: { id: orderId }, data: { loyaltyEarned } });
        await tx.customer.update({ where: { id: order.customerId }, data: { ltv: { increment: order.total } } });
      }
      if (this.outbox && (to === 'confirmed' || to === 'ready_for_pickup')) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: order.customerId,
          template: to === 'confirmed' ? 'order_confirmed' : 'order_ready',
          payload: { orderId, from: order.status, to },
        });
      }
      return {
        result: updated,
        events,
      };
    });
  }

  /** Orders in a given status, newest first — staff fulfillment queue. */
  listByStatus(status: OrderStatus, limit = 50) {
    return this.prisma.order.findMany({
      where: { status },
      include: { items: true, customer: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Warehouse fulfillment: assign concrete in_stock IMEI units to a web order's
   * serialized lines (which arrive without an IMEI), then move it to `reserved`.
   * A serialized line with qty>1 is normalized to one unit per line (like POS), so
   * every physical device is tracked individually. Insufficient stock → 409.
   */
  async fulfill(orderId: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      this.assertNotDemo(order);
      assertTransition(order.status, 'reserved');

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const events: AuditInput[] = [];
      const assigned: string[] = [];

      const reserveUnit = async (imei: string, sku: string) => {
        // Conditional claim — a findUnique→update would let two concurrent fulfills both
        // pass the in-stock check and double-reserve one device to two orders. Gate the
        // write on status:'in_stock' (mirror units.reserveOnTx); 0 rows → unit already taken.
        const claimed = await tx.deviceUnit.updateMany({
          where: { imei, status: 'in_stock' },
          data: { status: 'reserved', orderId },
        });
        if (claimed.count === 0) {
          throw new ConflictError('unit_already_taken', `Единица ${imei} уже занята — повторите`);
        }
        await tx.reservation.create({ data: { orderId, imei, expiresAt, active: true } });
        assigned.push(imei);
        events.push({
          type: EventType.StockReserved,
          actor,
          payload: { orderId, imei, sku },
          refs: [orderId, imei],
        });
      };

      for (const item of order.items) {
        if (item.imei) {
          // already serialized (e.g. POS) — reserve if still in stock
          const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
          if (unit && order.fulfillmentLocation && unit.location !== order.fulfillmentLocation) {
            throw new ConflictError('unit_wrong_store_point', `Единица ${item.imei} недоступна в выбранной точке`);
          }
          if (unit?.status === 'in_stock') await reserveUnit(item.imei, item.sku);
          continue;
        }
        const product = await tx.product.findUnique({
          where: { sku: item.sku },
          include: { bundleComponents: { include: { componentProduct: true } } },
        });
        if (!product) continue; // non-serialized line (accessory) — nothing to assign

        if (product.bundleComponents.length > 0) {
          for (const component of product.bundleComponents) {
            const required = component.qty * item.qty;
            if (component.componentProduct.trackingMode === 'quantity') {
              await this.reserveQuantityOnTx(
                tx, orderId, item.id, component.componentProductId,
                component.componentProduct.sku, required, order.fulfillmentLocation,
                expiresAt, actor, events,
              );
              continue;
            }
            const units = await tx.deviceUnit.findMany({
              where: {
                productId: component.componentProductId,
                status: 'in_stock',
                ...(order.fulfillmentLocation ? { location: order.fulfillmentLocation } : {}),
              },
              take: required,
              orderBy: { id: 'asc' },
            });
            if (units.length < required) {
              throw new ConflictError(
                'insufficient_bundle_stock',
                `Для набора ${item.sku} недостаточно ${component.componentProduct.sku}: нужно ${required}, в наличии ${units.length}`,
              );
            }
            for (const unit of units) {
              await reserveUnit(unit.imei, component.componentProduct.sku);
              await tx.orderBundleAllocation.create({
                data: {
                  orderId,
                  orderItemId: item.id,
                  bundleSku: item.sku,
                  componentProductId: component.componentProductId,
                  componentSku: component.componentProduct.sku,
                  location: unit.location,
                  imei: unit.imei,
                },
              });
            }
          }
          continue;
        }

        if (product.trackingMode === 'quantity') {
          await this.reserveQuantityOnTx(
            tx, orderId, item.id, product.id, product.sku, item.qty,
            order.fulfillmentLocation, expiresAt, actor, events,
          );
          continue;
        }

        const units = await tx.deviceUnit.findMany({
          where: {
            productId: product.id,
            status: 'in_stock',
            ...(order.fulfillmentLocation ? { location: order.fulfillmentLocation } : {}),
          },
          take: item.qty,
          orderBy: { id: 'asc' },
        });
        if (units.length < item.qty) {
          throw new ConflictError(
            'insufficient_stock',
            `Недостаточно единиц ${item.sku}: нужно ${item.qty}, в наличии ${units.length}`,
          );
        }

        // first unit stays on this line (qty→1); extra units become their own lines
        await tx.orderItem.update({
          where: { id: item.id },
          data: { qty: 1, imei: units[0].imei },
        });
        await reserveUnit(units[0].imei, item.sku);
        for (const unit of units.slice(1)) {
          await tx.orderItem.create({
            data: { orderId, sku: item.sku, qty: 1, price: item.price, imei: unit.imei },
          });
          await reserveUnit(unit.imei, item.sku);
        }
      }

      let nextStatus: OrderStatus = 'reserved';
      events.push({
        type: EventType.OrderReserved,
        actor,
        payload: { orderId, assigned: assigned.length },
        refs: [orderId],
      });

      // A fully loyalty-funded order has no external tender to trigger PaymentsService.
      // Fulfillment is therefore the authoritative point where its reserved units become
      // sold and the order becomes paid. No synthetic Payment row is created.
      if (order.total === 0) {
        for (const imei of assigned) {
          await this.units.sellOnTx(tx, imei, order.id, actor);
          events.push({
            type: EventType.UnitSold,
            actor,
            payload: { orderId, imei, method: 'loyalty' },
            refs: [orderId, imei],
          });
        }
        await accrueConsignmentSalesOnTx(tx, { orderId: order.id, imeis: assigned, actor, events });
        await this.consumeQuantityOnTx(tx, order.id, actor, events);
        await tx.reservation.updateMany({
          where: { orderId, active: true },
          data: { active: false },
        });
        nextStatus = 'paid';
        events.push({
          type: EventType.OrderPaid,
          actor,
          payload: { orderId, amount: 0, method: 'loyalty' },
          refs: [orderId],
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });
      return { result: { order: updated, assigned }, events };
    });
  }

  private assertNotDemo(order: { id: string; isDemo: boolean }): void {
    if (order.isDemo) {
      throw new ConflictError(
        'demo_order_read_only',
        `Демо-заказ ${order.id} нельзя передавать в оплату, склад или исполнение`,
      );
    }
  }

  private async reserveQuantityOnTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    orderItemId: string,
    productId: string,
    sku: string,
    quantity: number,
    preferredLocation: string | null,
    expiresAt: Date,
    actor: string,
    events: AuditInput[],
  ): Promise<void> {
    const balances = await tx.inventoryBalance.findMany({
      where: { productId, ...(preferredLocation ? { location: preferredLocation } : {}) },
      orderBy: { location: 'asc' },
    });
    let remaining = quantity;
    for (const balance of balances) {
      if (remaining === 0) break;
      const desired = Math.min(remaining, Math.max(0, balance.onHand - balance.reserved));
      if (desired === 0) continue;
      const claimed = await tx.$executeRaw`
        UPDATE "InventoryBalance"
        SET "reserved" = "reserved" + ${desired}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${balance.id} AND ("onHand" - "reserved") >= ${desired}
      `;
      if (claimed === 0) continue;
      const allocation = await tx.orderQuantityAllocation.create({
        data: { orderId, orderItemId, productId, balanceId: balance.id, sku, location: balance.location, qty: desired },
      });
      await reserveQuantityConsignmentOnTx(tx, {
        orderQuantityAllocationId: allocation.id,
        balanceId: balance.id,
        qty: desired,
      });
      await tx.reservation.create({
        data: { orderId, quantityAllocationId: allocation.id, expiresAt, active: true },
      });
      events.push({
        type: EventType.StockReserved,
        actor,
        payload: { orderId, sku, qty: desired, location: balance.location, allocationId: allocation.id },
        refs: [orderId, productId, allocation.id],
      });
      remaining -= desired;
    }
    if (remaining > 0) {
      throw new ConflictError('insufficient_stock', `Недостаточно товара ${sku}: не хватает ${remaining}`);
    }
  }

  private async resolveStorePointFromDatabase(storePointId?: string, legacyAlias?: string, requireSelection = false) {
    const alias = legacyAlias?.trim();
    const knownCode = alias === 'alistore-center' || alias === 'AliStore Центр' ? 'center' : alias;
    const point = storePointId
      ? await this.prisma.storePoint.findFirst({ where: { id: storePointId, active: true } })
      : alias
        ? await this.prisma.storePoint.findFirst({
            where: { active: true, OR: [{ code: knownCode }, { inventoryLocation: alias }] },
          })
        : requireSelection
          ? null
          : await this.prisma.storePoint.findFirst({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    if (!point) {
      throw new ValidationError(
        storePointId ? 'store_point_unavailable' : 'store_point_required',
        storePointId ? 'Точка недоступна или отключена' : 'Нет доступной точки выполнения заказа',
      );
    }
    return point;
  }

  private async consumeQuantityOnTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    actor: string,
    events: AuditInput[],
  ): Promise<void> {
    const allocations = await tx.orderQuantityAllocation.findMany({ where: { orderId, active: true } });
    for (const allocation of allocations) {
      const totalCost = await consumeQuantityValuationOnTx(tx, {
        orderId,
        allocationId: allocation.id,
        productId: allocation.productId,
        balanceId: allocation.balanceId,
        quantity: allocation.qty,
        actor,
      });
      const consumed = await tx.inventoryBalance.updateMany({
        where: { id: allocation.balanceId, onHand: { gte: allocation.qty }, reserved: { gte: allocation.qty }, inventoryValue: { gte: totalCost } },
        data: { onHand: { decrement: allocation.qty }, reserved: { decrement: allocation.qty }, inventoryValue: { decrement: totalCost } },
      });
      if (consumed.count !== 1) {
        throw new ConflictError('quantity_allocation_invalid', `Резерв ${allocation.id} больше недоступен`);
      }
      await tx.orderQuantityAllocation.update({
        where: { id: allocation.id },
        data: { active: false, consumedAt: new Date() },
      });
      events.push({
        type: EventType.StockSold,
        actor,
        payload: { orderId, sku: allocation.sku, qty: allocation.qty, allocationId: allocation.id },
        refs: [orderId, allocation.productId, allocation.id],
      });
    }
    await accrueQuantityConsignmentSalesOnTx(tx, {
      orderId,
      orderQuantityAllocationIds: allocations.map((allocation) => allocation.id),
      actor,
      events,
    });
  }
}

function directAvailability(product: {
  trackingMode: 'serialized' | 'quantity';
  units: unknown[];
  balances: Array<{ onHand: number; reserved: number }>;
}): number {
  if (product.trackingMode === 'serialized') return product.units.length;
  return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
}

function normalizePromo(value?: string): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase();
}

function fulfillmentFee(type?: string): number {
  if (type === 'courier') return 200;
  if (type === 'express') return 400;
  return 0;
}

function assertOrderMoneyReconciled(order: {
  id: string;
  total: number;
  payments: { amount: number }[];
  courierRun: { collectedTotal: number; handedOver: boolean } | null;
}): void {
  if (order.total <= 0) return;
  const received = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const handedOverCod = order.courierRun?.handedOver ? order.courierRun.collectedTotal : 0;
  if (received + handedOverCod < order.total) {
    throw new ConflictError('order_money_unreconciled', `Заказ ${order.id} нельзя завершить до сверки оплаты/COD`);
  }
}
