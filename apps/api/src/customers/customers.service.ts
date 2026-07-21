import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import type { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { ConflictError } from '../common/errors';
import type { Customer, CustomerAddress } from '@prisma/client';
import { CreateCustomerAddressDto, UpdateCustomerAddressDto, UpdateCustomerSettingsDto, UpsertCustomerDto } from './customers.dto';
import { buildCustomerOverview, CustomerOverview } from './customer-overview';
import { warrantyCoverage } from './warranty-coverage';

/**
 * Customers for storefront/guest checkout. Phone is the natural key (unique), so
 * find-or-create is idempotent — repeat checkouts from the same phone reuse the
 * customer instead of duplicating. PII (phone) is masked for junior roles at the
 * read layer; that lands with auth/roles.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Имя `ownerSettings`, потому что `settings()` уже занят методом настроек
    // клиента — это разные вещи.
    private readonly ownerSettings: SettingsService,
  ) {}

  get(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  async loyalty(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { ltv: true, segments: true } });
    if (!customer) throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    const now = new Date();
    const [entries, coupons] = await Promise.all([
      this.prisma.loyaltyEntry.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.customerCoupon.findMany({
        where: { customerId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const balance = entries
      .filter((entry) => !entry.expiresAt || entry.expiresAt > now)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const level = loyaltyLevel(customer.ltv, customer.segments);
    return { balance: Math.max(0, balance), conversion: 1, level: level.name, nextLevelSpend: level.next, coupons, history: entries };
  }

  addresses(customerId: string) {
    return this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createAddress(customerId: string, dto: CreateCustomerAddressDto, idempotencyKey: string) {
    const normalized = normalizeAddress(dto);
    const existing = await this.prisma.customerAddress.findUnique({ where: { idempotencyKey } });
    if (existing) return replayAddress(existing, customerId, normalized);
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-address:' + customerId}))::text AS locked`;
      const replay = await tx.customerAddress.findUnique({ where: { idempotencyKey } });
      if (replay) return { result: replayAddress(replay, customerId, normalized), events: [] };
      const count = await tx.customerAddress.count({ where: { customerId } });
      const isPrimary = count === 0 || normalized.isPrimary;
      if (isPrimary) await tx.customerAddress.updateMany({ where: { customerId }, data: { isPrimary: false } });
      const address = await tx.customerAddress.create({
        data: { customerId, ...normalized, isPrimary, idempotencyKey },
      });
      return {
        result: address,
        events: [{ type: EventType.CustomerAddressCreated, actor: customerId, payload: { customerId, addressId: address.id, isPrimary }, refs: [customerId, address.id] }],
      };
    });
  }

  async updateAddress(customerId: string, addressId: string, dto: UpdateCustomerAddressDto) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-address:' + customerId}))::text AS locked`;
      const current = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      if (!current) throw new ValidationError('address_not_found', 'Адрес не найден');
      const data: { title?: string; text?: string; comment?: string | null; isPrimary?: boolean } = {};
      if (dto.title !== undefined) data.title = requiredText(dto.title, 'Название адреса');
      if (dto.text !== undefined) data.text = requiredText(dto.text, 'Адрес');
      if (dto.comment !== undefined) data.comment = dto.comment.trim() || null;
      if (dto.isPrimary === true) {
        await tx.customerAddress.updateMany({ where: { customerId, id: { not: addressId } }, data: { isPrimary: false } });
        data.isPrimary = true;
      }
      const address = await tx.customerAddress.update({ where: { id: addressId }, data });
      return {
        result: address,
        events: [{ type: EventType.CustomerAddressUpdated, actor: customerId, payload: { customerId, addressId, changed: Object.keys(data) }, refs: [customerId, addressId] }],
      };
    });
  }

  async deleteAddress(customerId: string, addressId: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-address:' + customerId}))::text AS locked`;
      const current = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      if (!current) throw new ValidationError('address_not_found', 'Адрес не найден');
      await tx.customerAddress.delete({ where: { id: addressId } });
      if (current.isPrimary) {
        const fallback = await tx.customerAddress.findFirst({ where: { customerId }, orderBy: { createdAt: 'asc' } });
        if (fallback) await tx.customerAddress.update({ where: { id: fallback.id }, data: { isPrimary: true } });
      }
      return {
        result: { id: addressId },
        events: [{ type: EventType.CustomerAddressDeleted, actor: customerId, payload: { customerId, addressId }, refs: [customerId, addressId] }],
      };
    });
  }

  async settings(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    const preferences = await this.prisma.customerPreferences.findUnique({ where: { customerId } });
    return { id: customer.id, phone: customer.phone, name: customer.name, consent: customer.consent, ...preferenceValues(preferences) };
  }

  async updateSettings(customerId: string, dto: UpdateCustomerSettingsDto) {
    return this.audit.transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
      const currentPreferences = await tx.customerPreferences.findUnique({ where: { customerId } });
      const prefs = preferenceValues(currentPreferences);
      const preferencePatch = pickPreferences(dto);
      const name = dto.name === undefined ? customer.name : requiredText(dto.name, 'Имя');
      const consent = dto.consent ?? customer.consent;
      const updatedCustomer = await tx.customer.update({ where: { id: customerId }, data: { name, consent } });
      const updatedPreferences = await tx.customerPreferences.upsert({
        where: { customerId }, create: { customerId, ...prefs, ...preferencePatch }, update: preferencePatch,
      });
      const events = [];
      if (customer.consent !== consent) events.push({ type: EventType.ConsentChanged, actor: customerId, payload: { customerId, from: customer.consent, to: consent }, refs: [customerId] });
      if (customer.name !== name) events.push({ type: EventType.CustomerProfileUpdated, actor: customerId, payload: { customerId, changed: ['name'] }, refs: [customerId] });
      if (Object.keys(preferencePatch).some((key) => prefs[key as keyof typeof prefs] !== preferencePatch[key as keyof typeof preferencePatch])) {
        events.push({ type: EventType.CustomerPreferencesChanged, actor: customerId, payload: { customerId, changed: Object.keys(preferencePatch) }, refs: [customerId] });
      }
      return { result: { id: updatedCustomer.id, phone: updatedCustomer.phone, name: updatedCustomer.name, consent: updatedCustomer.consent, ...preferenceValues(updatedPreferences) }, events };
    });
  }

  /**
   * Toggle marketing consent (Notification Preferences). Idempotent — writes the
   * customer.consent_changed ledger event only when the value actually flips, so the
   * audit trail records real consent decisions (withdrawal must stop all campaigns).
   */
  async setConsent(customerId: string, consent: boolean, actor: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    }
    return this.audit.transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id: customerId }, data: { consent } });
      const events =
        customer.consent === consent
          ? []
          : [
              {
                type: EventType.ConsentChanged,
                actor,
                payload: { customerId, from: customer.consent, to: consent },
                refs: [customerId],
              },
            ];
      return { result: updated, events };
    });
  }

  /** Find-or-create by phone; updates the name only when a new one is provided. */
  async upsert(dto: UpsertCustomerDto) {
    return this.prisma.customer.upsert({
      where: { phone: dto.phone },
      update: dto.name ? { name: dto.name } : {},
      create: { phone: dto.phone, name: dto.name ?? 'Клиент' },
    });
  }

  /**
   * Guest checkout may create a new customer, but must never identify an
   * existing customer by phone. Existing customers must authenticate first.
   */
  async createGuest(dto: UpsertCustomerDto) {
    const existing = await this.prisma.customer.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'guest_customer_requires_auth',
        message: 'Для этого номера войдите в аккаунт перед оформлением заказа',
      });
    }
    try {
      return await this.prisma.customer.create({
        data: { phone: dto.phone, name: dto.name ?? 'Клиент' },
      });
    } catch (error) {
      // A concurrent checkout can win the unique phone race after the lookup.
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException({
          code: 'guest_customer_requires_auth',
          message: 'Для этого номера войдите в аккаунт перед оформлением заказа',
        });
      }
      throw error;
    }
  }

  /**
   * Self-service data export (KG personal-data law / store review requirement).
   * One JSON document with everything tied to the account: profile, addresses,
   * orders (ids/status/totals/dates), loyalty entries, coupons and notification
   * consents/preferences. Read-only — no ledger event.
   */
  async exportData(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    // Выгрузка объявлена полной («всё, что привязано к аккаунту»), но раньше
    // отдавала меньше половины хранимого: без trade-in, гарантий, тикетов,
    // отзывов и адреса доставки заказов. Добавлено, чтобы ответ на запрос
    // субъекта совпадал с тем, что система реально хранит о человеке.
    const [addresses, orders, loyaltyEntries, coupons, preferences, tradeIns, warranties, tickets, reviews] = await Promise.all([
      this.prisma.customerAddress.findMany({ where: { customerId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.order.findMany({
        where: { customerId },
        select: { id: true, status: true, channel: true, total: true, deliveryAddress: true, pickupPoint: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loyaltyEntry.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.customerCoupon.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.customerPreferences.findUnique({ where: { customerId } }),
      this.prisma.tradeInDevice.findMany({
        where: { customerId },
        // Паспорт не выгружаем — маскируется на чтении и не является данными,
        // которые субъект запрашивает о себе (это KYC-документ магазина).
        select: { id: true, model: true, imei: true, grade: true, price: true, contractId: true },
      }),
      this.prisma.warrantyCase.findMany({
        where: { customerId },
        select: { id: true, imei: true, problem: true, status: true },
      }),
      this.prisma.supportTicket.findMany({
        where: { customerId },
        select: { id: true, subject: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productReview.findMany({
        where: { customerId },
        select: { id: true, sku: true, rating: true, text: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: { id: customer.id, phone: customer.phone, name: customer.name, consent: customer.consent, createdAt: customer.createdAt },
      addresses,
      orders,
      loyaltyEntries,
      coupons,
      tradeIns,
      warranties,
      tickets,
      reviews,
      notifications: { consent: customer.consent, ...preferenceValues(preferences) },
    };
  }

  /**
   * Self-service account deletion. The customer row stays (orders, payments,
   * loyalty and the append-only ledger reference it for accounting) but is
   * anonymized in place: name/phone become non-reversible placeholders and the
   * unique phone is freed, so the same number can OTP-register again as a fresh
   * customer. Addresses, social identities, push tokens and the notification
   * inbox are erased; every refresh session is revoked. One transaction with the
   * customer.deleted ledger event (and consent_changed when consent flips off).
   */
  async deleteAccount(customerId: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-delete:' + customerId}))::text AS locked`;
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
      if (isAnonymized(customer)) return { result: { id: customer.id, deleted: true }, events: [] };

      await tx.customer.update({
        where: { id: customerId },
        data: { name: DELETED_CUSTOMER_NAME, phone: deletedPhone(customerId), consent: false },
      });
      await tx.customerAddress.deleteMany({ where: { customerId } });
      await tx.customerIdentity.deleteMany({ where: { customerId } });
      await tx.pushToken.deleteMany({ where: { customerId } });
      await tx.customerNotification.deleteMany({ where: { customerId } });
      await tx.customerPreferences.updateMany({
        where: { customerId },
        data: { push: false, whatsapp: false, service: false, promos: false },
      });
      await tx.refreshToken.updateMany({
        where: { customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Имя клиента — независимая копия в публичном отзыве (`ProductReview`),
      // оно оставалось видимым в интернете после удаления аккаунта. Обезличиваем.
      await tx.productReview.updateMany({
        where: { customerId },
        data: { customerName: DELETED_CUSTOMER_NAME },
      });
      // Паспорт продавца Б/У — открытый текст, не нужный ни бухгалтерии, ни
      // анти-фроду (тем служат IMEI и связь с клиентом). Сама сделка остаётся.
      await tx.tradeInDevice.updateMany({
        where: { customerId },
        data: { sellerPassport: '' },
      });

      const events: AuditInput[] = [
        { type: EventType.CustomerDeleted, actor: customerId, payload: { customerId }, refs: [customerId] },
      ];
      if (customer.consent) {
        events.push({ type: EventType.ConsentChanged, actor: customerId, payload: { customerId, from: true, to: false }, refs: [customerId] });
      }
      return { result: { id: customer.id, deleted: true }, events };
    });
  }

  /**
   * Devices the customer bought — the serialized units (IMEI) sold on their orders,
   * with the product name and any open warranty case. Powers «Мои устройства».
   */
  async devices(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      select: { id: true, createdAt: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) return [];
    const purchasedAt = new Map(orders.map((o) => [o.id, o.createdAt]));

    const [units, warranties, coverageMonths] = await Promise.all([
      this.prisma.deviceUnit.findMany({
        where: { orderId: { in: orderIds }, status: { in: ['sold', 'returned', 'in_repair'] } },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.warrantyCase.findMany({ where: { customerId } }),
      // Срок гарантии — параметр владельца, а не константа рядом с кодом.
      this.ownerSettings.value('warranty.coverage_months'),
    ]);

    return units.map((u) => {
      const cover = warrantyCoverage(u.orderId ? purchasedAt.get(u.orderId) : undefined, new Date(), coverageMonths);
      return {
        imei: u.imei,
        product: u.product.name,
        status: u.status,
        warrantyUntil: cover?.until.toISOString() ?? null,
        daysLeft: cover?.daysLeft ?? null,
        warranty: warranties.find((w) => w.imei === u.imei) ?? null,
      };
    });
  }

  /**
   * Customer 360 — one read that folds the customer's orders, spend, debts,
   * warranties and support tickets together. Read-only; every figure is derived
   * from the underlying tables (Event-Ledger-first), never a stored aggregate.
   */
  async overview(customerId: string): Promise<CustomerOverview> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    }
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    const orderIds = orders.map((o) => o.id);
    const [payments, debts, warranties, tickets] = await Promise.all([
      orderIds.length
        ? this.prisma.payment.findMany({
            where: { orderId: { in: orderIds } },
            select: { amount: true, status: true },
          })
        : Promise.resolve([]),
      this.prisma.debtPlan.findMany({ where: { customerId }, orderBy: { dueDate: 'asc' } }),
      this.prisma.warrantyCase.findMany({ where: { customerId }, orderBy: { sla: 'asc' } }),
      this.prisma.supportTicket.findMany({ where: { customerId }, orderBy: { sla: 'asc' } }),
    ]);
    return buildCustomerOverview({ customer, orders, payments, debts, warranties, tickets });
  }
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError('required_text', `${label} не может быть пустым`);
  return normalized;
}

const DELETED_CUSTOMER_NAME = 'Удалённый пользователь';
const DELETED_PHONE_PREFIX = 'deleted:';

/** Unique non-reversible phone placeholder; frees the real phone for re-registration. */
function deletedPhone(customerId: string): string {
  return `${DELETED_PHONE_PREFIX}${customerId}`;
}

function isAnonymized(customer: Customer): boolean {
  return customer.phone.startsWith(DELETED_PHONE_PREFIX);
}

function normalizeAddress(dto: CreateCustomerAddressDto) {
  return { title: requiredText(dto.title, 'Название адреса'), text: requiredText(dto.text, 'Адрес'), comment: dto.comment?.trim() || null, isPrimary: dto.isPrimary === true };
}

function replayAddress(address: CustomerAddress, customerId: string, dto: ReturnType<typeof normalizeAddress>) {
  const same = address.customerId === customerId && address.title === dto.title && address.text === dto.text &&
    address.comment === dto.comment && (address.isPrimary === dto.isPrimary || (address.isPrimary && !dto.isPrimary));
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим адресом');
  return address;
}

function preferenceValues(value?: { push: boolean; whatsapp: boolean; service: boolean; promos: boolean } | null) {
  return { push: value?.push ?? true, whatsapp: value?.whatsapp ?? true, service: value?.service ?? true, promos: value?.promos ?? false };
}

function pickPreferences(dto: UpdateCustomerSettingsDto) {
  const result: Partial<ReturnType<typeof preferenceValues>> = {};
  for (const key of ['push', 'whatsapp', 'service', 'promos'] as const) if (dto[key] !== undefined) result[key] = dto[key];
  return result;
}

function loyaltyLevel(ltv: number, segments: string[]) {
  if (segments.includes('platinum') || ltv >= 1_000_000) return { name: 'Platinum', next: 0 };
  if (segments.includes('gold') || ltv >= 300_000) return { name: 'Gold', next: Math.max(0, 1_000_000 - ltv) };
  if (segments.includes('silver') || ltv >= 100_000) return { name: 'Silver', next: Math.max(0, 300_000 - ltv) };
  return { name: 'Base', next: Math.max(0, 100_000 - ltv) };
}
