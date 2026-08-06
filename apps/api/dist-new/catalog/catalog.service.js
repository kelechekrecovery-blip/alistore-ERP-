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
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const errors_1 = require("../common/errors");
const installments_1 = require("./installments");
const loyalty_ledger_1 = require("../customers/loyalty-ledger");
const settings_service_1 = require("../settings/settings.service");
const prisma_service_1 = require("../prisma/prisma.service");
const importMeili = new Function('specifier', 'return import(specifier)');
let CatalogService = class CatalogService {
    constructor(prisma, config, settings) {
        this.prisma = prisma;
        this.config = config;
        this.settings = settings;
    }
    async search(query) {
        const normalized = this.normalizeQuery(query);
        if (normalized.q && this.meiliHost()) {
            try {
                return await this.searchMeili(normalized);
            }
            catch {
                return this.searchPostgres(normalized, 'postgres_fallback', 'meilisearch_unavailable');
            }
        }
        return this.searchPostgres(normalized, 'postgres');
    }
    async delta(query) {
        const limit = Math.min(Math.max(query.limit ?? 500, 1), 500);
        const since = parseSince(query.since);
        const where = since
            ? {
                OR: [
                    { updatedAt: { gt: since } },
                    { units: { some: { updatedAt: { gt: since } } } },
                    { balances: { some: { updatedAt: { gt: since } } } },
                ],
            }
            : {};
        const products = await this.prisma.product.findMany({
            where,
            take: limit + 1,
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            include: this.stockCountInclude(),
        });
        const window = products.slice(0, limit);
        const active = window.filter((product) => !product.archived);
        const removed = window
            .filter((product) => product.archived)
            .map((product) => product.id);
        return {
            cursor: new Date().toISOString(),
            since: query.since?.trim() || undefined,
            changed: await this.enrichSellers(active.map((product) => this.toCatalogProduct(product))),
            removed,
            totalChanged: active.length,
            totalRemoved: removed.length,
            truncated: products.length > limit,
        };
    }
    async categories() {
        const rows = await this.prisma.product.groupBy({
            by: ['category'], where: { archived: false }, orderBy: { category: 'asc' }, _count: { _all: true },
        });
        return rows.map((row) => ({ category: row.category, count: row._count._all }));
    }
    async product(id) {
        const product = await this.prisma.product.findFirst({
            where: { id, archived: false }, include: this.stockCountInclude(),
        });
        if (!product)
            throw new errors_1.ValidationError('catalog_product_not_found', `Товар ${id} не найден`);
        const [variants, related] = await Promise.all([
            product.variantGroup ? this.prisma.product.findMany({
                where: { archived: false, variantGroup: product.variantGroup, id: { not: id } },
                orderBy: [{ price: 'asc' }, { name: 'asc' }], include: this.stockCountInclude(),
            }) : [],
            this.prisma.product.findMany({
                where: { archived: false, category: product.category, id: { not: id } },
                orderBy: [{ name: 'asc' }], take: 12, include: this.stockCountInclude(),
            }),
        ]);
        const enriched = await this.enrichOffers(await this.enrichSellers(await this.enrichReviews([product, ...variants, ...related].map((item) => this.toCatalogProduct(item)))));
        const [main, ...rest] = enriched;
        return { product: main, variants: rest.slice(0, variants.length), related: rest.slice(variants.length) };
    }
    async curated(ids) {
        if (ids.length === 0)
            return [];
        const products = await this.prisma.product.findMany({
            where: { id: { in: ids }, archived: false },
            include: this.stockCountInclude(),
        });
        const enrichedProducts = await this.enrichSellers(products.map((product) => this.toCatalogProduct(product)));
        const byId = new Map(enrichedProducts.map((product) => [product.id, product]));
        const ordered = ids
            .map((id) => byId.get(id))
            .filter((product) => Boolean(product));
        return this.enrichReviews(ordered);
    }
    async reindex(maintenanceToken) {
        this.assertMaintenanceToken(maintenanceToken);
        const indexName = this.indexName();
        const client = await this.requireMeiliClient();
        const index = client.index(indexName);
        const products = await this.prisma.product.findMany({
            where: { archived: false },
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
            include: this.stockCountInclude(),
        });
        const documents = products.map((product) => ({
            ...this.toCatalogProduct(product),
            archived: product.archived,
        }));
        await index.updateSettings({
            displayedAttributes: ['id', 'sku', 'barcode', 'variantGroup', 'name', 'price', 'category', 'attrs', 'bundleComponents', 'availableUnits'],
            searchableAttributes: ['name', 'sku', 'barcode', 'variantGroup', 'category'],
            filterableAttributes: ['category', 'variantGroup', 'archived', 'availableUnits'],
            sortableAttributes: ['price', 'availableUnits', 'name'],
        });
        const task = await index.addDocuments(documents, { primaryKey: 'id' });
        return {
            source: 'meilisearch',
            index: indexName,
            indexed: documents.length,
            taskUid: task.taskUid ?? task.uid,
        };
    }
    async searchMeili(query) {
        const client = await this.requireMeiliClient();
        const filters = ['archived = false'];
        if (query.category) {
            filters.push(`category = ${this.quoteMeiliFilterValue(query.category)}`);
        }
        if (query.stockOnly) {
            filters.push('availableUnits > 0');
        }
        const response = await client.index(this.indexName()).search(query.q ?? '', {
            limit: query.limit,
            offset: query.offset,
            filter: filters.join(' AND '),
            ...(query.sort === 'price_asc' ? { sort: ['price:asc'] }
                : query.sort === 'price_desc' ? { sort: ['price:desc'] }
                    : query.sort === 'stock_desc' ? { sort: ['availableUnits:desc'] } : {}),
        });
        const ids = (response.hits ?? [])
            .map((hit) => (hit.id === undefined ? undefined : String(hit.id)))
            .filter((id) => Boolean(id));
        if (ids.length === 0) {
            return {
                source: 'meilisearch',
                total: response.estimatedTotalHits ?? response.totalHits ?? 0,
                limit: query.limit,
                offset: query.offset,
                items: [],
            };
        }
        const products = await this.prisma.product.findMany({
            where: {
                ...this.sourceOfTruthWhere(query),
                id: { in: ids },
            },
            include: this.stockCountInclude(),
        });
        const byId = new Map(products.map((product) => [product.id, this.toCatalogProduct(product)]));
        const ordered = ids
            .map((id) => byId.get(id))
            .filter((product) => Boolean(product));
        return {
            source: 'meilisearch',
            total: response.estimatedTotalHits ?? response.totalHits ?? ordered.length,
            limit: query.limit,
            offset: query.offset,
            items: await this.enrichOffers(await this.enrichSellers(await this.enrichReviews(ordered))),
        };
    }
    async searchPostgres(query, source, warning) {
        const where = this.sourceOfTruthWhere(query);
        if (query.stockOnly || query.sort === 'stock_desc') {
            const candidates = await this.prisma.product.findMany({
                where,
                orderBy: this.orderBy(query.sort),
                include: this.stockCountInclude(),
            });
            const sorted = candidates
                .map((product) => this.toCatalogProduct(product))
                .filter((product) => !query.stockOnly || product.availableUnits > 0)
                .sort((a, b) => this.compareProducts(a, b, query.sort));
            return {
                source,
                warning,
                total: sorted.length,
                limit: query.limit,
                offset: query.offset,
                items: await this.enrichOffers(await this.enrichSellers(await this.enrichReviews(sorted.slice(query.offset, query.offset + query.limit)))),
            };
        }
        const [total, products] = await this.prisma.$transaction([
            this.prisma.product.count({ where }),
            this.prisma.product.findMany({
                where,
                skip: query.offset,
                take: query.limit,
                orderBy: this.orderBy(query.sort),
                include: this.stockCountInclude(),
            }),
        ]);
        return {
            source,
            warning,
            total,
            limit: query.limit,
            offset: query.offset,
            items: await this.enrichOffers(await this.enrichSellers(await this.enrichReviews(products.map((product) => this.toCatalogProduct(product))))),
        };
    }
    sourceOfTruthWhere(query) {
        const q = query.q?.trim();
        return {
            archived: false,
            ...(query.category ? { category: query.category } : {}),
            ...(q
                ? {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { sku: { contains: q, mode: 'insensitive' } },
                        { barcode: { contains: q, mode: 'insensitive' } },
                        { variantGroup: { contains: q, mode: 'insensitive' } },
                        { category: { contains: q, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
    }
    normalizeQuery(query) {
        return {
            q: query.q?.trim() || undefined,
            category: query.category?.trim() || undefined,
            stockOnly: query.stockOnly ?? false,
            sort: query.sort ?? 'name',
            limit: query.limit ?? 24,
            offset: query.offset ?? 0,
        };
    }
    toCatalogProduct(product) {
        const availableUnits = product.bundleComponents.length > 0
            ? Math.min(...product.bundleComponents.map((component) => Math.floor(this.directAvailability(component.componentProduct) / component.qty)))
            : this.directAvailability(product);
        const offer = product.supplierOffers.find((candidate) => candidate.active);
        const toOrderCheckoutEnabled = this.config.get('TO_ORDER_CHECKOUT_ENABLED')?.trim().toLowerCase() === 'true';
        const marginBps = offer && product.price > 0
            ? Math.floor(((product.price - offer.unitCost) * 10_000) / product.price)
            : -10_000;
        const orderableToOrder = product.supplyMode === 'to_order'
            && toOrderCheckoutEnabled
            && Boolean(offer)
            && offer.validUntil > new Date()
            && offer.availableQty > 0
            && marginBps >= 1000;
        const availabilityKind = availableUnits > 0
            ? 'in_stock'
            : product.supplyMode === 'to_order'
                ? 'to_order'
                : 'unavailable';
        return {
            sellerId: product.sellerId,
            id: product.id,
            sku: product.sku,
            barcode: product.barcode,
            variantGroup: product.variantGroup,
            name: product.name,
            price: product.price,
            category: product.category,
            trackingMode: product.trackingMode,
            supplyMode: product.supplyMode,
            supplyLeadDays: product.supplyLeadDays,
            orderable: availableUnits > 0 || orderableToOrder,
            availabilityKind,
            leadTimeDays: product.supplyMode === 'to_order' ? product.supplyLeadDays : null,
            estimatedDeliveryDate: product.supplyMode === 'to_order' && product.supplyLeadDays
                ? bishkekDatePlusDays(product.supplyLeadDays)
                : null,
            attrs: product.attrs,
            bundleComponents: product.bundleComponents.map((component) => ({
                productId: component.componentProductId,
                sku: component.componentProduct.sku,
                name: component.componentProduct.name,
                qty: component.qty,
            })),
            availableUnits,
            reviewCount: 0,
            avgRating: null,
            updatedAt: product.updatedAt.toISOString(),
        };
    }
    async installmentQrs() {
        const settings = this.settings;
        if (!settings)
            return {};
        const [payda, omarket, zero, mplus] = await Promise.all([
            settings.text('installment.payda.qr_url'),
            settings.text('installment.omarket.qr_url'),
            settings.text('installment.zero.qr_url'),
            settings.text('installment.mplus.qr_url'),
        ]);
        return { payda, omarket, zero, mplus };
    }
    async installmentPlans() {
        const settings = this.settings;
        if (!settings)
            return [];
        const values = await settings.values([
            'installment.payda.months', 'installment.payda.markup_bps', 'installment.payda.limit_som',
            'installment.omarket.months', 'installment.omarket.markup_bps', 'installment.omarket.limit_som',
            'installment.zero.months', 'installment.zero.markup_bps', 'installment.zero.limit_som',
            'installment.mplus.months', 'installment.mplus.markup_bps', 'installment.mplus.limit_som',
        ]);
        return [
            { id: 'payda', label: 'Payda', maxMonths: values['installment.payda.months'], markupBps: values['installment.payda.markup_bps'], limitSom: values['installment.payda.limit_som'] },
            { id: 'omarket', label: 'O!Market', maxMonths: values['installment.omarket.months'], markupBps: values['installment.omarket.markup_bps'], limitSom: values['installment.omarket.limit_som'] },
            { id: 'zero', label: 'ZERO', maxMonths: values['installment.zero.months'], markupBps: values['installment.zero.markup_bps'], limitSom: values['installment.zero.limit_som'] },
            { id: 'mplus', label: 'M+', maxMonths: values['installment.mplus.months'], markupBps: values['installment.mplus.markup_bps'], limitSom: values['installment.mplus.limit_som'] },
        ];
    }
    async enrichOffers(items) {
        if (items.length === 0)
            return items;
        const [plans, qrs, earnRateBps] = await Promise.all([
            this.installmentPlans(),
            this.installmentQrs(),
            this.settings ? this.settings.value('loyalty.earn_rate_bps') : Promise.resolve(undefined),
        ]);
        const anyPlan = plans.some((plan) => plan.maxMonths > 0);
        if (!anyPlan && earnRateBps === undefined)
            return items;
        return items.map((item) => {
            const steps = anyPlan ? (0, installments_1.installmentLadder)(item.price, plans) : [];
            const offeredLabels = new Set(steps.flatMap((step) => step.providers));
            const providers = plans
                .filter((plan) => offeredLabels.has(plan.label))
                .map((plan) => ({ id: plan.id, label: plan.label, qrUrl: qrs[plan.id] ?? '' }))
                .filter((provider) => provider.qrUrl !== '');
            return {
                ...item,
                installment: anyPlan ? (0, installments_1.bestInstallmentOffer)(item.price, plans) : null,
                installmentSteps: steps,
                installmentProviders: providers.length > 0 ? providers : undefined,
                bonusPoints: earnRateBps === undefined ? undefined : (0, loyalty_ledger_1.loyaltyEarnAmount)(item.price, earnRateBps),
            };
        });
    }
    async enrichSellers(items) {
        if (items.length === 0)
            return items;
        const ids = [...new Set(items.map((item) => item.sellerId).filter((id) => Boolean(id)))];
        const rows = ids.length === 0 ? [] : await this.prisma.seller.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return items.map((item) => {
            const { sellerId, ...publicFields } = item;
            const seller = sellerId ? byId.get(sellerId) : undefined;
            return seller ? { ...publicFields, seller } : publicFields;
        });
    }
    async enrichReviews(items) {
        if (items.length === 0)
            return items;
        const rows = await this.prisma.productReview.groupBy({
            by: ['productId'], where: { productId: { in: items.map((item) => item.id) }, status: 'approved' },
            _count: { _all: true }, _avg: { rating: true },
        });
        const summaries = new Map(rows.map((row) => [row.productId, { reviewCount: row._count._all, avgRating: row._avg.rating === null ? null : Math.round(row._avg.rating * 10) / 10 }]));
        return items.map((item) => ({ ...item, ...(summaries.get(item.id) ?? { reviewCount: 0, avgRating: null }) }));
    }
    orderBy(sort) {
        if (sort === 'price_asc')
            return [{ price: 'asc' }, { name: 'asc' }];
        if (sort === 'price_desc')
            return [{ price: 'desc' }, { name: 'asc' }];
        return [{ category: 'asc' }, { name: 'asc' }];
    }
    compareProducts(a, b, sort) {
        if (sort === 'price_asc')
            return a.price - b.price || a.name.localeCompare(b.name, 'ru');
        if (sort === 'price_desc')
            return b.price - a.price || a.name.localeCompare(b.name, 'ru');
        if (sort === 'stock_desc')
            return b.availableUnits - a.availableUnits || a.name.localeCompare(b.name, 'ru');
        return a.name.localeCompare(b.name, 'ru');
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
            supplierOffers: {
                where: { active: true },
            },
        };
    }
    directAvailability(product) {
        if (product.trackingMode === 'serialized')
            return product._count.units;
        return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
    }
    async requireMeiliClient() {
        const host = this.meiliHost();
        if (!host) {
            throw new errors_1.ValidationError('meilisearch_not_configured', 'MEILI_HOST must be configured before using Meilisearch');
        }
        if (!this.meiliClientPromise) {
            const apiKey = this.config.get('MEILI_API_KEY')?.trim();
            this.meiliClientPromise = importMeili('meilisearch').then((module) => {
                const MeiliClient = module.MeiliSearch ?? module.Meilisearch ?? module.default;
                if (!MeiliClient) {
                    throw new errors_1.ValidationError('meilisearch_client_unavailable', 'The meilisearch package did not expose a supported client constructor');
                }
                return new MeiliClient({ host, apiKey: apiKey || undefined });
            });
        }
        return this.meiliClientPromise;
    }
    assertMaintenanceToken(token) {
        const expected = this.config.get('SEARCH_ADMIN_TOKEN')?.trim();
        if (!expected) {
            throw new errors_1.ForbiddenError('maintenance_token_not_configured', 'SEARCH_ADMIN_TOKEN must be configured before reindexing catalog search');
        }
        if (token !== expected) {
            throw new errors_1.ForbiddenError('maintenance_token_invalid', 'Invalid catalog search maintenance token');
        }
    }
    meiliHost() {
        return this.config.get('MEILI_HOST')?.trim() || undefined;
    }
    indexName() {
        return this.config.get('MEILI_PRODUCTS_INDEX')?.trim() || 'products';
    }
    quoteMeiliFilterValue(value) {
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        settings_service_1.SettingsService])
], CatalogService);
function bishkekDatePlusDays(days, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bishkek',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const numberPart = (type) => Number(parts.find((part) => part.type === type)?.value);
    return new Date(Date.UTC(numberPart('year'), numberPart('month') - 1, numberPart('day') + days)).toISOString().slice(0, 10);
}
function parseSince(value) {
    const trimmed = value?.trim();
    if (!trimmed)
        return undefined;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        throw new errors_1.ValidationError('catalog_delta_cursor_invalid', 'Invalid catalog delta cursor');
    }
    return parsed;
}
//# sourceMappingURL=catalog.service.js.map