import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
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

/** Reservation lifetime — every reservation must have expiresAt (invariant #7). */
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 минут
const PROMO_DISCOUNTS: Record<string, number> = { SALE5000: 5000, ALI10: 3000 };

interface CanonicalPricing {
  subtotal: number;
  deliveryFee: number;
  promoCode: string | null;
  promoDiscount: number;
  loyaltyPoints: number;
}

function defaultFulfillment(channel: string): string {
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
  ) {}

  get(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
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

    if (dto.fulfillmentType === 'courier' && !dto.deliveryAddress?.trim()) {
      throw new ValidationError('delivery_address_required', 'Укажите адрес доставки');
    }
    const quantities = new Map<string, number>();
    for (const item of dto.items) quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + item.qty);
    const skus = [...quantities.keys()];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus }, archived: false },
      include: {
        units: { where: { status: 'in_stock' }, select: { id: true } },
        bundleComponents: {
          include: {
            componentProduct: {
              include: { units: { where: { status: 'in_stock' }, select: { id: true } } },
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
            Math.floor(component.componentProduct.units.length / component.qty),
          ))
        : product.units.length;
      if (available < qty) {
        throw new ConflictError('insufficient_stock', `Недостаточно товара ${sku}: доступно ${available}`);
      }
      return { sku, qty, price: product.price };
    });
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliveryFee = fulfillmentFee(dto.fulfillmentType);
    const promoCode = normalizePromo(dto.promoCode);
    const promoDiscount = promoCode ? Math.min(subtotal, PROMO_DISCOUNTS[promoCode]) : 0;
    const loyaltyPoints = dto.loyaltyPoints ?? 0;
    if (loyaltyPoints > 0 && !allowLoyalty) {
      throw new ConflictError('loyalty_auth_required', 'Списание бонусов доступно только после входа в аккаунт');
    }
    const pricing: CanonicalPricing = { subtotal, deliveryFee, promoCode, promoDiscount, loyaltyPoints };
    return this.create(
      { ...dto, total: subtotal + deliveryFee - promoDiscount, items },
      actor,
      idempotencyKey,
      pricing,
    );
  }

  async create(dto: CreateOrderDto, actor: string, idempotencyKey?: string, pricing?: CanonicalPricing) {
    const isDemo = this.config?.get<string>('PUBLIC_DEMO_MODE')?.trim().toLowerCase() === 'true';
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
        const baseTotal = canonical.subtotal + canonical.deliveryFee - canonical.promoDiscount;
        const initialOrder = await tx.order.create({
          data: {
            idempotencyKey,
            isDemo,
            customerId: dto.customerId,
            channel: dto.channel,
            fulfillmentType: dto.fulfillmentType ?? defaultFulfillment(dto.channel),
            pickupPoint: dto.pickupPoint,
            deliveryAddress: dto.deliveryAddress,
            deliverySlot: dto.deliverySlot,
            pickupCode: pickupCode(),
            subtotal: canonical.subtotal,
            deliveryFee: canonical.deliveryFee,
            promoCode: canonical.promoCode,
            promoDiscount: canonical.promoDiscount,
            total: baseTotal,
            status: 'created',
            items: {
              create: dto.items.map((i) => ({
                sku: i.sku,
                qty: i.qty,
                price: i.price,
                imei: i.imei,
              })),
            },
          },
          include: { items: true },
        });
        const events: AuditInput[] = [];
        const loyaltyRedeemed = await redeemLoyaltyOnTx(tx, {
          customerId: dto.customerId,
          orderId: initialOrder.id,
          requested: canonical.loyaltyPoints,
          maximum: Math.max(0, canonical.subtotal - canonical.promoDiscount),
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
              pickupPoint: order.pickupPoint,
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
        if (!item.imei) continue;
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
      let updated = await tx.order.update({
        where: { id: orderId },
        data: { status: to },
      });
      const events: AuditInput[] = [
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
            const units = await tx.deviceUnit.findMany({
              where: { productId: component.componentProductId, status: 'in_stock' },
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
                  imei: unit.imei,
                },
              });
            }
          }
          continue;
        }

        const units = await tx.deviceUnit.findMany({
          where: { productId: product.id, status: 'in_stock' },
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
          await this.units.sellOnTx(tx, imei, order.id);
          events.push({
            type: EventType.UnitSold,
            actor,
            payload: { orderId, imei, method: 'loyalty' },
            refs: [orderId, imei],
          });
        }
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
}

function normalizePromo(value?: string): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (!(normalized in PROMO_DISCOUNTS)) {
    throw new ValidationError('promo_not_found', 'Промокод не найден или больше не действует');
  }
  return normalized;
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
