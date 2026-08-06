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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const sales_tax_1 = require("../finance/sales-tax");
const approvals_service_1 = require("../approvals/approvals.service");
const moderation_service_1 = require("../ai/moderation.service");
const PRICE_APPROVAL_THRESHOLD_PCT = 15;
const IN_FLIGHT_ORDER_STATUSES = [
    'created',
    'awaiting_confirmation',
    'confirmed',
    'reserved',
    'awaiting_payment',
    'paid',
    'picking',
    'packed',
    'ready_for_pickup',
    'courier_assigned',
    'out_for_delivery',
];
let ProductsService = class ProductsService {
    constructor(prisma, audit, approvals, moderation) {
        this.prisma = prisma;
        this.audit = audit;
        this.approvals = approvals;
        this.moderation = moderation;
    }
    get(id) {
        return this.prisma.product.findUnique({ where: { id } });
    }
    async list(query) {
        const normalized = {
            q: query.q?.trim() || undefined,
            includeArchived: query.includeArchived ?? false,
            limit: query.limit ?? 50,
            offset: query.offset ?? 0,
        };
        const where = {
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
    async create(dto, requester) {
        const sku = dto.sku.trim();
        const name = dto.name.trim();
        const category = dto.category.trim();
        const barcode = this.optionalValue(dto.barcode);
        const variantGroup = this.optionalValue(dto.variantGroup);
        const taxCode = dto.taxCode?.trim() || 'vat_standard';
        const taxRateBps = dto.taxRateBps ?? 1200;
        (0, sales_tax_1.assertTaxClassification)({ taxCode, taxRateBps });
        if (!sku || !name || !category) {
            throw new errors_1.ValidationError('product_fields_required', 'SKU, название и категория обязательны');
        }
        const supplyMode = dto.supplyMode ?? 'own_stock';
        if (supplyMode === 'to_order' && (!dto.supplyLeadDays || !dto.supplierOffer)) {
            throw new errors_1.ValidationError('product_supply_offer_required', 'Для товара под заказ обязательны срок и действующее предложение поставщика');
        }
        if (supplyMode === 'own_stock' && (dto.supplyLeadDays !== undefined || dto.supplierOffer)) {
            throw new errors_1.ValidationError('product_supply_fields_forbidden', 'Срок и предложение поставщика доступны только для товара под заказ');
        }
        const existing = await this.prisma.product.findUnique({ where: { sku } });
        if (existing) {
            throw new errors_1.ConflictError('product_sku_exists', `SKU ${sku} уже существует`);
        }
        if (barcode && await this.prisma.product.findUnique({ where: { barcode } })) {
            throw new errors_1.ConflictError('product_barcode_exists', `Штрихкод ${barcode} уже существует`);
        }
        if (dto.supplierOffer) {
            const supplier = await this.prisma.supplier.findUnique({
                where: { id: dto.supplierOffer.supplierId },
                select: { id: true },
            });
            if (!supplier) {
                throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierOffer.supplierId} не найден`);
            }
        }
        return this.audit.transaction(async (tx) => {
            const bundleComponents = await this.resolveBundleComponents(tx, sku, dto.bundleComponents);
            const checkedAt = new Date();
            const validUntil = new Date(checkedAt.getTime() + (dto.supplierOffer?.validForHours ?? 24) * 60 * 60 * 1000);
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
                    supplyMode,
                    supplyLeadDays: supplyMode === 'to_order' ? dto.supplyLeadDays : null,
                    ...(dto.supplierOffer
                        ? {
                            supplier: { connect: { id: dto.supplierOffer.supplierId } },
                            supplierOffers: {
                                create: {
                                    supplierId: dto.supplierOffer.supplierId,
                                    supplierSku: this.optionalValue(dto.supplierOffer.supplierSku),
                                    unitCost: dto.supplierOffer.unitCost,
                                    availableQty: dto.supplierOffer.availableQty,
                                    leadDays: dto.supplierOffer.leadDays,
                                    checkedAt,
                                    validUntil,
                                    updatedBy: requester,
                                },
                            },
                        }
                        : {}),
                    attrs: (dto.attrs ?? {}),
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
                        type: event_types_1.EventType.ProductCreated,
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
                            supplyMode: product.supplyMode,
                            supplyLeadDays: product.supplyLeadDays,
                            supplierId: product.supplierId,
                        },
                        refs: [product.id, sku],
                    },
                ],
            };
        });
    }
    async update(productId, dto, requester) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${productId} не найден`);
        }
        const data = {};
        if (dto.barcode !== undefined) {
            const barcode = this.optionalValue(dto.barcode);
            if (barcode) {
                const existing = await this.prisma.product.findUnique({ where: { barcode } });
                if (existing && existing.id !== productId) {
                    throw new errors_1.ConflictError('product_barcode_exists', `Штрихкод ${barcode} уже существует`);
                }
            }
            data.barcode = barcode;
        }
        if (dto.variantGroup !== undefined)
            data.variantGroup = this.optionalValue(dto.variantGroup);
        if (dto.name !== undefined) {
            const name = dto.name.trim();
            if (!name)
                throw new errors_1.ValidationError('product_name_required', 'Название товара обязательно');
            data.name = name;
        }
        if (dto.cost !== undefined)
            data.cost = dto.cost;
        if (dto.category !== undefined) {
            const category = dto.category.trim();
            if (!category)
                throw new errors_1.ValidationError('product_category_required', 'Категория обязательна');
            data.category = category;
        }
        if (dto.taxCode !== undefined || dto.taxRateBps !== undefined) {
            const taxCode = dto.taxCode?.trim() || product.taxCode;
            const taxRateBps = dto.taxRateBps ?? product.taxRateBps;
            (0, sales_tax_1.assertTaxClassification)({ taxCode, taxRateBps });
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
                throw new errors_1.ConflictError('tracking_mode_in_use', 'Тип складского учёта нельзя менять при наличии остатков или использовании в наборе');
            }
            data.trackingMode = dto.trackingMode;
        }
        if (dto.supplyMode !== undefined || dto.supplyLeadDays !== undefined) {
            const supplyMode = dto.supplyMode ?? product.supplyMode;
            const supplyLeadDays = dto.supplyLeadDays ?? product.supplyLeadDays;
            if (supplyMode === 'to_order' && supplyLeadDays === null) {
                throw new errors_1.ValidationError('product_supply_lead_days_required', 'Для товара под заказ обязателен срок поставки в днях');
            }
            if (supplyMode === 'to_order' && product.supplyMode !== 'to_order') {
                const [unitCount, balanceCount] = await Promise.all([
                    this.prisma.deviceUnit.count({ where: { productId, status: 'in_stock' } }),
                    this.prisma.inventoryBalance.count({ where: { productId, onHand: { gt: 0 } } }),
                ]);
                if (unitCount > 0 || balanceCount > 0) {
                    throw new errors_1.ValidationError('product_supply_mode_has_stock', 'Товар с собственными остатками нельзя перевести в режим «под заказ»');
                }
            }
            data.supplyMode = supplyMode;
            data.supplyLeadDays = supplyMode === 'to_order' ? supplyLeadDays : null;
        }
        if (dto.supplierId !== undefined) {
            const supplierId = this.optionalValue(dto.supplierId);
            if (supplierId) {
                const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
                if (!supplier) {
                    throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${supplierId} не найден`);
                }
                data.supplier = { connect: { id: supplierId } };
            }
            else {
                data.supplier = { disconnect: true };
            }
        }
        if (dto.attrs !== undefined)
            data.attrs = dto.attrs;
        return this.audit.transaction(async (tx) => {
            if (dto.bundleComponents !== undefined) {
                const inFlightOrderLines = await tx.orderItem.count({
                    where: {
                        sku: product.sku,
                        order: { status: { in: [...IN_FLIGHT_ORDER_STATUSES] } },
                    },
                });
                if (inFlightOrderLines > 0) {
                    throw new errors_1.ConflictError('bundle_composition_in_flight', 'Состав набора нельзя менять, пока по нему исполняются заказы');
                }
                const components = await this.resolveBundleComponents(tx, product.sku, dto.bundleComponents);
                if (components.length > 0) {
                    const [directStock, componentUse] = await Promise.all([
                        tx.deviceUnit.count({ where: { productId } }),
                        tx.productBundleComponent.count({ where: { componentProductId: productId } }),
                    ]);
                    if (directStock > 0) {
                        throw new errors_1.ValidationError('bundle_has_direct_stock', 'Товар с собственными складскими единицами нельзя превратить в виртуальный набор');
                    }
                    if (componentUse > 0) {
                        throw new errors_1.ValidationError('bundle_component_in_use', 'Компонент существующего набора нельзя превратить во вложенный набор');
                    }
                }
                data.bundleComponents = { deleteMany: {}, create: components };
            }
            const updated = await tx.product.update({
                where: { id: productId },
                data,
                include: this.stockCountInclude(),
            });
            const events = [
                {
                    type: event_types_1.EventType.ProductUpdated,
                    actor: requester,
                    payload: {
                        productId,
                        sku: product.sku,
                        changes: Object.keys(data),
                    },
                    refs: [productId, product.sku],
                },
            ];
            if (data.supplyMode !== undefined &&
                (data.supplyMode !== product.supplyMode || data.supplyLeadDays !== product.supplyLeadDays)) {
                events.push({
                    type: event_types_1.EventType.ProductSupplyModeChanged,
                    actor: requester,
                    payload: {
                        productId,
                        sku: product.sku,
                        from: { supplyMode: product.supplyMode, supplyLeadDays: product.supplyLeadDays },
                        to: { supplyMode: data.supplyMode, supplyLeadDays: data.supplyLeadDays ?? null },
                    },
                    refs: [productId, product.sku],
                });
            }
            if (dto.supplierId !== undefined && this.optionalValue(dto.supplierId) !== product.supplierId) {
                events.push({
                    type: event_types_1.EventType.ProductUpdated,
                    actor: requester,
                    payload: {
                        productId,
                        sku: product.sku,
                        changes: ['supplierId'],
                        from: product.supplierId,
                        to: this.optionalValue(dto.supplierId),
                    },
                    refs: [productId, product.sku],
                });
            }
            if (dto.cost !== undefined && dto.cost !== product.cost) {
                events.push({
                    type: event_types_1.EventType.ProductCostChanged,
                    actor: requester,
                    payload: {
                        productId,
                        sku: product.sku,
                        from: product.cost,
                        to: dto.cost,
                        deltaPct: product.cost === 0
                            ? null
                            : Math.round(((dto.cost - product.cost) / product.cost) * 1000) / 10,
                    },
                    refs: [productId, product.sku],
                });
            }
            return {
                result: this.toAdminProduct(updated),
                events,
            };
        });
    }
    async reviews(productId) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product || product.archived) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${productId} не найден`);
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
    async createReview(productId, user, dto) {
        if (user.typ !== 'customer') {
            throw new errors_1.ForbiddenError('customer_token_required', 'Отзывы оставляют только клиенты');
        }
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product || product.archived) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${productId} не найден`);
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
            throw new errors_1.ForbiddenError('review_purchase_required', 'Отзыв доступен после покупки товара');
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
            throw new errors_1.ConflictError('review_already_exists', 'Отзыв по этому заказу уже оставлен');
        }
        const text = dto.text?.trim() || null;
        const customerName = order.customer.name.trim() || this.maskPhone(order.customer.phone);
        const verdict = text && this.moderation ? await this.moderation.moderate(text) : null;
        const rejected = verdict ? !verdict.allowed : false;
        const moderationReason = rejected ? verdict.reason || verdict.categories.join(', ') : null;
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
            const events = [
                {
                    type: event_types_1.EventType.ProductReviewSubmitted,
                    actor: user.customerId,
                    payload: { reviewId: review.id, productId, orderId: order.id, rating: dto.rating },
                    refs: [review.id, productId, order.id, user.customerId],
                },
            ];
            if (rejected) {
                events.push({
                    type: event_types_1.EventType.ProductReviewRejected,
                    actor: 'ai',
                    payload: { reviewId: review.id, productId, status: 'rejected', reason: moderationReason },
                    refs: [review.id, productId, order.id, user.customerId],
                });
            }
            return { result: review, events };
        });
    }
    async reviewModerationQueue(status) {
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
    async moderateReview(reviewId, dto, actor) {
        const targetStatus = dto.action === 'approve' ? 'approved' : 'rejected';
        const reason = dto.reason?.trim() || null;
        if (targetStatus === 'rejected' && !reason) {
            throw new errors_1.ValidationError('review_rejection_reason_required', 'Укажите причину отклонения');
        }
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`product-review:${reviewId}`}))`;
            const review = await tx.productReview.findUnique({ where: { id: reviewId } });
            if (!review)
                throw new errors_1.ValidationError('review_not_found', 'Отзыв не найден');
            if (review.status === targetStatus)
                return { result: review, events: [] };
            if (review.status !== 'pending') {
                throw new errors_1.ConflictError('review_already_moderated', 'Решение по отзыву уже принято');
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
                        type: targetStatus === 'approved' ? event_types_1.EventType.ProductReviewApproved : event_types_1.EventType.ProductReviewRejected,
                        actor,
                        payload: { reviewId, productId: review.productId, status: targetStatus, reason },
                        refs: [reviewId, review.productId, review.orderId, review.customerId],
                    }],
            };
        });
    }
    async changePrice(productId, newPrice, reason, requester) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${productId} не найден`);
        }
        const deltaPct = product.price === 0 ? Infinity : (Math.abs(newPrice - product.price) / product.price) * 100;
        if (deltaPct > PRICE_APPROVAL_THRESHOLD_PCT) {
            return this.approvals.request({
                action: 'price',
                requester,
                reason,
                payload: { productId, newPrice, oldPrice: product.price },
            });
        }
        return this.audit.transaction(async (tx) => {
            const updated = await tx.product.update({
                where: { id: productId },
                data: { price: newPrice },
            });
            return {
                result: { applied: true, productId, price: updated.price },
                events: [
                    {
                        type: event_types_1.EventType.PriceChanged,
                        actor: requester,
                        payload: { productId, from: product.price, to: newPrice },
                        refs: [productId],
                    },
                ],
            };
        });
    }
    async archive(productId, reason, requester) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            throw new errors_1.ValidationError('product_not_found', `Товар ${productId} не найден`);
        }
        return this.approvals.request({
            action: 'delete',
            requester,
            reason,
            payload: { productId },
        });
    }
    maskPhone(phone) {
        return phone.length > 4 ? `Клиент ${phone.slice(-4)}` : 'Клиент';
    }
    toAdminProduct(product) {
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
            supplyMode: product.supplyMode,
            supplyLeadDays: product.supplyLeadDays,
            supplierId: product.supplierId,
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
    stockCountInclude() {
        return {
            _count: {
                select: {
                    units: { where: { status: 'in_stock' } },
                },
            },
            bundleComponents: {
                orderBy: { componentProductId: 'asc' },
                include: {
                    componentProduct: {
                        include: {
                            balances: true,
                            _count: {
                                select: {
                                    units: { where: { status: 'in_stock' } },
                                },
                            },
                        },
                    },
                },
            },
            balances: true,
        };
    }
    availableUnits(product) {
        if (product.bundleComponents.length === 0)
            return this.directAvailability(product);
        return Math.min(...product.bundleComponents.map((component) => Math.floor(this.directAvailability(component.componentProduct) / component.qty)));
    }
    directAvailability(product) {
        if (product.trackingMode === 'serialized')
            return product._count.units;
        return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
    }
    async resolveBundleComponents(tx, bundleSku, input) {
        if (!input?.length)
            return [];
        const normalized = input.map((component) => ({ sku: component.sku.trim(), qty: component.qty }));
        if (normalized.some((component) => !component.sku || component.sku === bundleSku)) {
            throw new errors_1.ValidationError('bundle_component_invalid', 'Набор не может содержать пустой SKU или самого себя');
        }
        if (new Set(normalized.map((component) => component.sku)).size !== normalized.length) {
            throw new errors_1.ValidationError('bundle_component_duplicate', 'Компоненты набора не должны повторяться');
        }
        const products = await tx.product.findMany({
            where: { sku: { in: normalized.map((component) => component.sku) }, archived: false },
            include: { _count: { select: { bundleComponents: true } } },
        });
        if (products.length !== normalized.length) {
            const found = new Set(products.map((component) => component.sku));
            const missing = normalized.find((component) => !found.has(component.sku))?.sku;
            throw new errors_1.ValidationError('bundle_component_not_found', `Компонент ${missing} не найден`);
        }
        const nested = products.find((component) => component._count.bundleComponents > 0);
        if (nested) {
            throw new errors_1.ValidationError('nested_bundle_forbidden', `Набор ${nested.sku} нельзя вложить в другой набор`);
        }
        const bySku = new Map(products.map((component) => [component.sku, component]));
        return normalized.map((component) => ({
            componentProductId: bySku.get(component.sku).id,
            qty: component.qty,
        }));
    }
    optionalValue(value) {
        return value?.trim() || null;
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        approvals_service_1.ApprovalsService,
        moderation_service_1.ModerationService])
], ProductsService);
//# sourceMappingURL=products.service.js.map