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
exports.StorefrontService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const catalog_service_1 = require("../catalog/catalog.service");
const errors_1 = require("../common/errors");
const storefront_publish_1 = require("./storefront-publish");
const moderation_service_1 = require("../ai/moderation.service");
const prisma_service_1 = require("../prisma/prisma.service");
const FALLBACK_CONTENT = {
    id: 'fallback',
    version: 0,
    status: 'published',
    heroEyebrow: 'Доставка 1–2 часа по Манасу',
    heroTitle: 'Техника с гарантией. Новое и Б/У.',
    heroBody: 'Рассрочка 0%, trade-in старого устройства, один профиль и корзина на сайте и в приложении.',
    heroCtaLabel: 'В каталог',
    heroCtaHref: '/catalog',
    heroImageUrl: null,
    financingText: null,
    aboutTitle: 'О AliStore',
    aboutBody: 'AliStore объединяет интернет-магазин, склад, сервис и торговую точку в одной системе. На сайте публикуются только товары и условия, подтверждённые операционными данными.',
    deliveryTitle: 'Доставка и получение',
    deliveryBody: 'Доступные точки, зоны, стоимость и интервалы показываются при оформлении заказа. Итоговые условия подтверждает сервер до оплаты.',
    contactPhone: null,
    supportHours: null,
    featuredTitle: 'Популярное',
    featuredProductIds: [],
    benefits: [
        { title: 'Актуальное наличие', body: 'Остаток поступает из складской системы' },
        { title: 'Прозрачное оформление', body: 'Цена и доставка подтверждаются до оплаты' },
    ],
    publishedAt: null,
    startsAt: null,
    endsAt: null,
};
let StorefrontService = class StorefrontService {
    constructor(prisma, audit, catalog, moderation) {
        this.prisma = prisma;
        this.audit = audit;
        this.catalog = catalog;
        this.moderation = moderation;
    }
    async publicContent() {
        const now = new Date();
        const [published, scheduled, stores] = await Promise.all([
            this.prisma.storefrontContentRevision.findFirst({
                where: { status: 'published' },
                orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
            }),
            this.prisma.storefrontContentRevision.findFirst({
                where: {
                    status: 'scheduled',
                    startsAt: { lte: now },
                    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                },
                orderBy: [{ startsAt: 'desc' }, { version: 'desc' }],
            }),
            this.prisma.storePoint.findMany({
                where: { active: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                select: { id: true, code: true, name: true, address: true, hours: true },
            }),
        ]);
        const revision = scheduled ?? published;
        const content = revision ? this.publicView(revision) : FALLBACK_CONTENT;
        return {
            content,
            stores,
            featuredProducts: await this.catalog.curated([...content.featuredProductIds]),
        };
    }
    list() {
        return this.prisma.storefrontContentRevision.findMany({ orderBy: { version: 'desc' }, take: 20 });
    }
    async createDraft(dto, actor) {
        const normalized = this.normalize(dto);
        await this.assertContentClean(normalized);
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('storefront-content-version'))`;
            await this.assertFeaturedProducts(tx, normalized.featuredProductIds);
            const latest = await tx.storefrontContentRevision.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
            const revision = await tx.storefrontContentRevision.create({
                data: { ...normalized, version: (latest?.version ?? 0) + 1, benefits: normalized.benefits, createdBy: actor },
            });
            return {
                result: revision,
                events: [{ type: event_types_1.EventType.StorefrontContentDrafted, actor, payload: { revisionId: revision.id, version: revision.version }, refs: [revision.id] }],
            };
        });
    }
    async publish(id, actor) {
        return this.audit.transaction(async (tx) => {
            const events = [];
            const published = await (0, storefront_publish_1.publishStorefrontRevisionOnTx)(tx, id, actor, events);
            return { result: published, events };
        });
    }
    async schedule(id, dto, actor) {
        const startsAt = new Date(dto.startsAt);
        const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
        if (startsAt.getTime() <= Date.now()) {
            throw new errors_1.ValidationError('storefront_schedule_future_required', 'Начало публикации должно быть в будущем');
        }
        if (endsAt && endsAt <= startsAt) {
            throw new errors_1.ValidationError('storefront_schedule_range_invalid', 'Окончание должно быть позже начала');
        }
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('storefront-content-schedule'))`;
            const revision = await tx.storefrontContentRevision.findUnique({ where: { id } });
            if (!revision)
                throw new errors_1.ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
            if (revision.status !== 'draft')
                throw new errors_1.ConflictError('storefront_revision_not_draft', 'Запланировать можно только черновик');
            const overlap = await tx.storefrontContentRevision.findFirst({
                where: {
                    status: 'scheduled',
                    ...(endsAt ? { startsAt: { lt: endsAt } } : {}),
                    OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
                },
                select: { id: true, version: true },
            });
            if (overlap) {
                throw new errors_1.ConflictError('storefront_schedule_overlap', `Интервал пересекается с запланированной версией v${overlap.version}`);
            }
            const scheduled = await tx.storefrontContentRevision.update({
                where: { id },
                data: { status: 'scheduled', scheduledBy: actor, startsAt, endsAt },
            });
            return {
                result: scheduled,
                events: [{
                        type: event_types_1.EventType.StorefrontContentScheduled,
                        actor,
                        payload: { revisionId: id, version: scheduled.version, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null },
                        refs: [id],
                    }],
            };
        });
    }
    async cancelSchedule(id, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('storefront-content-schedule'))`;
            const revision = await tx.storefrontContentRevision.findUnique({ where: { id } });
            if (!revision)
                throw new errors_1.ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
            if (revision.status !== 'scheduled')
                throw new errors_1.ConflictError('storefront_revision_not_scheduled', 'У ревизии нет активного расписания');
            const draft = await tx.storefrontContentRevision.update({
                where: { id },
                data: { status: 'draft', scheduledBy: null, startsAt: null, endsAt: null },
            });
            return {
                result: draft,
                events: [{ type: event_types_1.EventType.StorefrontContentScheduleCancelled, actor, payload: { revisionId: id, version: draft.version }, refs: [id] }],
            };
        });
    }
    normalize(dto) {
        const required = (value, field) => {
            const result = value.trim();
            if (!result)
                throw new errors_1.ValidationError('storefront_content_required', `${field} обязательно`);
            return result;
        };
        return {
            heroEyebrow: required(dto.heroEyebrow, 'Метка'),
            heroTitle: required(dto.heroTitle, 'Заголовок'),
            heroBody: required(dto.heroBody, 'Описание'),
            heroCtaLabel: required(dto.heroCtaLabel, 'Текст кнопки'),
            heroCtaHref: this.safeUrl(required(dto.heroCtaHref, 'Ссылка кнопки'), 'Ссылка кнопки'),
            heroImageUrl: dto.heroImageUrl?.trim() ? this.safeUrl(dto.heroImageUrl.trim(), 'Изображение') : null,
            financingText: dto.financingText?.trim() || null,
            aboutTitle: required(dto.aboutTitle, 'Заголовок о компании'),
            aboutBody: required(dto.aboutBody, 'Текст о компании'),
            deliveryTitle: required(dto.deliveryTitle, 'Заголовок доставки'),
            deliveryBody: required(dto.deliveryBody, 'Текст доставки'),
            contactPhone: dto.contactPhone?.trim() || null,
            supportHours: dto.supportHours?.trim() || null,
            benefits: dto.benefits.map((benefit) => this.benefit(benefit)),
            featuredTitle: required(dto.featuredTitle, 'Заголовок подборки'),
            featuredProductIds: dto.featuredProductIds,
        };
    }
    async assertFeaturedProducts(tx, ids) {
        if (ids.length === 0)
            return;
        const products = await tx.product.findMany({
            where: { id: { in: ids }, archived: false },
            select: { id: true },
        });
        if (products.length !== ids.length) {
            throw new errors_1.ValidationError('storefront_featured_product_invalid', 'Подборка содержит отсутствующий или архивный товар');
        }
    }
    async assertContentClean(content) {
        const text = [
            content.heroEyebrow,
            content.heroTitle,
            content.heroBody,
            content.heroCtaLabel,
            content.financingText,
            content.aboutTitle,
            content.aboutBody,
            content.deliveryTitle,
            content.deliveryBody,
            content.featuredTitle,
            ...content.benefits.flatMap((b) => [b.title, b.body]),
        ]
            .filter((v) => typeof v === 'string' && v.trim().length > 0)
            .join('\n');
        if (!text)
            return;
        const verdict = await this.moderation.moderate(text);
        if (!verdict.allowed) {
            throw new errors_1.ValidationError('storefront_content_flagged', verdict.reason || verdict.categories.join(', '));
        }
    }
    benefit(value) {
        const title = value.title.trim();
        const body = value.body.trim();
        if (!title || !body)
            throw new errors_1.ValidationError('storefront_benefit_required', 'Преимущество требует заголовок и описание');
        return { title, body };
    }
    safeUrl(value, field) {
        if (value.startsWith('/') && !value.startsWith('//'))
            return value;
        try {
            const url = new URL(value);
            if (url.protocol === 'https:')
                return url.toString();
        }
        catch { }
        throw new errors_1.ValidationError('storefront_url_invalid', `${field}: используйте внутренний путь или HTTPS URL`);
    }
    publicView(revision) {
        return {
            ...revision,
            publishedAt: revision.publishedAt?.toISOString() ?? null,
            startsAt: revision.startsAt?.toISOString() ?? null,
            endsAt: revision.endsAt?.toISOString() ?? null,
        };
    }
};
exports.StorefrontService = StorefrontService;
exports.StorefrontService = StorefrontService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        catalog_service_1.CatalogService,
        moderation_service_1.ModerationService])
], StorefrontService);
//# sourceMappingURL=storefront.service.js.map