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
exports.SupplierOffersService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const MINIMUM_MARGIN_BPS = 1000;
const DEFAULT_QUOTE_HOURS = 24;
let SupplierOffersService = class SupplierOffersService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    getActive(productId) {
        return this.prisma.supplierOffer.findFirst({
            where: { productId, active: true },
            include: { supplier: { select: { id: true, name: true } } },
        });
    }
    async replace(productId, dto, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'supplier-offer:' + productId}))::text AS locked`;
            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product)
                throw new errors_1.ValidationError('product_not_found', `Товар ${productId} не найден`);
            if (product.supplyMode !== 'to_order') {
                throw new errors_1.ConflictError('supplier_offer_own_stock_forbidden', 'Предложение поставщика можно активировать только для товара под заказ');
            }
            const supplier = await tx.supplier.findUnique({
                where: { id: dto.supplierId },
                select: { id: true },
            });
            if (!supplier) {
                throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
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
            const validUntil = new Date(checkedAt.getTime() + (dto.validForHours ?? DEFAULT_QUOTE_HOURS) * 60 * 60 * 1000);
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
                        type: event_types_1.EventType.SupplierOfferReplaced,
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
    async deactivate(productId, actor) {
        return this.audit.transaction(async (tx) => {
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
                        type: event_types_1.EventType.SupplierOfferDeactivated,
                        actor,
                        payload: { productId, offerId: active.id, supplierId: active.supplierId },
                        refs: [productId, active.id, active.supplierId],
                    }],
            };
        });
    }
    async integrity(actor) {
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
                const rows = [];
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
                }
                else {
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
                        type: event_types_1.EventType.SupplyIntegrityChecked,
                        actor,
                        payload: { checkedProducts: products.length, issueCount: issues.length },
                        refs: products.map((product) => product.id),
                    }],
            };
        });
    }
};
exports.SupplierOffersService = SupplierOffersService;
exports.SupplierOffersService = SupplierOffersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], SupplierOffersService);
//# sourceMappingURL=supplier-offers.service.js.map