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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const units_service_1 = require("../units/units.service");
const errors_1 = require("../common/errors");
const order_state_machine_1 = require("./order-state-machine");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const loyalty_ledger_1 = require("../customers/loyalty-ledger");
const consignment_accounting_1 = require("../inventory/consignment-accounting");
const logistics_service_1 = require("../logistics/logistics.service");
const promotions_service_1 = require("../promotions/promotions.service");
const campaign_attribution_service_1 = require("../campaigns/campaign-attribution.service");
const sales_tax_1 = require("../finance/sales-tax");
const order_inventory_sale_1 = require("../inventory/order-inventory-sale");
const prisma_errors_1 = require("../common/prisma-errors");
const store_point_identity_1 = require("../common/store-point-identity");
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const CUSTOMER_ORDER_SELECT = {
    id: true,
    channel: true,
    fulfillmentType: true,
    pickupPoint: true,
    deliveryAddress: true,
    deliverySlot: true,
    pickupCode: true,
    status: true,
    subtotal: true,
    deliveryFee: true,
    promoCode: true,
    promoDiscount: true,
    loyaltyRedeemed: true,
    total: true,
    createdAt: true,
    items: {
        select: {
            id: true,
            sku: true,
            qty: true,
            price: true,
            discountAmount: true,
            supplyModeSnapshot: true,
            supplyLeadDaysSnapshot: true,
            promisedDate: true,
            fulfillmentStatus: true,
            readyAt: true,
            handedOverAt: true,
            imei: true,
            orderLineSupply: {
                select: {
                    status: true,
                    expectedAt: true,
                    orderedQty: true,
                    receivedQty: true,
                },
            },
        },
    },
    receivables: {
        select: {
            id: true,
            orderItemId: true,
            kind: true,
            amount: true,
            settledAmount: true,
            status: true,
            dueAt: true,
        },
        orderBy: [{ orderItemId: 'asc' }, { kind: 'asc' }],
    },
    payments: {
        select: { amount: true, method: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    },
};
function commerceOrderResult(order, paymentSchedule) {
    if (paymentSchedule.length === 0) {
        return { ...order, paymentSchedule, initialDue: order.total, balanceDue: 0 };
    }
    const initialDue = paymentSchedule
        .filter((receivable) => receivable.kind === 'supply_deposit')
        .reduce((sum, receivable) => sum + receivable.amount - receivable.settledAmount, 0);
    const outstanding = paymentSchedule
        .reduce((sum, receivable) => sum + receivable.amount - receivable.settledAmount, 0);
    return { ...order, paymentSchedule, initialDue, balanceDue: outstanding - initialDue };
}
function defaultFulfillment(channel) {
    if (channel === 'pos' || channel === 'staff_mobile')
        return 'store';
    return 'pickup';
}
function pickupCode() {
    return `PU-${(0, node_crypto_1.randomBytes)(3).toString('hex').toUpperCase()}`;
}
let OrdersService = class OrdersService {
    constructor(prisma, audit, units, outbox, config, logistics, promotions, campaignAttribution, settings) {
        this.prisma = prisma;
        this.audit = audit;
        this.units = units;
        this.outbox = outbox;
        this.config = config;
        this.logistics = logistics;
        this.promotions = promotions;
        this.campaignAttribution = campaignAttribution;
        this.settings = settings;
    }
    get(id) {
        return this.prisma.order.findUnique({
            where: { id },
            include: { items: true, payments: true },
        });
    }
    async getForStaff(id, staffId) {
        const order = await this.get(id);
        if (!order?.posShiftId)
            return order;
        const ownOpenShift = await this.prisma.cashShift.findFirst({
            where: { id: order.posShiftId, staffId, closedAt: null },
            select: { id: true },
        });
        if (!ownOpenShift)
            return order;
        return {
            ...order,
            posShiftId: null,
            payments: [],
            drawerBlind: true,
        };
    }
    async isOwnOpenShiftOrder(orderId, staffId) {
        const count = await this.prisma.order.count({
            where: {
                id: orderId,
                posShift: { staffId, closedAt: null },
            },
        });
        return count > 0;
    }
    getGuest(id) {
        return this.prisma.order.findUnique({
            where: { id },
            select: {
                customerId: true,
                ...CUSTOMER_ORDER_SELECT,
            },
        });
    }
    getForCustomer(id, customerId) {
        return this.prisma.order.findFirst({
            where: { id, customerId },
            select: CUSTOMER_ORDER_SELECT,
        });
    }
    listByCustomer(customerId) {
        return this.prisma.order.findMany({
            where: { customerId },
            select: CUSTOMER_ORDER_SELECT,
            orderBy: { createdAt: 'desc' },
        });
    }
    ledger(orderId) {
        return this.prisma.auditEvent.findMany({
            where: { refs: { has: orderId } },
            orderBy: { ts: 'desc' },
            take: 50,
        });
    }
    async customerLedger(orderId) {
        const events = await this.prisma.auditEvent.findMany({
            where: { refs: { has: orderId } },
            orderBy: { ts: 'desc' },
            take: 50,
            select: { id: true, type: true, ts: true, actor: true },
        });
        return events.map(({ actor, ...event }) => ({ ...event, actor: actor ? 'staff' : null }));
    }
    async sweepNoShow(options, actor = 'system:no-show') {
        const now = options?.now ?? new Date();
        const candidates = await this.prisma.order.findMany({
            where: {
                status: 'ready_for_pickup',
                fulfillmentType: { in: ['pickup', 'store'] },
                items: { some: { readyAt: { not: null } } },
            },
            select: {
                id: true,
                customerId: true,
                items: { select: { readyAt: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: options?.limit ?? 100,
        });
        let reminders = 0;
        let ownerTasks = 0;
        for (const candidate of candidates) {
            const readyAt = candidate.items.reduce((latest, item) => {
                if (!item.readyAt)
                    return latest;
                return !latest || item.readyAt > latest ? item.readyAt : latest;
            }, null);
            if (!readyAt)
                continue;
            const elapsedDays = bishkekCalendarDayDifference(readyAt, now);
            if (elapsedDays < 1)
                continue;
            const outcome = await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'order-no-show:' + candidate.id}))::text AS locked`;
                const current = await tx.order.findUnique({
                    where: { id: candidate.id },
                    select: { status: true },
                });
                if (current?.status !== 'ready_for_pickup') {
                    return { result: { reminders: 0, ownerTasks: 0 }, events: [] };
                }
                const events = [];
                let queued = 0;
                for (const day of [1, 3, 7, 13]) {
                    if (elapsedDays < day)
                        continue;
                    const marker = `no-show-day:${day}`;
                    const exists = await tx.auditEvent.findFirst({
                        where: {
                            type: event_types_1.EventType.OrderNoShowReminderQueued,
                            refs: { hasEvery: [candidate.id, marker] },
                        },
                        select: { id: true },
                    });
                    if (exists)
                        continue;
                    if (this.outbox) {
                        await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                            customerId: candidate.customerId,
                            template: 'order_no_show_reminder',
                            payload: { orderId: candidate.id, day },
                            transactional: true,
                            dedupKey: `order_no_show:${candidate.id}:day:${day}`,
                        });
                    }
                    events.push({
                        type: event_types_1.EventType.OrderNoShowReminderQueued,
                        actor,
                        payload: { orderId: candidate.id, customerId: candidate.customerId, day },
                        refs: [candidate.id, candidate.customerId, marker],
                    });
                    queued += 1;
                }
                let createdTask = 0;
                if (elapsedDays >= 14) {
                    const existingTask = await tx.staffTask.findFirst({
                        where: { relatedType: 'order_no_show', relatedId: candidate.id },
                        select: { id: true },
                    });
                    if (!existingTask) {
                        const owner = await tx.staffUser.findFirst({
                            where: { active: true, role: { in: ['owner', 'admin'] } },
                            orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
                            select: { id: true },
                        });
                        if (!owner) {
                            throw new errors_1.ConflictError('no_show_owner_missing', 'Нет активного владельца или администратора для задачи по неявке');
                        }
                        const task = await tx.staffTask.create({
                            data: {
                                title: `Неявка по заказу #${candidate.id.slice(-8)}`,
                                description: '14 дней после уведомления о готовности: принять решение по заказу.',
                                priority: 'high',
                                assigneeId: owner.id,
                                createdById: owner.id,
                                dueAt: now,
                                relatedType: 'order_no_show',
                                relatedId: candidate.id,
                            },
                        });
                        if (this.outbox) {
                            await this.outbox.enqueueOnTx(tx, {
                                channel: 'push',
                                recipient: owner.id,
                                template: 'staff_task_created',
                                dedupKey: `order_no_show_owner_task:${task.id}`,
                                payload: {
                                    title: 'Неявка покупателя',
                                    body: task.title,
                                    taskId: task.id,
                                    orderId: candidate.id,
                                    deepLink: `alistore-staff://tasks/${task.id}`,
                                },
                            });
                        }
                        events.push({
                            type: event_types_1.EventType.StaffTaskCreated,
                            actor,
                            payload: { taskId: task.id, assigneeId: owner.id, priority: task.priority },
                            refs: [task.id, owner.id, candidate.id],
                        }, {
                            type: event_types_1.EventType.OrderNoShowOwnerTaskCreated,
                            actor,
                            payload: { orderId: candidate.id, taskId: task.id, day: elapsedDays },
                            refs: [candidate.id, task.id, 'no-show-day:14'],
                        });
                        createdTask = 1;
                    }
                }
                return { result: { reminders: queued, ownerTasks: createdTask }, events };
            });
            reminders += outcome.reminders;
            ownerTasks += outcome.ownerTasks;
        }
        return { reminders, ownerTasks };
    }
    async createFromCatalog(dto, actor, idempotencyKey, allowLoyalty = false) {
        const requestHash = orderRequestHash(dto, false);
        if (idempotencyKey) {
            const existing = await this.prisma.order.findUnique({
                where: { idempotencyKey },
                include: { items: true, receivables: true },
            });
            if (existing) {
                assertOrderReplayCompatible(existing, dto, false, requestHash);
                return commerceOrderResult(existing, existing.receivables);
            }
        }
        if (['courier', 'express'].includes(dto.fulfillmentType ?? '') && !dto.deliveryAddress?.trim()) {
            throw new errors_1.ValidationError('delivery_address_required', 'Укажите адрес доставки');
        }
        if ((dto.deliveryZoneId && !dto.deliverySlotId) || (!dto.deliveryZoneId && dto.deliverySlotId)) {
            throw new errors_1.ValidationError('delivery_selection_incomplete', 'Выберите зону и слот доставки вместе');
        }
        if (dto.deliveryZoneId && dto.fulfillmentType !== 'courier') {
            throw new errors_1.ValidationError('delivery_selection_forbidden', 'Зона и слот доступны только для курьерской доставки');
        }
        const fulfillmentType = dto.fulfillmentType ?? defaultFulfillment(dto.channel);
        const paymentMode = dto.paymentMode ?? 'prepaid';
        if (paymentMode === 'cod' && fulfillmentType === 'express') {
            throw new errors_1.ValidationError('cod_express_unsupported', 'Оплата при получении недоступна для экспресс-доставки: по таким заказам нет курьерского рейса');
        }
        const requiresPointSelection = fulfillmentType === 'pickup';
        const storePoint = this.logistics
            ? await this.logistics.resolveStorePoint(dto.storePointId, fulfillmentType === 'store' ? dto.pickupPoint : undefined, requiresPointSelection)
            : await this.resolveStorePointFromDatabase(dto.storePointId, fulfillmentType === 'store' ? dto.pickupPoint : undefined, false);
        const deliveryAddress = fulfillmentType === 'pickup' || fulfillmentType === 'store'
            ? undefined
            : dto.deliveryAddress?.trim();
        const quantities = new Map();
        for (const item of dto.items)
            quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + item.qty);
        const skus = [...quantities.keys()];
        const products = await this.prisma.product.findMany({
            where: { sku: { in: skus }, archived: false },
            include: {
                units: { where: { status: 'in_stock', location: storePoint.inventoryLocation }, select: { id: true } },
                balances: { where: { location: storePoint.inventoryLocation }, select: { onHand: true, reserved: true } },
                supplierOffers: {
                    where: { active: true },
                    orderBy: { createdAt: 'desc' },
                },
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
            if (!product)
                throw new errors_1.ValidationError('product_not_found', `Товар ${sku} не найден`);
            const qty = quantities.get(sku);
            const available = product.bundleComponents.length > 0
                ? Math.min(...product.bundleComponents.map((component) => Math.floor(directAvailability(component.componentProduct) / component.qty)))
                : directAvailability(product);
            if (product.supplyMode !== 'to_order' && available < qty) {
                throw new errors_1.ConflictError('insufficient_stock', `Недостаточно товара ${sku}: доступно ${available}`);
            }
            const offer = product.supplyMode === 'to_order' ? product.supplierOffers[0] : null;
            if (product.supplyMode === 'to_order') {
                if (!offer) {
                    throw new errors_1.ConflictError('supplier_offer_missing', `Для товара ${sku} нет активного предложения поставщика`);
                }
                if (offer.validUntil <= new Date()) {
                    throw new errors_1.ConflictError('supplier_offer_expired', `Цена поставщика для товара ${sku} устарела`);
                }
                if (offer.availableQty < qty) {
                    throw new errors_1.ConflictError('supplier_offer_insufficient_quantity', `У поставщика доступно только ${offer.availableQty} шт. товара ${sku}`);
                }
                const marginBps = product.price > 0
                    ? Math.floor(((product.price - offer.unitCost) * 10_000) / product.price)
                    : -10_000;
                if (marginBps < 1000) {
                    throw new errors_1.ConflictError('supplier_offer_margin_approval_required', `Маржа товара ${sku} ниже минимальных 10%`);
                }
            }
            return {
                sku,
                qty,
                price: product.price,
                productId: product.id,
                category: product.category.trim().toLowerCase(),
                supplyMode: product.supplyMode,
                supplierId: offer?.supplierId ?? product.supplierId,
                supplyLeadDays: offer?.leadDays ?? product.supplyLeadDays,
                supplierOfferId: offer?.id ?? null,
            };
        });
        const toOrderSkus = skus.filter((sku) => bySku.get(sku)?.supplyMode === 'to_order');
        const toOrderCheckoutEnabled = this.config?.get('TO_ORDER_CHECKOUT_ENABLED')?.trim().toLowerCase() === 'true';
        if (toOrderSkus.length > 0 && !toOrderCheckoutEnabled) {
            throw new errors_1.ConflictError('to_order_checkout_disabled', 'Оформление товаров под заказ пока недоступно');
        }
        const hasToOrderLine = toOrderSkus.length > 0;
        const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
        const deliverySelection = dto.deliveryZoneId && dto.deliverySlotId
            ? await this.deliverySelection(dto.deliveryZoneId, dto.deliverySlotId)
            : null;
        const deliveryFee = deliverySelection?.zone.fee ?? fulfillmentFee(dto.fulfillmentType);
        const promoCode = normalizePromo(dto.promoCode);
        const promoDiscount = 0;
        const loyaltyPoints = dto.loyaltyPoints ?? 0;
        if (loyaltyPoints > 0 && !allowLoyalty) {
            throw new errors_1.ConflictError('loyalty_auth_required', 'Списание бонусов доступно только после входа в аккаунт');
        }
        const pricing = {
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
            hasToOrderLine,
            linePolicies: Object.fromEntries(items.map((item) => [item.sku, {
                    productId: item.productId,
                    supplyMode: item.supplyMode,
                    supplierId: item.supplierId,
                    supplyLeadDays: item.supplyLeadDays,
                    supplierOfferId: item.supplierOfferId,
                }])),
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
        return this.create({
            ...dto,
            fulfillmentType,
            paymentMode,
            storePointId: storePoint.id,
            pickupPoint: undefined,
            deliveryAddress,
            total: subtotal + deliveryFee - promoDiscount,
            items,
        }, actor, idempotencyKey, pricing, storePoint, requestHash);
    }
    async create(dto, actor, idempotencyKey, pricing, storePoint, requestHash = orderRequestHash(dto, true)) {
        const isDemo = this.config?.get('PUBLIC_DEMO_MODE')?.trim().toLowerCase() === 'true';
        const fulfillmentType = dto.fulfillmentType ?? defaultFulfillment(dto.channel);
        const canonicalStorePoint = storePoint ?? (this.logistics
            ? await this.logistics.resolveStorePoint(dto.storePointId, dto.pickupPoint, fulfillmentType === 'pickup')
            : await this.resolveStorePointFromDatabase(dto.storePointId, dto.pickupPoint, false));
        try {
            return await this.audit.transaction(async (tx) => {
                if (idempotencyKey) {
                    const existing = await tx.order.findUnique({
                        where: { idempotencyKey },
                        include: { items: true, receivables: true },
                    });
                    if (existing) {
                        assertOrderReplayCompatible(existing, dto, true, requestHash);
                        return {
                            result: commerceOrderResult(existing, existing.receivables),
                            events: [],
                        };
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
                    throw new errors_1.ConflictError('demo_loyalty_forbidden', 'Демо-заказ не списывает бонусы');
                }
                const events = [];
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
                        taxBySku.set(item.sku, { sku: item.sku, taxCode: 'vat_standard', taxRateBps: 1200 });
                    }
                }
                const preparedAttribution = this.campaignAttribution
                    ? await this.campaignAttribution.prepareForOrder(tx, dto.customerId, dto.attribution, appliedPromotion?.code ?? canonical.promoCode)
                    : null;
                if (!isDemo && dto.deliverySlotId && dto.deliveryZoneId) {
                    await tx.$queryRaw `SELECT id FROM "DeliverySlot" WHERE id = ${dto.deliverySlotId} FOR UPDATE`;
                    const slot = await tx.deliverySlot.findUnique({ where: { id: dto.deliverySlotId } });
                    if (!slot?.active || slot.zoneId !== dto.deliveryZoneId || slot.endsAt <= new Date()) {
                        throw new errors_1.ConflictError('delivery_slot_unavailable', 'Слот доставки больше недоступен');
                    }
                    const booked = await tx.order.count({
                        where: { deliverySlotId: slot.id, isDemo: false, status: { in: ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment', 'paid', 'picking', 'packed', 'courier_assigned', 'out_for_delivery'] } },
                    });
                    if (booked >= slot.capacity)
                        throw new errors_1.ConflictError('delivery_slot_full', 'Слот доставки уже занят');
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
                        status: canonical.hasToOrderLine ? 'awaiting_payment' : 'created',
                        items: {
                            create: dto.items.map((i, index) => {
                                const policy = canonical.linePolicies?.[i.sku];
                                const toOrder = policy?.supplyMode === 'to_order';
                                return {
                                    lineNumber: index + 1,
                                    productId: policy?.productId
                                        ?? canonical.inventorySnapshots?.[i.sku]?.productId,
                                    sku: i.sku,
                                    qty: i.qty,
                                    price: i.price,
                                    unitCost: canonical.unitCostsByLine?.[index] ?? canonical.unitCosts?.[i.sku] ?? 0,
                                    discountAmount: initialTax.lines[index].discountAmount,
                                    taxCode: initialTax.lines[index].taxCode,
                                    taxRateBps: initialTax.lines[index].taxRateBps,
                                    taxBaseAmount: initialTax.lines[index].taxBaseAmount,
                                    taxAmount: initialTax.lines[index].taxAmount,
                                    supplyModeSnapshot: policy?.supplyMode ?? 'own_stock',
                                    supplierIdSnapshot: policy?.supplierId ?? null,
                                    supplyLeadDaysSnapshot: toOrder ? policy?.supplyLeadDays : null,
                                    fulfillmentStatus: toOrder ? 'awaiting_deposit' : 'pending_payment',
                                    imei: i.imei,
                                    ...(canonical.inventorySnapshots?.[i.sku]
                                        ? { inventorySnapshot: canonical.inventorySnapshots[i.sku] }
                                        : {}),
                                    ...(toOrder
                                        ? {
                                            orderLineSupply: {
                                                create: {
                                                    status: 'awaiting_deposit',
                                                    actor,
                                                    supplierOfferId: policy?.supplierOfferId,
                                                    orderedQty: i.qty,
                                                },
                                            },
                                        }
                                        : {}),
                                };
                            }),
                        },
                        ...(preparedAttribution ? { attribution: { create: preparedAttribution.data } } : {}),
                    },
                    include: { items: true },
                });
                if (preparedAttribution?.campaignId) {
                    await this.campaignAttribution?.recordCheckoutOnTx(tx, preparedAttribution.campaignId, preparedAttribution.data.journeyHash, initialOrder.id);
                }
                if (appliedPromotion && !isDemo) {
                    await this.requirePromotions().registerRedemptionOnTx(tx, appliedPromotion, dto.customerId, initialOrder.id, actor, events);
                }
                const loyaltyRedeemed = await (0, loyalty_ledger_1.redeemLoyaltyOnTx)(tx, {
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
                let paymentSchedule = [];
                if (canonical.hasToOrderLine) {
                    const receivables = [];
                    for (const item of order.items) {
                        const policy = canonical.linePolicies?.[item.sku];
                        const lineNet = Math.max(0, item.price * item.qty - item.discountAmount);
                        if (policy?.supplyMode === 'to_order') {
                            const deposit = Math.ceil(lineNet * 2000 / 10_000);
                            receivables.push({
                                orderId: order.id,
                                orderItemId: item.id,
                                kind: 'supply_deposit',
                                amount: deposit,
                            }, {
                                orderId: order.id,
                                orderItemId: item.id,
                                kind: 'supply_balance',
                                amount: lineNet - deposit,
                            });
                        }
                        else {
                            receivables.push({
                                orderId: order.id,
                                orderItemId: item.id,
                                kind: 'stock_sale',
                                amount: lineNet,
                            });
                        }
                    }
                    if (order.deliveryFee > 0) {
                        receivables.push({
                            orderId: order.id,
                            kind: 'delivery',
                            amount: order.deliveryFee,
                        });
                    }
                    await tx.orderReceivable.createMany({ data: receivables });
                    paymentSchedule = await tx.orderReceivable.findMany({
                        where: { orderId: order.id },
                        orderBy: [{ orderItemId: 'asc' }, { kind: 'asc' }],
                    });
                }
                if (this.outbox && !order.isDemo) {
                    await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                        customerId: order.customerId,
                        template: 'order_confirmed',
                        payload: { orderId: order.id, channel: order.channel, total: order.total },
                        transactional: true,
                    });
                }
                events.unshift({
                    type: event_types_1.EventType.OrderCreated,
                    actor,
                    payload: {
                        orderId: order.id,
                        channel: order.channel,
                        fulfillmentType: order.fulfillmentType,
                        paymentMode: order.paymentMode,
                        storePointId: order.storePointId,
                        pickupPoint: order.pickupPoint,
                        fulfillmentLocation: order.fulfillmentLocation,
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
                });
                if (preparedAttribution?.campaignId) {
                    events.push({
                        type: event_types_1.EventType.CampaignAttributed,
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
                    result: commerceOrderResult(order, paymentSchedule),
                    events,
                };
            });
        }
        catch (error) {
            if (idempotencyKey && (0, prisma_errors_1.isUniqueConstraintViolation)(error)) {
                const existing = await this.prisma.order.findUnique({
                    where: { idempotencyKey },
                    include: { items: true, receivables: true },
                });
                if (existing) {
                    assertOrderReplayCompatible(existing, dto, true, requestHash);
                    return commerceOrderResult(existing, existing.receivables);
                }
            }
            throw error;
        }
    }
    async deliverySelection(zoneId, slotId) {
        const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId }, include: { zone: true } });
        if (!slot?.active || !slot.zone.active || slot.zoneId !== zoneId || slot.endsAt <= new Date()) {
            throw new errors_1.ValidationError('delivery_slot_unavailable', 'Зона или слот доставки недоступны');
        }
        return slot;
    }
    requirePromotions() {
        if (!this.promotions)
            throw new errors_1.ValidationError('promotions_unavailable', 'Сервис промокодов недоступен');
        return this.promotions;
    }
    async orderLineSupplyMap(tx, itemIds) {
        const rows = await tx.orderLineSupply.findMany({
            where: { orderItemId: { in: itemIds } },
            select: { orderItemId: true, status: true },
        });
        return new Map(rows.map((row) => [row.orderItemId, row]));
    }
    async reserve(orderId, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true },
            });
            if (!order) {
                throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
            }
            this.assertNotDemo(order);
            (0, order_state_machine_1.assertTransition)(order.status, 'reserved');
            const currentProducts = await tx.product.findMany({
                where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
                include: { bundleComponents: { include: { componentProduct: true } } },
            });
            const currentProductsBySku = new Map(currentProducts.map((product) => [product.sku, product]));
            const supplyByOrderItemId = await this.orderLineSupplyMap(tx, order.items.map((item) => item.id));
            (0, order_inventory_sale_1.assertOrderLineSupplyReceived)(orderId, order.items, supplyByOrderItemId);
            const inventorySpecs = new Map();
            for (const item of order.items) {
                const product = currentProductsBySku.get(item.sku);
                const snapshot = (0, order_inventory_sale_1.resolveOrderInventorySnapshot)(item.inventorySnapshot, product ? {
                    productId: product.id,
                    trackingMode: product.trackingMode,
                    components: product.bundleComponents.map((component) => ({
                        productId: component.componentProductId,
                        sku: component.componentProduct.sku,
                        trackingMode: component.componentProduct.trackingMode,
                        qty: component.qty,
                    })),
                } : null);
                if (snapshot)
                    inventorySpecs.set(item.id, snapshot);
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
                await (0, order_inventory_sale_1.lockInventoryBalancesOnTx)(tx, balances.map((balance) => balance.id));
            }
            const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
            const events = [];
            for (const item of order.items) {
                const inventorySpec = inventorySpecs.get(item.id);
                if (item.imei) {
                    const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
                    if (!unit || !inventorySpec || unit.productId !== inventorySpec.productId) {
                        throw new errors_1.ConflictError('unit_product_mismatch', `Единица ${item.imei} не соответствует товару ${item.sku}`);
                    }
                    if (order.fulfillmentLocation && unit.location !== order.fulfillmentLocation) {
                        throw new errors_1.ConflictError('unit_wrong_store_point', `Единица ${item.imei} недоступна в выбранной точке`);
                    }
                    await this.units.reserveOnTx(tx, item.imei, orderId);
                    await tx.reservation.create({
                        data: { orderId, imei: item.imei, expiresAt, active: true },
                    });
                    events.push({
                        type: event_types_1.EventType.StockReserved,
                        actor,
                        payload: { orderId, imei: item.imei },
                        refs: [orderId, item.imei],
                    });
                    continue;
                }
                if (inventorySpec?.trackingMode === 'quantity' && inventorySpec.components.length === 0) {
                    await this.reserveQuantityOnTx(tx, orderId, item.id, inventorySpec.productId, item.sku, item.qty, order.fulfillmentLocation, expiresAt, actor, events);
                }
                else if (inventorySpec) {
                    throw new errors_1.ConflictError('serialized_unit_required', `Для серийного товара ${item.sku} нужно назначить IMEI через складское исполнение`);
                }
            }
            const updated = await tx.order.update({
                where: { id: orderId },
                data: { status: 'reserved' },
            });
            events.push({
                type: event_types_1.EventType.OrderReserved,
                actor,
                payload: { orderId },
                refs: [orderId],
            });
            return { result: updated, events };
        });
    }
    async transition(orderId, to, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: {
                    payments: { where: { amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } }, orderBy: { createdAt: 'asc' } },
                    courierRun: true,
                    items: { select: { id: true } },
                },
            });
            if (!order) {
                throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
            }
            this.assertNotDemo(order);
            const settledAmount = order.payments
                .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
                .reduce((sum, payment) => sum + payment.amount, 0);
            if (to === 'cancelled' && settledAmount >= order.total) {
                throw new errors_1.ConflictError('paid_order_cancel_requires_return', 'Оплаченный заказ отменяется через возврат и refund');
            }
            (0, order_state_machine_1.assertTransition)(order.status, to);
            if (to === 'reserved') {
                throw new errors_1.ValidationError('order_reserve_requires_service', 'Статус reserved ставит только резерв стока — POST /orders/:id/reserve');
            }
            if (to === 'courier_assigned') {
                throw new errors_1.ValidationError('order_courier_assign_requires_run', 'Курьера назначает создание рейса — POST /courier/runs');
            }
            if (order.status === 'reserved' && to === 'picking' && order.paymentMode !== 'cod') {
                throw new errors_1.ValidationError('cod_picking_required', 'Неоплаченный заказ можно собирать только в режиме COD');
            }
            if (order.status === 'reserved' && to === 'picking' && order.items.length > 0) {
                await (0, order_inventory_sale_1.assertOrderReservationCoverageOnTx)(tx, orderId);
            }
            if (to === 'paid') {
                assertOrderTenderSettled(order);
                throw new errors_1.ConflictError('order_paid_transition_forbidden', 'Статус paid устанавливает только сервис оплаты или COD');
            }
            if (to === 'completed')
                assertOrderMoneyReconciled(order);
            const releaseEvents = [];
            if (to === 'cancelled') {
                if (order.courierRunId) {
                    await tx.$executeRaw `SELECT id FROM "CourierRun" WHERE id = ${order.courierRunId} FOR UPDATE`;
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
                await (0, order_inventory_sale_1.lockInventoryBalancesOnTx)(tx, reservations.flatMap((reservation) => (reservation.quantityAllocation?.balanceId ? [reservation.quantityAllocation.balanceId] : [])));
                for (const reservation of reservations) {
                    if (reservation.imei) {
                        const released = await this.units.releaseOnTx(tx, reservation.imei, orderId);
                        if (released) {
                            releaseEvents.push({
                                type: event_types_1.EventType.StockReleased,
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
                            await (0, consignment_accounting_1.releaseQuantityConsignmentOnTx)(tx, allocation.id);
                            await tx.orderQuantityAllocation.update({
                                where: { id: allocation.id },
                                data: { active: false },
                            });
                            releaseEvents.push({
                                type: event_types_1.EventType.StockReleased,
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
                            type: event_types_1.EventType.LoyaltyRefundRestored,
                            actor,
                            payload: { orderId, entryId: entry.id, amount: order.loyaltyRedeemed },
                            refs: [order.id, entry.id],
                        });
                    }
                }
                for (const payment of order.payments.filter((candidate) => candidate.amount > 0 && candidate.giftCardId)) {
                    const reversalKey = `cancel-refund:${order.id}:${payment.id}`;
                    const alreadyReversed = await tx.payment.findUnique({ where: { idempotencyKey: reversalKey } });
                    if (alreadyReversed)
                        continue;
                    const card = await tx.giftCard.update({
                        where: { id: payment.giftCardId },
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
                        type: event_types_1.EventType.PaymentRefunded,
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
            const events = [
                ...releaseEvents,
                {
                    type: `order.${to}`,
                    actor,
                    payload: { orderId, from: order.status, to },
                    refs: [orderId],
                },
            ];
            if (to === 'completed') {
                const earnRateBps = this.settings ? await this.settings.value('loyalty.earn_rate_bps') : undefined;
                const loyaltyEarned = await (0, loyalty_ledger_1.earnLoyaltyOnTx)(tx, {
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
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: order.customerId,
                    template: to === 'confirmed' ? 'order_confirmed' : 'order_ready',
                    payload: { orderId, from: order.status, to },
                    transactional: true,
                });
            }
            if (this.outbox && to === 'completed') {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
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
    listByStatus(status, limit = 50) {
        return this.prisma.order.findMany({
            where: { status },
            include: { items: true, customer: { select: { phone: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
    async listByStatusForStaff(status, staffId, limit = 50) {
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
    async fulfill(orderId, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true },
            });
            if (!order) {
                throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
            }
            this.assertNotDemo(order);
            (0, order_state_machine_1.assertTransition)(order.status, 'reserved');
            const currentProducts = await tx.product.findMany({
                where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
                include: { bundleComponents: { include: { componentProduct: true } } },
            });
            const currentProductsBySku = new Map(currentProducts.map((product) => [product.sku, product]));
            const supplyByOrderItemId = await this.orderLineSupplyMap(tx, order.items.map((item) => item.id));
            (0, order_inventory_sale_1.assertOrderLineSupplyReceived)(orderId, order.items, supplyByOrderItemId);
            const inventorySpecs = new Map();
            for (const item of order.items) {
                const product = currentProductsBySku.get(item.sku);
                const snapshot = (0, order_inventory_sale_1.resolveOrderInventorySnapshot)(item.inventorySnapshot, product ? {
                    productId: product.id,
                    trackingMode: product.trackingMode,
                    components: product.bundleComponents.map((component) => ({
                        productId: component.componentProductId,
                        sku: component.componentProduct.sku,
                        trackingMode: component.componentProduct.trackingMode,
                        qty: component.qty,
                    })),
                } : null);
                if (snapshot)
                    inventorySpecs.set(item.id, snapshot);
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
                await (0, order_inventory_sale_1.lockInventoryBalancesOnTx)(tx, balances.map((balance) => balance.id));
            }
            const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
            const events = [];
            const assigned = [];
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
            const reserveUnit = async (imei, sku, expectedProductId) => {
                const candidate = await tx.deviceUnit.findUnique({
                    where: { imei },
                    select: { acquisitionCost: true, consignmentItem: { select: { id: true } } },
                });
                const acquisitionCost = candidate?.consignmentItem
                    ? candidate.acquisitionCost
                    : candidate?.acquisitionCost ?? serializedCosts.get(expectedProductId);
                if (!candidate?.consignmentItem && acquisitionCost === undefined) {
                    throw new errors_1.ConflictError('unit_acquisition_cost_missing', `Для единицы ${imei} не определена себестоимость`);
                }
                const claimed = await tx.deviceUnit.updateMany({
                    where: { imei, productId: expectedProductId, status: 'in_stock' },
                    data: { status: 'reserved', orderId, acquisitionCost },
                });
                if (claimed.count === 0) {
                    throw new errors_1.ConflictError('unit_already_taken', `Единица ${imei} уже занята — повторите`);
                }
                await tx.reservation.create({ data: { orderId, imei, expiresAt, active: true } });
                assigned.push(imei);
                events.push({
                    type: event_types_1.EventType.StockReserved,
                    actor,
                    payload: { orderId, imei, sku },
                    refs: [orderId, imei],
                });
            };
            for (const item of order.items) {
                const inventorySpec = inventorySpecs.get(item.id);
                if (item.imei) {
                    const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
                    if (!unit || !inventorySpec || unit.productId !== inventorySpec.productId) {
                        throw new errors_1.ConflictError('unit_product_mismatch', `Единица ${item.imei} не соответствует товару ${item.sku}`);
                    }
                    if (unit && order.fulfillmentLocation && unit.location !== order.fulfillmentLocation) {
                        throw new errors_1.ConflictError('unit_wrong_store_point', `Единица ${item.imei} недоступна в выбранной точке`);
                    }
                    if (unit.status !== 'in_stock') {
                        throw new errors_1.ConflictError('unit_already_taken', `Единица ${item.imei} уже занята — повторите`);
                    }
                    await reserveUnit(item.imei, item.sku, inventorySpec.productId);
                    continue;
                }
                if (!inventorySpec)
                    continue;
                if (inventorySpec.components.length > 0) {
                    for (const component of inventorySpec.components) {
                        const required = component.qty * item.qty;
                        if (component.trackingMode === 'quantity') {
                            await this.reserveQuantityOnTx(tx, orderId, item.id, component.productId, component.sku, required, order.fulfillmentLocation, expiresAt, actor, events, false);
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
                            throw new errors_1.ConflictError('insufficient_bundle_stock', `Для набора ${item.sku} недостаточно ${component.sku}: нужно ${required}, в наличии ${units.length}`);
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
                    await this.reserveQuantityOnTx(tx, orderId, item.id, inventorySpec.productId, item.sku, item.qty, order.fulfillmentLocation, expiresAt, actor, events);
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
                    throw new errors_1.ConflictError('insufficient_stock', `Недостаточно единиц ${item.sku}: нужно ${item.qty}, в наличии ${units.length}`);
                }
                const originalQty = item.qty;
                const splitSnapshot = (index) => {
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
                                ? { inventorySnapshot: item.inventorySnapshot }
                                : {}),
                        },
                    });
                    await reserveUnit(unit.imei, item.sku, inventorySpec.productId);
                }
            }
            let nextStatus = 'reserved';
            events.push({
                type: event_types_1.EventType.OrderReserved,
                actor,
                payload: { orderId, assigned: assigned.length },
                refs: [orderId],
            });
            if (order.total === 0) {
                await (0, order_inventory_sale_1.finalizeOrderInventorySaleOnTx)(tx, {
                    orderId: order.id,
                    actor,
                    units: this.units,
                    events,
                });
                nextStatus = 'paid';
                events.push({
                    type: event_types_1.EventType.OrderPaid,
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
    assertNotDemo(order) {
        if (order.isDemo) {
            throw new errors_1.ConflictError('demo_order_read_only', `Демо-заказ ${order.id} нельзя передавать в оплату, склад или исполнение`);
        }
    }
    async reserveQuantityOnTx(tx, orderId, orderItemId, productId, sku, quantity, preferredLocation, expiresAt, actor, events, allowConsignment = true) {
        const balances = await tx.inventoryBalance.findMany({
            where: { productId, ...(preferredLocation ? { location: preferredLocation } : {}) },
            orderBy: { location: 'asc' },
        });
        let remaining = quantity;
        for (const balance of balances) {
            if (remaining === 0)
                break;
            const consignmentAvailable = allowConsignment
                ? 0
                : (await tx.quantityConsignmentLot.aggregate({
                    where: { balanceId: balance.id },
                    _sum: { availableQty: true },
                }))._sum.availableQty ?? 0;
            const desired = Math.min(remaining, Math.max(0, balance.onHand - balance.reserved - consignmentAvailable));
            if (desired === 0)
                continue;
            const claimed = await tx.$executeRaw `
        UPDATE "InventoryBalance"
        SET "reserved" = "reserved" + ${desired}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${balance.id} AND ("onHand" - "reserved") >= ${desired}
      `;
            if (claimed === 0)
                continue;
            const allocation = await tx.orderQuantityAllocation.create({
                data: { orderId, orderItemId, productId, balanceId: balance.id, sku, location: balance.location, qty: desired },
            });
            if (allowConsignment) {
                await (0, consignment_accounting_1.reserveQuantityConsignmentOnTx)(tx, {
                    orderQuantityAllocationId: allocation.id,
                    balanceId: balance.id,
                    qty: desired,
                });
            }
            await tx.reservation.create({
                data: { orderId, quantityAllocationId: allocation.id, expiresAt, active: true },
            });
            events.push({
                type: event_types_1.EventType.StockReserved,
                actor,
                payload: { orderId, sku, qty: desired, location: balance.location, allocationId: allocation.id },
                refs: [orderId, productId, allocation.id],
            });
            remaining -= desired;
        }
        if (remaining > 0) {
            throw new errors_1.ConflictError('insufficient_stock', `Недостаточно товара ${sku}: не хватает ${remaining}`);
        }
    }
    async resolveStorePointFromDatabase(storePointId, legacyAlias, requireSelection = false) {
        const reference = storePointId ?? legacyAlias;
        if (!reference && !requireSelection) {
            if (process.env.NODE_ENV === 'test') {
                const fixturePoint = await this.prisma.storePoint.findFirst({
                    where: { active: true },
                    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                });
                if (fixturePoint)
                    return fixturePoint;
            }
            throw new errors_1.ValidationError('store_point_required', 'Выберите точку выполнения заказа');
        }
        return (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, reference);
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        units_service_1.UnitsService,
        outbox_service_1.OutboxService,
        config_1.ConfigService,
        logistics_service_1.LogisticsService,
        promotions_service_1.PromotionsService,
        campaign_attribution_service_1.CampaignAttributionService,
        settings_service_1.SettingsService])
], OrdersService);
function directAvailability(product) {
    if (product.trackingMode === 'serialized')
        return product.units.length;
    return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
}
function orderTaxSnapshot(items, taxBySku, orderTotal, deliveryFee) {
    if (!Number.isSafeInteger(orderTotal) || !Number.isSafeInteger(deliveryFee) || orderTotal < deliveryFee) {
        throw new errors_1.ValidationError('order_tax_total_invalid', 'Итог заказа меньше стоимости доставки');
    }
    return (0, sales_tax_1.salesTaxSnapshot)(items.map((item, index) => {
        const classification = taxBySku.get(item.sku);
        if (!classification)
            throw new errors_1.ValidationError('product_not_found', `Товар ${item.sku} не найден`);
        return {
            lineNumber: index + 1,
            grossAmount: item.price * item.qty,
            taxCode: classification.taxCode,
            taxRateBps: classification.taxRateBps,
        };
    }), orderTotal - deliveryFee);
}
function splitInteger(total, index, parts) {
    const before = Number(BigInt(total) * BigInt(index) / BigInt(parts));
    const after = Number(BigInt(total) * BigInt(index + 1) / BigInt(parts));
    return after - before;
}
function normalizePromo(value) {
    if (!value?.trim())
        return null;
    return value.trim().toUpperCase();
}
function fulfillmentFee(type) {
    if (type === 'courier')
        return 200;
    if (type === 'express')
        return 400;
    return 0;
}
function assertOrderMoneyReconciled(order) {
    if (order.total <= 0)
        return;
    const received = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const handedOverCod = order.courierRun?.handedOver ? order.courierRun.collectedTotal : 0;
    if (received + handedOverCod < order.total) {
        throw new errors_1.ConflictError('order_money_unreconciled', `Заказ ${order.id} нельзя завершить до сверки оплаты/COD`);
    }
}
function assertOrderTenderSettled(order) {
    if (order.total <= 0)
        return;
    const received = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (received < order.total) {
        throw new errors_1.ConflictError('order_payment_unsettled', `Заказ ${order.id} нельзя отметить оплаченным без полученной оплаты`);
    }
}
function assertOrderReplayCompatible(existing, dto, compareImei = true, requestHash = orderRequestHash(dto, compareImei)) {
    if (existing.customerId !== dto.customerId) {
        throw new errors_1.ConflictError('order_idempotency_owner_mismatch', 'Ключ заказа уже использован');
    }
    if (existing.idempotencyRequestHash) {
        if (existing.idempotencyRequestHash !== requestHash) {
            throw new errors_1.ConflictError('order_idempotency_mismatch', 'Idempotency-Key уже использован для другого заказа');
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
        throw new errors_1.ConflictError('order_idempotency_mismatch', 'Idempotency-Key уже использован для другого заказа');
    }
}
function normalizedReplayPrices(items) {
    return [...items]
        .map((item) => ({ sku: item.sku, qty: item.qty, price: item.price, imei: item.imei ?? null }))
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
        .map(stableJson)
        .join('\u0001');
}
function bishkekCalendarDayDifference(from, to) {
    const ordinal = (value) => {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Bishkek',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(value);
        const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return Math.floor(Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day)) / 86_400_000);
    };
    return ordinal(to) - ordinal(from);
}
function orderRequestHash(dto, compareImei) {
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
    return (0, node_crypto_1.createHash)('sha256').update(stableJson(material)).digest('hex');
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function normalizedReplayItems(items, compareImei) {
    const quantities = new Map();
    for (const item of items) {
        const key = compareImei ? `${item.sku}\u0000${item.imei ?? ''}` : item.sku;
        quantities.set(key, (quantities.get(key) ?? 0) + item.qty);
    }
    return [...quantities.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, qty]) => `${key}\u0000${qty}`)
        .join('\u0001');
}
//# sourceMappingURL=orders.service.js.map