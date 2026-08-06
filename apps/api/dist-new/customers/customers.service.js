"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const settings_service_1 = require("../settings/settings.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const errors_2 = require("../common/errors");
const customer_overview_1 = require("./customer-overview");
const warranty_coverage_1 = require("./warranty-coverage");
const prisma_errors_1 = require("../common/prisma-errors");
const telegram_agent_revocation_1 = require("../telegram-agent/telegram-agent-revocation");
let CustomersService = class CustomersService {
    constructor(prisma, audit, ownerSettings) {
        this.prisma = prisma;
        this.audit = audit;
        this.ownerSettings = ownerSettings;
    }
    get(id) {
        return this.prisma.customer.findUnique({ where: { id } });
    }
    async loyalty(customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { ltv: true, segments: true } });
        if (!customer)
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
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
    addresses(customerId) {
        return this.prisma.customerAddress.findMany({
            where: { customerId },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        });
    }
    async createAddress(customerId, dto, idempotencyKey) {
        const normalized = normalizeAddress(dto);
        const existing = await this.prisma.customerAddress.findUnique({ where: { idempotencyKey } });
        if (existing)
            return replayAddress(existing, customerId, normalized);
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'customer-address:' + customerId}))::text AS locked`;
            const replay = await tx.customerAddress.findUnique({ where: { idempotencyKey } });
            if (replay)
                return { result: replayAddress(replay, customerId, normalized), events: [] };
            const count = await tx.customerAddress.count({ where: { customerId } });
            const isPrimary = count === 0 || normalized.isPrimary;
            if (isPrimary)
                await tx.customerAddress.updateMany({ where: { customerId }, data: { isPrimary: false } });
            const address = await tx.customerAddress.create({
                data: { customerId, ...normalized, isPrimary, idempotencyKey },
            });
            return {
                result: address,
                events: [{ type: event_types_1.EventType.CustomerAddressCreated, actor: customerId, payload: { customerId, addressId: address.id, isPrimary }, refs: [customerId, address.id] }],
            };
        });
    }
    async updateAddress(customerId, addressId, dto) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'customer-address:' + customerId}))::text AS locked`;
            const current = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
            if (!current)
                throw new errors_1.ValidationError('address_not_found', 'Адрес не найден');
            const data = {};
            if (dto.title !== undefined)
                data.title = requiredText(dto.title, 'Название адреса');
            if (dto.text !== undefined)
                data.text = requiredText(dto.text, 'Адрес');
            if (dto.comment !== undefined)
                data.comment = dto.comment.trim() || null;
            if (dto.isPrimary === true) {
                await tx.customerAddress.updateMany({ where: { customerId, id: { not: addressId } }, data: { isPrimary: false } });
                data.isPrimary = true;
            }
            const address = await tx.customerAddress.update({ where: { id: addressId }, data });
            return {
                result: address,
                events: [{ type: event_types_1.EventType.CustomerAddressUpdated, actor: customerId, payload: { customerId, addressId, changed: Object.keys(data) }, refs: [customerId, addressId] }],
            };
        });
    }
    async deleteAddress(customerId, addressId) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'customer-address:' + customerId}))::text AS locked`;
            const current = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
            if (!current)
                throw new errors_1.ValidationError('address_not_found', 'Адрес не найден');
            await tx.customerAddress.delete({ where: { id: addressId } });
            if (current.isPrimary) {
                const fallback = await tx.customerAddress.findFirst({ where: { customerId }, orderBy: { createdAt: 'asc' } });
                if (fallback)
                    await tx.customerAddress.update({ where: { id: fallback.id }, data: { isPrimary: true } });
            }
            return {
                result: { id: addressId },
                events: [{ type: event_types_1.EventType.CustomerAddressDeleted, actor: customerId, payload: { customerId, addressId }, refs: [customerId, addressId] }],
            };
        });
    }
    async settings(customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer)
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
        const preferences = await this.prisma.customerPreferences.findUnique({ where: { customerId } });
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
    async updateSettings(customerId, dto) {
        return this.audit.transaction(async (tx) => {
            const customer = await tx.customer.findUnique({ where: { id: customerId } });
            if (!customer)
                throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
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
            if (customer.consent !== consent)
                events.push({ type: event_types_1.EventType.ConsentChanged, actor: customerId, payload: { customerId, from: customer.consent, to: consent }, refs: [customerId] });
            if (customer.name !== name)
                events.push({ type: event_types_1.EventType.CustomerProfileUpdated, actor: customerId, payload: { customerId, changed: ['name'] }, refs: [customerId] });
            if (Object.keys(preferencePatch).some((key) => prefs[key] !== preferencePatch[key])) {
                events.push({ type: event_types_1.EventType.CustomerPreferencesChanged, actor: customerId, payload: { customerId, changed: Object.keys(preferencePatch) }, refs: [customerId] });
            }
            return { result: { id: updatedCustomer.id, phone: updatedCustomer.phone, name: updatedCustomer.name, consent: updatedCustomer.consent, ...preferenceValues(updatedPreferences) }, events };
        });
    }
    async setConsent(customerId, consent, actor) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
        }
        return this.audit.transaction(async (tx) => {
            const updated = await tx.customer.update({ where: { id: customerId }, data: { consent } });
            const events = customer.consent === consent
                ? []
                : [
                    {
                        type: event_types_1.EventType.ConsentChanged,
                        actor,
                        payload: { customerId, from: customer.consent, to: consent },
                        refs: [customerId],
                    },
                ];
            return { result: updated, events };
        });
    }
    async upsert(dto) {
        return this.prisma.customer.upsert({
            where: { phone: dto.phone },
            update: dto.name ? { name: dto.name } : {},
            create: { phone: dto.phone, name: dto.name ?? 'Клиент' },
        });
    }
    async findByPhone(phone) {
        return this.prisma.customer.findUnique({
            where: { phone },
            select: { id: true, name: true, phone: true },
        });
    }
    async createGuest(dto) {
        const existing = await this.prisma.customer.findUnique({
            where: { phone: dto.phone },
            select: { id: true },
        });
        if (existing) {
            throw new common_1.ConflictException({
                code: 'guest_customer_requires_auth',
                message: 'Для этого номера войдите в аккаунт перед оформлением заказа',
            });
        }
        try {
            return await this.prisma.customer.create({
                data: { phone: dto.phone, name: dto.name ?? 'Клиент' },
            });
        }
        catch (error) {
            if ((0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                throw new common_1.ConflictException({
                    code: 'guest_customer_requires_auth',
                    message: 'Для этого номера войдите в аккаунт перед оформлением заказа',
                });
            }
            throw error;
        }
    }
    async exportData(customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer)
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
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
    async deleteAccount(customerId) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'customer-delete:' + customerId}))::text AS locked`;
            await tx.$queryRaw `SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
            const customer = await tx.customer.findUnique({ where: { id: customerId } });
            if (!customer)
                throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
            await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { customerId }, 'customer_account_deleted', true);
            if (isAnonymized(customer))
                return { result: { id: customer.id, deleted: true }, events: [] };
            await tx.otpChallenge.deleteMany({
                where: {
                    OR: [
                        { phone: customer.phone },
                        ...(customer.email ? [{ email: customer.email }] : []),
                    ],
                },
            });
            await tx.customer.update({
                where: { id: customerId },
                data: {
                    name: DELETED_CUSTOMER_NAME,
                    phone: deletedPhone(customerId),
                    email: null,
                    consent: false,
                },
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
            await tx.productReview.updateMany({
                where: { customerId },
                data: { customerName: DELETED_CUSTOMER_NAME },
            });
            await tx.tradeInDevice.updateMany({
                where: { customerId },
                data: { sellerPassport: '' },
            });
            const events = [
                { type: event_types_1.EventType.CustomerDeleted, actor: customerId, payload: { customerId }, refs: [customerId] },
            ];
            if (customer.consent) {
                events.push({ type: event_types_1.EventType.ConsentChanged, actor: customerId, payload: { customerId, from: true, to: false }, refs: [customerId] });
            }
            return { result: { id: customer.id, deleted: true }, events };
        });
    }
    async devices(customerId) {
        const orders = await this.prisma.order.findMany({
            where: { customerId },
            select: { id: true, createdAt: true },
        });
        const orderIds = orders.map((o) => o.id);
        if (orderIds.length === 0)
            return [];
        const purchasedAt = new Map(orders.map((o) => [o.id, o.createdAt]));
        const [units, warranties, coverageMonths] = await Promise.all([
            this.prisma.deviceUnit.findMany({
                where: { orderId: { in: orderIds }, status: { in: ['sold', 'returned', 'in_repair'] } },
                include: { product: { select: { name: true } } },
            }),
            this.prisma.warrantyCase.findMany({ where: { customerId } }),
            this.ownerSettings.value('warranty.coverage_months'),
        ]);
        return units.map((u) => {
            const cover = (0, warranty_coverage_1.warrantyCoverage)(u.orderId ? purchasedAt.get(u.orderId) : undefined, new Date(), coverageMonths);
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
    async overview(customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
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
        return (0, customer_overview_1.buildCustomerOverview)({ customer, orders, payments, debts, warranties, tickets });
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        settings_service_1.SettingsService])
], CustomersService);
function requiredText(value, label) {
    const normalized = value.trim();
    if (!normalized)
        throw new errors_1.ValidationError('required_text', `${label} не может быть пустым`);
    return normalized;
}
const DELETED_CUSTOMER_NAME = 'Удалённый пользователь';
const DELETED_PHONE_PREFIX = 'deleted:';
function deletedPhone(customerId) {
    return `${DELETED_PHONE_PREFIX}${customerId}`;
}
function isAnonymized(customer) {
    return customer.phone.startsWith(DELETED_PHONE_PREFIX);
}
function normalizeAddress(dto) {
    return { title: requiredText(dto.title, 'Название адреса'), text: requiredText(dto.text, 'Адрес'), comment: dto.comment?.trim() || null, isPrimary: dto.isPrimary === true };
}
function replayAddress(address, customerId, dto) {
    const same = address.customerId === customerId && address.title === dto.title && address.text === dto.text &&
        address.comment === dto.comment && (address.isPrimary === dto.isPrimary || (address.isPrimary && !dto.isPrimary));
    if (!same)
        throw new errors_2.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим адресом');
    return address;
}
function preferenceValues(value) {
    return { push: value?.push ?? true, whatsapp: value?.whatsapp ?? true, service: value?.service ?? true, promos: value?.promos ?? false };
}
function pickPreferences(dto) {
    const result = {};
    for (const key of ['push', 'whatsapp', 'service', 'promos'])
        if (dto[key] !== undefined)
            result[key] = dto[key];
    return result;
}
function loyaltyLevel(ltv, segments) {
    if (segments.includes('platinum') || ltv >= 1_000_000)
        return { name: 'Platinum', next: 0 };
    if (segments.includes('gold') || ltv >= 300_000)
        return { name: 'Gold', next: Math.max(0, 1_000_000 - ltv) };
    if (segments.includes('silver') || ltv >= 100_000)
        return { name: 'Silver', next: Math.max(0, 300_000 - ltv) };
    return { name: 'Base', next: Math.max(0, 100_000 - ltv) };
}
//# sourceMappingURL=customers.service.js.map