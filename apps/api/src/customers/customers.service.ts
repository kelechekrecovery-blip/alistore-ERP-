import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import type { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { ConflictError } from '../common/errors';
import { Prisma, type Customer, type CustomerAddress } from '@prisma/client';
import { CreateCustomerAddressDto, UpdateCustomerAddressDto, UpdateCustomerSettingsDto, UpsertCustomerDto } from './customers.dto';
import { buildCustomerOverview, CustomerOverview } from './customer-overview';
import { warrantyCoverage } from './warranty-coverage';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { revokeTelegramAgentAccessOnTx } from '../telegram-agent/telegram-agent-revocation';
import { normalizePhone } from '../auth/phone-normalization';
import {
  deletedCustomerPhone,
  isActiveCustomerPhone,
  lockActiveCustomerOnTx,
} from '../auth/customer-session-state';
import { createHash } from 'crypto';

/**
 * Customer identity boundary. Public guest creation is fail-closed and replays
 * only with the original short-lived idempotency secret; authenticated internal
 * resolvers may canonicalize or adopt legacy phone aliases under a lock.
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
    return this.audit.transaction(async (tx) => {
      await lockActiveCustomerOnTx(tx, customerId);
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
      await lockActiveCustomerOnTx(tx, customerId);
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
      await lockActiveCustomerOnTx(tx, customerId);
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
    // `email` отдаём владельцу собственного аккаунта: без него клиент не может
    // показать, привязан ли адрес, и предлагал бы привязать уже привязанный.
    return {
      id: customer.id,
      phone: customer.phone,
      email: customer.email,
      emailVerified: customer.emailVerifiedAt !== null,
      name: customer.name,
      consent: customer.consent,
      ...preferenceValues(preferences),
    };
  }

  async updateSettings(customerId: string, dto: UpdateCustomerSettingsDto) {
    return this.audit.transaction(async (tx) => {
      const customer = await lockActiveCustomerOnTx(tx, customerId);
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
    return this.audit.transaction(async (tx) => {
      const customer = await lockActiveCustomerOnTx(tx, customerId);
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
    const phone = normalizePhone(dto.phone);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-phone:' + phone}))::text AS locked`;
        const canonical = await tx.customer.findUnique({ where: { phone } });
        if (canonical) {
          return dto.name
            ? tx.customer.update({ where: { id: canonical.id }, data: { name: dto.name } })
            : canonical;
        }
        const legacy = await tx.customer.findUnique({ where: { phone: phone.slice(1) } });
        if (legacy) {
          return tx.customer.update({
            where: { id: legacy.id },
            data: { phone, ...(dto.name ? { name: dto.name } : {}) },
          });
        }
        return tx.customer.create({ data: { phone, name: dto.name ?? 'Клиент' } });
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      // Auth and support use the same canonical unique index but may not hold
      // this service's advisory lock. If one commits between our read and write,
      // recover the winner instead of turning an identity race into a 500.
      const canonical = await this.prisma.customer.findUnique({ where: { phone } });
      if (!canonical) throw error;
      if (dto.name) {
        return this.prisma.customer.update({ where: { id: canonical.id }, data: { name: dto.name } });
      }
      return canonical;
    }
  }

  /**
   * Guest checkout may create a new customer, but must never identify an
   * existing customer by phone. Existing customers must authenticate first.
   */
  async createGuest(dto: UpsertCustomerDto, rawKey: string) {
    const phone = normalizePhone(dto.phone);
    const name = dto.name?.trim() || 'Клиент';
    const key = rawKey.trim();
    // Temporary expand/contract compatibility for already-installed clients.
    // They may create once without replay protection; malformed supplied keys
    // still fail closed. Remove only after client adoption is proven.
    if (!key) return this.createGuestLegacy(phone, name);
    if (!GUEST_CUSTOMER_KEY_PATTERN.test(key)) {
      throw new ValidationError('idempotency_key_invalid', 'Требуется криптографически случайный UUIDv4 Idempotency-Key');
    }
    const keyHash = sha256(key);
    const requestHash = sha256(JSON.stringify({ phone, name }));
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'guest-customer-key:' + keyHash}))::text AS locked`;
        const replay = await tx.customer.findUnique({ where: { guestCreateKeyHash: keyHash } });
        if (replay) return replayGuestCustomer(replay, requestHash);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-phone:' + phone}))::text AS locked`;
        const existing = await tx.customer.findFirst({
          where: { phone: { in: [phone, phone.slice(1)] } },
          select: { id: true },
        });
        if (existing) throw guestCustomerRequiresAuth();
        const expiresAt = new Date(Date.now() + GUEST_CUSTOMER_REPLAY_TTL_MS);
        const customer = await tx.customer.create({
          data: {
            phone,
            name,
            guestCreateKeyHash: keyHash,
            guestCreateRequestHash: requestHash,
            guestCreateExpiresAt: expiresAt,
          },
        });
        return { customer, expiresAt };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const replay = await this.prisma.customer.findUnique({ where: { guestCreateKeyHash: keyHash } });
        if (replay) return replayGuestCustomer(replay, requestHash);
        // A concurrent checkout can win the unique phone race after the lookup.
        throw guestCustomerRequiresAuth();
      }
      throw error;
    }
  }

  private async createGuestLegacy(phone: string, name: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-phone:' + phone}))::text AS locked`;
        const existing = await tx.customer.findFirst({
          where: { phone: { in: [phone, phone.slice(1)] } },
          select: { id: true },
        });
        if (existing) throw guestCustomerRequiresAuth();
        const customer = await tx.customer.create({ data: { phone, name } });
        return { customer, expiresAt: new Date(Date.now() + GUEST_CUSTOMER_REPLAY_TTL_MS) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw guestCustomerRequiresAuth();
      throw error;
    }
  }

  /** Staff intake may resolve an existing identity, but never overwrite its profile name. */
  async resolveForStaff(dto: UpsertCustomerDto) {
    const phone = normalizePhone(dto.phone);
    const suppliedName = dto.name?.trim() || 'Клиент';
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-phone:' + phone}))::text AS locked`;
        const canonical = await tx.customer.findUnique({ where: { phone } });
        if (canonical) {
          return canonical.name.trim()
            ? canonical
            : tx.customer.update({ where: { id: canonical.id }, data: { name: suppliedName } });
        }
        const legacy = await tx.customer.findUnique({ where: { phone: phone.slice(1) } });
        if (legacy) {
          return tx.customer.update({
            where: { id: legacy.id },
            data: { phone, ...(!legacy.name.trim() ? { name: suppliedName } : {}) },
          });
        }
        return tx.customer.create({ data: { phone, name: suppliedName } });
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const winner = await this.prisma.customer.findUnique({ where: { phone } });
      if (!winner) throw error;
      return winner;
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
   * inbox and Telegram-agent access traces are erased; every refresh session is
   * revoked. One transaction with the customer.deleted ledger event (and
   * consent_changed when consent flips off).
   */
  async deleteAccount(customerId: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-delete:' + customerId}))::text AS locked`;
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
      await revokeTelegramAgentAccessOnTx(
        tx,
        { customerId },
        'customer_account_deleted',
        true,
      );
      const ownedOrderIds = (await tx.order.findMany({
        where: { customerId },
        select: { id: true },
      })).map((order) => order.id);
      const paymentIntentOwner = {
        OR: [
          { customerId },
          { orderId: { in: ownedOrderIds } },
        ],
      } satisfies Prisma.OnlinePaymentIntentCommandWhereInput;
      const revokedAt = new Date();
      await tx.onlinePaymentIntentCommand.updateMany({
        where: { ...paymentIntentOwner, status: 'queued', customerRevokedAt: null },
        data: {
          status: 'cancelled',
          customerRevokedAt: revokedAt,
          terminalAt: revokedAt,
          response: Prisma.DbNull,
        },
      });
      // An in-flight provider call keeps its claim so its finalizer can persist
      // provider evidence, but it may no longer publish the hosted-payment URL.
      await tx.onlinePaymentIntentCommand.updateMany({
        where: { ...paymentIntentOwner, status: 'creating', customerRevokedAt: null },
        data: { customerRevokedAt: revokedAt, response: Prisma.DbNull },
      });
      await tx.onlinePaymentIntentCommand.updateMany({
        where: {
          ...paymentIntentOwner,
          customerRevokedAt: null,
          status: { in: ['creation_unknown', 'requires_action', 'manual_review'] },
        },
        data: {
          status: 'cancel_pending',
          customerRevokedAt: revokedAt,
          response: Prisma.DbNull,
        },
      });
      await tx.onlinePaymentIntentCommand.updateMany({
        where: {
          ...paymentIntentOwner,
          customerRevokedAt: null,
          status: { in: ['paid', 'creation_failed', 'payment_failed', 'cancelled', 'expired'] },
        },
        data: { customerRevokedAt: revokedAt, response: Prisma.DbNull },
      });

      if (isAnonymized(customer)) return { result: { id: customer.id, deleted: true }, events: [] };

      // Строго до переименования: challenge'ы связаны с клиентом только телефоном
      // и адресом, после подмены на `deleted:<id>` и обнуления email их уже не
      // найти, и контакты остались бы в базе открытым текстом навсегда — при том
      // что аккаунт удалён.
      await tx.otpChallenge.deleteMany({
        where: {
          OR: [
            { customerId },
            { phone: customer.phone },
            ...(customer.email ? [{ email: customer.email }] : []),
          ],
        },
      });
      // Телефон закрывал вход сам собой: под регулярку `RequestOtpDto`
      // (`^\+?\d{9,15}$`) строка `deleted:<id>` не подходит, поэтому кода на неё
      // не выдать. Почта этой защиты не наследует — `requestEmailOtp` ищет живого
      // клиента по адресу и ничего не знает про обезличивание. Оставить адрес
      // значило бы отдать полный токен на «удалённый» аккаунт любому, кто владеет
      // ящиком: история заказов, бонусы, гарантии. Обнуляем явно.
      await tx.customer.update({
        where: { id: customerId },
        data: {
          name: DELETED_CUSTOMER_NAME,
          phone: deletedCustomerPhone(customerId),
          guestCreateKeyHash: null,
          guestCreateRequestHash: null,
          guestCreateExpiresAt: null,
          email: null,
          consent: false,
        },
      });
      await tx.customerAddress.deleteMany({ where: { customerId } });
      // Unlink PII before removing the social identity. The worker can now
      // revoke Apple grants with bounded retries even if Apple is unavailable;
      // local account deletion is never held hostage by an external service.
      const appleGrants = await tx.appleOAuthGrant.findMany({ where: { customerId } });
      if (appleGrants.length > 0) {
        await tx.appleRevocationJob.createMany({
          data: appleGrants.map((grant) => ({
            subject: grant.subject,
            clientId: grant.clientId,
            refreshTokenEnvelope: grant.refreshTokenEnvelope,
          })),
        });
        await tx.appleOAuthGrant.deleteMany({ where: { customerId } });
      }
      await tx.customerIdentity.deleteMany({ where: { customerId } });
      await tx.socialEnrollment.deleteMany({ where: { customerId } });
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
      await tx.refreshToken.updateMany({
        where: { customerId, rotatedAt: { not: null } },
        data: { rotatedAt: null },
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

function guestCustomerRequiresAuth() {
  return new ConflictException({
    code: 'guest_customer_requires_auth',
    message: 'Для этого номера войдите в аккаунт перед оформлением заказа',
  });
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError('required_text', `${label} не может быть пустым`);
  return normalized;
}

const DELETED_CUSTOMER_NAME = 'Удалённый пользователь';
const GUEST_CUSTOMER_REPLAY_TTL_MS = 30 * 60 * 1000;
const GUEST_CUSTOMER_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function replayGuestCustomer(
  customer: Customer & { guestCreateRequestHash: string | null; guestCreateExpiresAt: Date | null },
  requestHash: string,
) {
  if (customer.guestCreateRequestHash !== requestHash) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован с другим guest checkout');
  }
  if (!customer.guestCreateExpiresAt || customer.guestCreateExpiresAt.getTime() <= Date.now()) {
    throw new ConflictError('guest_customer_replay_expired', 'Срок безопасного повтора истёк; войдите в аккаунт');
  }
  return { customer, expiresAt: customer.guestCreateExpiresAt };
}

function isAnonymized(customer: Customer): boolean {
  return !isActiveCustomerPhone(customer.phone);
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
