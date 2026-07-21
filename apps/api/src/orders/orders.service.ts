import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, StorePoint } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
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
  releaseQuantityConsignmentOnTx,
  reserveQuantityConsignmentOnTx,
} from '../inventory/consignment-accounting';
import { LogisticsService } from '../logistics/logistics.service';
import { PromotionLine, PromotionsService } from '../promotions/promotions.service';
import { CampaignAttributionService } from '../campaigns/campaign-attribution.service';
import { salesTaxSnapshot } from '../finance/sales-tax';
import {
  assertOrderReservationCoverageOnTx,
  finalizeOrderInventorySaleOnTx,
  lockInventoryBalancesOnTx,
  resolveOrderInventorySnapshot,
  type OrderInventorySnapshot,
} from '../inventory/order-inventory-sale';

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
  unitCostsByLine?: number[];
  posShiftId?: string;
  inventorySnapshots?: Record<string, OrderInventorySnapshot>;
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
    @Optional() private readonly settings?: SettingsService,
  ) {}

  get(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
  }

  async getForStaff(id: string, staffId: string) {
    const order = await this.get(id);
    if (!order?.posShiftId) return order;
    const ownOpenShift = await this.prisma.cashShift.findFirst({
      where: { id: order.posShiftId, staffId, closedAt: null },
      select: { id: true },
    });
    if (!ownOpenShift) return order;
    return {
      ...order,
      posShiftId: null,
      payments: [],
      drawerBlind: true,
    };
  }

  async isOwnOpenShiftOrder(orderId: string, staffId: string): Promise<boolean> {
    const count = await this.prisma.order.count({
      where: {
        id: orderId,
        posShift: { staffId, closedAt: null },
      },
    });
    return count > 0;
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

  /**
   * Проекция леджера для клиента: тип, время, статус — без сырого `payload`.
   *
   * Полный `ledger()` отдавал клиенту `payload` всех событий с этим orderId в
   * refs, а туда пишутся `inventory.cogs.amount` (себестоимость каждой единицы)
   * и `commissionAmount`/`ownerAmount` по комиссионному товару. Покупатель мог
   * посчитать маржу магазина поштучно. Витрине из леджера нужны только `type` и
   * `ts` (`lib/order-status.ts` строит по ним таймлайн) — payload не нужен вовсе.
   */
  async customerLedger(orderId: string) {
    const events = await this.prisma.auditEvent.findMany({
      where: { refs: { has: orderId } },
      orderBy: { ts: 'desc' },
      take: 50,
      select: { id: true, type: true, ts: true, actor: true },
    });
    // actor обезличиваем: id сотрудника клиенту знать незачем.
    return events.map(({ actor, ...event }) => ({ ...event, actor: actor ? 'staff' : null }));
  }

  /** Create an order (status `created`) and write order.created to the ledger. */
  async createFromCatalog(dto: CreateOrderDto, actor: string, idempotencyKey?: string, allowLoyalty = false) {
    const requestHash = orderRequestHash(dto, false);
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existing) {
        assertOrderReplayCompatible(existing, dto, false, requestHash);
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
    const paymentMode = dto.paymentMode ?? 'prepaid';
    // Правило было «оплата при получении только для курьера» и держалось
    // CHECK-констрейнтом Order_cod_courier_check. Оно писалось, когда самовывоз
    // оплачивался онлайн; после перехода на наличные предоплата отдаёт 503, и
    // самовывоз — способ получения по умолчанию — остался без единого рабочего
    // метода оплаты.
    //
    // Самовывоз и выдача в магазине курьерской механики не требуют: человек
    // платит кассиру у прилавка. Экспресс остаётся под запретом обоснованно —
    // такие заказы не попадают в курьерский рейс (`courier.service.ts` требует
    // fulfillmentType === 'courier'), собирать по ним деньги нечем.
    // См. миграцию 20260721090000_cod_allows_pickup.
    if (paymentMode === 'cod' && fulfillmentType === 'express') {
      throw new ValidationError(
        'cod_express_unsupported',
        'Оплата при получении недоступна для экспресс-доставки: по таким заказам нет курьерского рейса',
      );
    }
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
      inventorySnapshots: Object.fromEntries(products.map((product) => [product.sku, {
        productId: product.id,
        trackingMode: product.trackingMode,
        components: product.bundleComponents.map((component) => ({
          productId: component.componentProductId,
          sku: component.componentProduct.sku,
          trackingMode: component.componentProduct.trackingMode,
          qty: component.qty,
        })),
      }])),
    };
    return this.create(
      {
        ...dto,
        fulfillmentType,
        paymentMode,
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
      requestHash,
    );
  }

  async create(
    dto: CreateOrderDto,
    actor: string,
    idempotencyKey?: string,
    pricing?: CanonicalPricing,
    storePoint?: StorePoint,
    requestHash = orderRequestHash(dto, true),
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
            assertOrderReplayCompatible(existing, dto, true, requestHash);
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
        const productTaxes = await tx.product.findMany({
          where: { sku: { in: [...new Set(dto.items.map((item) => item.sku))] } },
          select: { sku: true, taxCode: true, taxRateBps: true },
        });
        const taxBySku = new Map(productTaxes.map((product) => [product.sku, product]));
        for (const item of dto.items) {
          if (!taxBySku.has(item.sku)) {
            // Internal/direct order creation is retained for migration fixtures and
            // non-catalogue lines. The classification still comes from server policy.
            taxBySku.set(item.sku, { sku: item.sku, taxCode: 'vat_standard', taxRateBps: 1200 });
          }
        }
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
        const initialTax = orderTaxSnapshot(dto.items, taxBySku, baseTotal, canonical.deliveryFee);
        const initialOrder = await tx.order.create({
          data: {
            idempotencyKey,
            idempotencyRequestHash: idempotencyKey ? requestHash : null,
            isDemo,
            customerId: dto.customerId,
            channel: dto.channel,
            fulfillmentType,
            paymentMode: dto.paymentMode ?? 'prepaid',
            paymentModeExplicit: true,
            storePointId: canonicalStorePoint.id,
            storePointCode: canonicalStorePoint.code,
            storePointName: canonicalStorePoint.name,
            storePointAddress: canonicalStorePoint.address,
            posShiftId: canonical.posShiftId,
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
            piiConsentAt: dto.piiConsent ? new Date() : null,
            taxBaseAmount: initialTax.taxBaseAmount,
            taxAmount: initialTax.taxAmount,
            total: baseTotal,
            status: 'created',
            items: {
              create: dto.items.map((i, index) => ({
                lineNumber: index + 1,
                sku: i.sku,
                qty: i.qty,
                price: i.price,
                unitCost: canonical.unitCostsByLine?.[index] ?? canonical.unitCosts?.[i.sku] ?? 0,
                discountAmount: initialTax.lines[index].discountAmount,
                taxCode: initialTax.lines[index].taxCode,
                taxRateBps: initialTax.lines[index].taxRateBps,
                taxBaseAmount: initialTax.lines[index].taxBaseAmount,
                taxAmount: initialTax.lines[index].taxAmount,
                imei: i.imei,
                ...(canonical.inventorySnapshots?.[i.sku]
                  ? { inventorySnapshot: canonical.inventorySnapshots[i.sku] as unknown as Prisma.InputJsonValue }
                  : {}),
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
        let order = initialOrder;
        if (loyaltyRedeemed > 0) {
          const finalTotal = baseTotal - loyaltyRedeemed;
          const finalTax = orderTaxSnapshot(dto.items, taxBySku, finalTotal, canonical.deliveryFee);
          for (const [index, line] of finalTax.lines.entries()) {
            await tx.orderItem.updateMany({
              where: { orderId: initialOrder.id, lineNumber: index + 1 },
              data: {
                discountAmount: line.discountAmount,
                taxBaseAmount: line.taxBaseAmount,
                taxAmount: line.taxAmount,
              },
            });
          }
          order = await tx.order.update({
            where: { id: initialOrder.id },
            data: {
              loyaltyRedeemed,
              total: finalTotal,
              taxBaseAmount: finalTax.taxBaseAmount,
              taxAmount: finalTax.taxAmount,
            },
            include: { items: true },
          });
        }
        if (this.outbox && !order.isDemo) {
          await enqueueConsentedCustomerNotice(tx, this.outbox, {
            customerId: order.customerId,
            template: 'order_confirmed',
            payload: { orderId: order.id, channel: order.channel, total: order.total },
            // Подтверждение заказа — транзакционное сообщение, а не рассылка:
            // человек только что оформил заказ и должен знать, что он принят.
            // Без этого флага гость (`consent: false` по умолчанию) не получал
            // даже строки в ленте уведомлений, а экран успеха обещал «мы
            // свяжемся для подтверждения».
            transactional: true,
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
              paymentMode: order.paymentMode,
              storePointId: order.storePointId,
              pickupPoint: order.pickupPoint,
              fulfillmentLocation: order.fulfillmentLocation,
              // Текст адреса в append-only леджер не пишется: его нельзя удалить
              // по запросу клиента, а `deliveryAddress`/`pickupAddress` — это
              // домашний адрес человека. Сам адрес остаётся на строке Order
              // (её при удалении можно обезличить); id зоны/точки достаточно для
              // маршрутизации и отчётов.
              deliveryZoneId: order.deliveryZoneId,
              deliverySlot: order.deliverySlot,
              pickupCode: order.pickupCode,
              subtotal: order.subtotal,
              deliveryFee: order.deliveryFee,
              promoCode: order.promoCode,
              promoDiscount: order.promoDiscount,
              loyaltyRedeemed: order.loyaltyRedeemed,
              taxBaseAmount: order.taxBaseAmount,
              taxAmount: order.taxAmount,
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
          assertOrderReplayCompatible(existing, dto, true, requestHash);
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
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      this.assertNotDemo(order);
      assertTransition(order.status, 'reserved');

      const currentProducts = await tx.product.findMany({
        where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
        include: { bundleComponents: { include: { componentProduct: true } } },
      });
      const currentProductsBySku = new Map(currentProducts.map((product) => [product.sku, product]));
      const inventorySpecs = new Map<string, OrderInventorySnapshot>();
      for (const item of order.items) {
        const product = currentProductsBySku.get(item.sku);
        const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
          productId: product.id,
          trackingMode: product.trackingMode,
          components: product.bundleComponents.map((component) => ({
            productId: component.componentProductId,
            sku: component.componentProduct.sku,
            trackingMode: component.componentProduct.trackingMode,
            qty: component.qty,
          })),
        } : null);
        if (snapshot) inventorySpecs.set(item.id, snapshot);
      }
      const quantityProductIds = [...new Set([...inventorySpecs.values()].flatMap((snapshot) => {
        if (snapshot.components.length > 0) {
          return snapshot.components
            .filter((component) => component.trackingMode === 'quantity')
            .map((component) => component.productId);
        }
        return snapshot.trackingMode === 'quantity' ? [snapshot.productId] : [];
      }))];
      if (quantityProductIds.length > 0) {
        const balances = await tx.inventoryBalance.findMany({
          where: {
            productId: { in: quantityProductIds },
            ...(order.fulfillmentLocation ? { location: order.fulfillmentLocation } : {}),
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        await lockInventoryBalancesOnTx(tx, balances.map((balance) => balance.id));
      }

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const events: AuditInput[] = [];
      for (const item of order.items) {
        const inventorySpec = inventorySpecs.get(item.id);
        if (item.imei) {
          const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
          if (!unit || !inventorySpec || unit.productId !== inventorySpec.productId) {
            throw new ConflictError('unit_product_mismatch', `Единица ${item.imei} не соответствует товару ${item.sku}`);
          }
          if (order.fulfillmentLocation && unit.location !== order.fulfillmentLocation) {
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
        if (inventorySpec?.trackingMode === 'quantity' && inventorySpec.components.length === 0) {
          await this.reserveQuantityOnTx(
            tx, orderId, item.id, inventorySpec.productId, item.sku, item.qty,
            order.fulfillmentLocation, expiresAt, actor, events,
          );
        } else if (inventorySpec) {
          throw new ConflictError(
            'serialized_unit_required',
            `Для серийного товара ${item.sku} нужно назначить IMEI через складское исполнение`,
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
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          payments: { where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } }, orderBy: { createdAt: 'asc' } },
          courierRun: true,
          items: { select: { id: true } },
        },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      this.assertNotDemo(order);
      const settledAmount = order.payments
        .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0);
      if (to === 'cancelled' && settledAmount >= order.total) {
        throw new ConflictError('paid_order_cancel_requires_return', 'Оплаченный заказ отменяется через возврат и refund');
      }
      assertTransition(order.status, to);
      if (order.status === 'reserved' && to === 'picking' && order.paymentMode !== 'cod') {
        throw new ValidationError('cod_picking_required', 'Неоплаченный заказ можно собирать только в режиме COD');
      }
      if (order.status === 'reserved' && to === 'picking' && order.items.length > 0) {
        await assertOrderReservationCoverageOnTx(tx, orderId);
      }
      if (to === 'paid') {
        assertOrderTenderSettled(order);
        throw new ConflictError('order_paid_transition_forbidden', 'Статус paid устанавливает только сервис оплаты или COD');
      }
      if (to === 'completed') assertOrderMoneyReconciled(order);
      const releaseEvents: AuditInput[] = [];
      if (to === 'cancelled') {
        if (order.courierRunId) {
          await tx.$executeRaw`SELECT id FROM "CourierRun" WHERE id = ${order.courierRunId} FOR UPDATE`;
          const run = await tx.courierRun.findUnique({ where: { id: order.courierRunId } });
          if (run && !run.handedOver) {
            const codReleased = Math.max(0, order.total - order.payments.reduce((sum, payment) => sum + payment.amount, 0));
            if (codReleased > 0) {
              await tx.courierRun.update({ where: { id: run.id }, data: { codTotal: { decrement: codReleased } } });
              releaseEvents.push({
                type: 'courier.cod_adjusted',
                actor,
                payload: { orderId, runId: run.id, codReleased, reason: 'order_cancelled' },
                refs: [orderId, run.id],
              });
            }
          }
        }
        const reservations = await tx.reservation.findMany({
          where: { orderId, active: true },
          include: { quantityAllocation: true },
        });
        reservations.sort((left, right) => {
          const leftKey = left.quantityAllocation?.balanceId ?? left.imei ?? left.id;
          const rightKey = right.quantityAllocation?.balanceId ?? right.imei ?? right.id;
          return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
        });
        await lockInventoryBalancesOnTx(
          tx,
          reservations.flatMap((reservation) => (
            reservation.quantityAllocation?.balanceId ? [reservation.quantityAllocation.balanceId] : []
          )),
        );
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
        await tx.orderBundleAllocation.updateMany({
          where: { orderId, active: true },
          data: { active: false, releasedAt: new Date() },
        });

        if (order.loyaltyRedeemed > 0) {
          const sourceRef = `loyalty:cancel-restore:${order.id}`;
          const existing = await tx.loyaltyEntry.findUnique({ where: { sourceRef } });
          if (!existing) {
            const entry = await tx.loyaltyEntry.create({
              data: {
                customerId: order.customerId,
                kind: 'refund_restore',
                label: 'Возврат бонусов при отмене заказа',
                amount: order.loyaltyRedeemed,
                sourceRef,
                orderId: order.id,
              },
            });
            releaseEvents.push({
              type: EventType.LoyaltyRefundRestored,
              actor,
              payload: { orderId, entryId: entry.id, amount: order.loyaltyRedeemed },
              refs: [order.id, entry.id],
            });
          }
        }

        for (const payment of order.payments.filter((candidate) => candidate.amount > 0 && candidate.giftCardId)) {
          const reversalKey = `cancel-refund:${order.id}:${payment.id}`;
          const alreadyReversed = await tx.payment.findUnique({ where: { idempotencyKey: reversalKey } });
          if (alreadyReversed) continue;
          const card = await tx.giftCard.update({
            where: { id: payment.giftCardId! },
            data: { balance: { increment: payment.amount }, status: 'active' },
          });
          const reversal = await tx.payment.create({
            data: {
              orderId: order.id,
              originalPaymentId: payment.id,
              amount: -payment.amount,
              method: payment.method,
              status: 'refunded',
              giftCardId: payment.giftCardId,
              idempotencyKey: reversalKey,
              receivedBy: actor,
            },
          });
          await tx.giftCardTransaction.create({
            data: {
              giftCardId: card.id,
              paymentId: reversal.id,
              type: 'refund',
              amount: payment.amount,
              balanceAfter: card.balance,
              sourceRef: `giftcard:cancel-refund:${payment.id}`,
              actor,
            },
          });
          releaseEvents.push({
            type: EventType.PaymentRefunded,
            actor,
            payload: { orderId, paymentId: reversal.id, originalPaymentId: payment.id, amount: payment.amount, reason: 'order_cancelled' },
            refs: [order.id, payment.id, reversal.id],
          });
        }
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
        // Ставка начисления — параметр владельца (`loyalty.earn_rate_bps`);
        // раньше 100 bps были константой в модуле лояльности.
        const earnRateBps = this.settings ? await this.settings.value('loyalty.earn_rate_bps') : undefined;
        const loyaltyEarned = await earnLoyaltyOnTx(tx, {
          earnRateBps,
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
          // `order_ready` — единственное сообщение, ради которого самовывоз
          // вообще имеет смысл: без него человек не узнает, что заказ можно
          // забрать.
          transactional: true,
        });
      }
      if (this.outbox && to === 'completed') {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: order.customerId,
          template: 'order_completed',
          payload: { orderId, from: order.status, to, total: order.total },
          transactional: true,
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

  async listByStatusForStaff(status: OrderStatus, staffId: string, limit = 50) {
    const ownOpenShift = await this.prisma.cashShift.findFirst({
      where: { staffId, closedAt: null },
      select: { id: true },
    });
    return this.prisma.order.findMany({
      where: {
        status,
        ...(ownOpenShift
          ? {
              OR: [
                { posShiftId: null },
                { posShiftId: { not: ownOpenShift.id } },
              ],
            }
          : {}),
      },
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
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      this.assertNotDemo(order);
      assertTransition(order.status, 'reserved');

      const currentProducts = await tx.product.findMany({
        where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
        include: { bundleComponents: { include: { componentProduct: true } } },
      });
      const currentProductsBySku = new Map(currentProducts.map((product) => [product.sku, product]));
      const inventorySpecs = new Map<string, OrderInventorySnapshot>();
      for (const item of order.items) {
        const product = currentProductsBySku.get(item.sku);
        const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
          productId: product.id,
          trackingMode: product.trackingMode,
          components: product.bundleComponents.map((component) => ({
            productId: component.componentProductId,
            sku: component.componentProduct.sku,
            trackingMode: component.componentProduct.trackingMode,
            qty: component.qty,
          })),
        } : null);
        if (snapshot) inventorySpecs.set(item.id, snapshot);
      }
      const quantityProductIds = [...new Set([...inventorySpecs.values()].flatMap((snapshot) => {
        if (snapshot.components.length > 0) {
          return snapshot.components
            .filter((component) => component.trackingMode === 'quantity')
            .map((component) => component.productId);
        }
        return snapshot.trackingMode === 'quantity' ? [snapshot.productId] : [];
      }))];
      if (quantityProductIds.length > 0) {
        const balances = await tx.inventoryBalance.findMany({
          where: {
            productId: { in: quantityProductIds },
            ...(order.fulfillmentLocation ? { location: order.fulfillmentLocation } : {}),
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        await lockInventoryBalancesOnTx(tx, balances.map((balance) => balance.id));
      }

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const events: AuditInput[] = [];
      const assigned: string[] = [];
      let nextLineNumber = Math.max(0, ...order.items.map((item) => item.lineNumber)) + 1;
      const serializedProductIds = [...new Set([...inventorySpecs.values()].flatMap((snapshot) => {
        if (snapshot.components.length > 0) {
          return snapshot.components
            .filter((component) => component.trackingMode === 'serialized')
            .map((component) => component.productId);
        }
        return snapshot.trackingMode === 'serialized' ? [snapshot.productId] : [];
      }))];
      const serializedProducts = serializedProductIds.length > 0
        ? await tx.product.findMany({ where: { id: { in: serializedProductIds } }, select: { id: true, cost: true } })
        : [];
      const serializedCosts = new Map(serializedProducts.map((product) => [product.id, product.cost]));

      const reserveUnit = async (imei: string, sku: string, expectedProductId: string) => {
        // Conditional claim — a findUnique→update would let two concurrent fulfills both
        // pass the in-stock check and double-reserve one device to two orders. Gate the
        // write on status:'in_stock' (mirror units.reserveOnTx); 0 rows → unit already taken.
        const candidate = await tx.deviceUnit.findUnique({
          where: { imei },
          select: { acquisitionCost: true, consignmentItem: { select: { id: true } } },
        });
        const acquisitionCost = candidate?.consignmentItem
          ? candidate.acquisitionCost
          : candidate?.acquisitionCost ?? serializedCosts.get(expectedProductId);
        if (!candidate?.consignmentItem && acquisitionCost === undefined) {
          throw new ConflictError('unit_acquisition_cost_missing', `Для единицы ${imei} не определена себестоимость`);
        }
        const claimed = await tx.deviceUnit.updateMany({
          where: { imei, productId: expectedProductId, status: 'in_stock' },
          data: { status: 'reserved', orderId, acquisitionCost },
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
        const inventorySpec = inventorySpecs.get(item.id);
        if (item.imei) {
          // already serialized (e.g. POS) — reserve if still in stock
          const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
          if (!unit || !inventorySpec || unit.productId !== inventorySpec.productId) {
            throw new ConflictError('unit_product_mismatch', `Единица ${item.imei} не соответствует товару ${item.sku}`);
          }
          if (unit && order.fulfillmentLocation && unit.location !== order.fulfillmentLocation) {
            throw new ConflictError('unit_wrong_store_point', `Единица ${item.imei} недоступна в выбранной точке`);
          }
          if (unit.status !== 'in_stock') {
            throw new ConflictError('unit_already_taken', `Единица ${item.imei} уже занята — повторите`);
          }
          await reserveUnit(item.imei, item.sku, inventorySpec.productId);
          continue;
        }
        if (!inventorySpec) continue; // historical non-stock/service line

        if (inventorySpec.components.length > 0) {
          for (const component of inventorySpec.components) {
            const required = component.qty * item.qty;
            if (component.trackingMode === 'quantity') {
              await this.reserveQuantityOnTx(
                tx, orderId, item.id, component.productId,
                component.sku, required, order.fulfillmentLocation,
                expiresAt, actor, events, false,
              );
              continue;
            }
            const units = await tx.deviceUnit.findMany({
              where: {
                productId: component.productId,
                status: 'in_stock',
                consignmentItem: { is: null },
                ...(order.fulfillmentLocation ? { location: order.fulfillmentLocation } : {}),
              },
              take: required,
              orderBy: { id: 'asc' },
            });
            if (units.length < required) {
              throw new ConflictError(
                'insufficient_bundle_stock',
                `Для набора ${item.sku} недостаточно ${component.sku}: нужно ${required}, в наличии ${units.length}`,
              );
            }
            for (const unit of units) {
              await reserveUnit(unit.imei, component.sku, component.productId);
              await tx.orderBundleAllocation.create({
                data: {
                  orderId,
                  orderItemId: item.id,
                  bundleSku: item.sku,
                  componentProductId: component.productId,
                  componentSku: component.sku,
                  location: unit.location,
                  imei: unit.imei,
                },
              });
            }
          }
          continue;
        }

        if (inventorySpec.trackingMode === 'quantity') {
          await this.reserveQuantityOnTx(
            tx, orderId, item.id, inventorySpec.productId, item.sku, item.qty,
            order.fulfillmentLocation, expiresAt, actor, events,
          );
          continue;
        }

        const units = await tx.deviceUnit.findMany({
          where: {
            productId: inventorySpec.productId,
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

        // Preserve the legal line totals while normalizing one serialized unit per row.
        // Cumulative integer splitting makes all generated rows add back to the source row.
        const originalQty = item.qty;
        const splitSnapshot = (index: number) => {
          const discountAmount = splitInteger(item.discountAmount, index, originalQty);
          const taxAmount = splitInteger(item.taxAmount, index, originalQty);
          return {
            discountAmount,
            taxBaseAmount: item.price - discountAmount - taxAmount,
            taxAmount,
          };
        };
        await tx.orderItem.update({
          where: { id: item.id },
          data: { qty: 1, imei: units[0].imei, ...splitSnapshot(0) },
        });
        await reserveUnit(units[0].imei, item.sku, inventorySpec.productId);
        for (const [offset, unit] of units.slice(1).entries()) {
          await tx.orderItem.create({
            data: {
              orderId,
              lineNumber: nextLineNumber++,
              sku: item.sku,
              qty: 1,
              price: item.price,
              unitCost: item.unitCost,
              taxCode: item.taxCode,
              taxRateBps: item.taxRateBps,
              ...splitSnapshot(offset + 1),
              imei: unit.imei,
              ...(item.inventorySnapshot
                ? { inventorySnapshot: item.inventorySnapshot as Prisma.InputJsonValue }
                : {}),
            },
          });
          await reserveUnit(unit.imei, item.sku, inventorySpec.productId);
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
        await finalizeOrderInventorySaleOnTx(tx, {
          orderId: order.id,
          actor,
          units: this.units,
          events,
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
    allowConsignment = true,
  ): Promise<void> {
    const balances = await tx.inventoryBalance.findMany({
      where: { productId, ...(preferredLocation ? { location: preferredLocation } : {}) },
      orderBy: { location: 'asc' },
    });
    let remaining = quantity;
    for (const balance of balances) {
      if (remaining === 0) break;
      const consignmentAvailable = allowConsignment
        ? 0
        : (await tx.quantityConsignmentLot.aggregate({
          where: { balanceId: balance.id },
          _sum: { availableQty: true },
        }))._sum.availableQty ?? 0;
      const desired = Math.min(
        remaining,
        Math.max(0, balance.onHand - balance.reserved - consignmentAvailable),
      );
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
      if (allowConsignment) {
        await reserveQuantityConsignmentOnTx(tx, {
          orderQuantityAllocationId: allocation.id,
          balanceId: balance.id,
          qty: desired,
        });
      }
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

}

function directAvailability(product: {
  trackingMode: 'serialized' | 'quantity';
  units: unknown[];
  balances: Array<{ onHand: number; reserved: number }>;
}): number {
  if (product.trackingMode === 'serialized') return product.units.length;
  return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
}

function orderTaxSnapshot(
  items: Array<{ sku: string; qty: number; price: number }>,
  taxBySku: Map<string, { taxCode: string; taxRateBps: number }>,
  orderTotal: number,
  deliveryFee: number,
) {
  if (!Number.isSafeInteger(orderTotal) || !Number.isSafeInteger(deliveryFee) || orderTotal < deliveryFee) {
    throw new ValidationError('order_tax_total_invalid', 'Итог заказа меньше стоимости доставки');
  }
  return salesTaxSnapshot(items.map((item, index) => {
    const classification = taxBySku.get(item.sku);
    if (!classification) throw new ValidationError('product_not_found', `Товар ${item.sku} не найден`);
    return {
      lineNumber: index + 1,
      grossAmount: item.price * item.qty,
      taxCode: classification.taxCode,
      taxRateBps: classification.taxRateBps,
    };
  }), orderTotal - deliveryFee);
}

function splitInteger(total: number, index: number, parts: number) {
  const before = Number(BigInt(total) * BigInt(index) / BigInt(parts));
  const after = Number(BigInt(total) * BigInt(index + 1) / BigInt(parts));
  return after - before;
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

function assertOrderTenderSettled(order: { id: string; total: number; payments: { amount: number }[] }): void {
  if (order.total <= 0) return;
  const received = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (received < order.total) {
    throw new ConflictError('order_payment_unsettled', `Заказ ${order.id} нельзя отметить оплаченным без полученной оплаты`);
  }
}

function assertOrderReplayCompatible(
  existing: {
    customerId: string;
    channel: string;
    fulfillmentType: string;
    paymentMode: string;
    total: number;
    storePointId: string | null;
    pickupPoint: string | null;
    deliveryAddress: string | null;
    deliverySlot: string | null;
    deliveryZoneId: string | null;
    deliverySlotId: string | null;
    promoCode: string | null;
    loyaltyRedeemed: number;
    idempotencyRequestHash: string | null;
    items: Array<{ sku: string; qty: number; price: number; imei: string | null }>;
  },
  dto: CreateOrderDto,
  compareImei = true,
  requestHash = orderRequestHash(dto, compareImei),
): void {
  if (existing.customerId !== dto.customerId) {
    throw new ConflictError('order_idempotency_owner_mismatch', 'Ключ заказа уже использован');
  }
  if (existing.idempotencyRequestHash) {
    if (existing.idempotencyRequestHash !== requestHash) {
      throw new ConflictError('order_idempotency_mismatch', 'Idempotency-Key уже использован для другого заказа');
    }
    return;
  }
  const requestedFulfillment = dto.fulfillmentType ?? defaultFulfillment(dto.channel);
  const materialMismatch = existing.channel !== dto.channel
    || existing.fulfillmentType !== requestedFulfillment
    || existing.paymentMode !== (dto.paymentMode ?? 'prepaid')
    || (compareImei && existing.total !== dto.total)
    || (dto.storePointId !== undefined && existing.storePointId !== dto.storePointId)
    || (compareImei && existing.pickupPoint !== (dto.pickupPoint?.trim() || null))
    || existing.deliveryAddress !== (dto.deliveryAddress?.trim() || null)
    || existing.deliverySlot !== (dto.deliverySlot?.trim() || null)
    || existing.deliveryZoneId !== (dto.deliveryZoneId ?? null)
    || existing.deliverySlotId !== (dto.deliverySlotId ?? null)
    || existing.promoCode !== normalizePromo(dto.promoCode)
    || existing.loyaltyRedeemed !== (dto.loyaltyPoints ?? 0)
    || normalizedReplayItems(existing.items, compareImei) !== normalizedReplayItems(dto.items, compareImei)
    || (compareImei && normalizedReplayPrices(existing.items) !== normalizedReplayPrices(dto.items));
  if (materialMismatch) {
    throw new ConflictError('order_idempotency_mismatch', 'Idempotency-Key уже использован для другого заказа');
  }
}

function normalizedReplayPrices(items: Array<{ sku: string; qty: number; price: number; imei?: string | null }>): string {
  return [...items]
    .map((item) => ({ sku: item.sku, qty: item.qty, price: item.price, imei: item.imei ?? null }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
    .map(stableJson)
    .join('\u0001');
}

function orderRequestHash(dto: CreateOrderDto, compareImei: boolean): string {
  const material = {
    customerId: dto.customerId,
    channel: dto.channel,
    fulfillmentType: dto.fulfillmentType ?? defaultFulfillment(dto.channel),
    paymentMode: dto.paymentMode ?? 'prepaid',
    storePointId: dto.storePointId ?? null,
    pickupPoint: dto.pickupPoint?.trim() || null,
    deliveryAddress: dto.deliveryAddress?.trim() || null,
    deliverySlot: dto.deliverySlot?.trim() || null,
    deliveryZoneId: dto.deliveryZoneId ?? null,
    deliverySlotId: dto.deliverySlotId ?? null,
    promoCode: normalizePromo(dto.promoCode),
    loyaltyPoints: dto.loyaltyPoints ?? 0,
    attribution: dto.attribution ?? null,
    clientTotal: compareImei ? dto.total : null,
    items: normalizedReplayItems(dto.items, compareImei),
    clientPrices: compareImei
      ? [...dto.items]
        .map((item) => ({ sku: item.sku, qty: item.qty, imei: item.imei ?? null, price: item.price }))
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
      : null,
  };
  return createHash('sha256').update(stableJson(material)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedReplayItems(items: Array<{ sku: string; qty: number; imei?: string | null }>, compareImei: boolean): string {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const key = compareImei ? `${item.sku}\u0000${item.imei ?? ''}` : item.sku;
    quantities.set(key, (quantities.get(key) ?? 0) + item.qty);
  }
  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, qty]) => `${key}\u0000${qty}`)
    .join('\u0001');
}
