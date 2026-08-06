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
exports.StorefrontBlocksService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const moderation_service_1 = require("../ai/moderation.service");
const catalog_service_1 = require("../catalog/catalog.service");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
let StorefrontBlocksService = class StorefrontBlocksService {
    constructor(prisma, audit, catalog, moderation) {
        this.prisma = prisma;
        this.audit = audit;
        this.catalog = catalog;
        this.moderation = moderation;
    }
    list() {
        return this.prisma.storefrontBlock.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    }
    async publicBlocks(device) {
        const now = new Date();
        const rows = await this.prisma.storefrontBlock.findMany({
            where: {
                device: { in: device === 'all' ? ['all'] : ['all', device] },
                OR: [
                    { status: 'published' },
                    { status: 'scheduled', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                ],
            },
            orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'asc' }],
        });
        const hero = rows
            .filter((row) => row.type === 'hero')
            .sort((a, b) => Number(b.status === 'scheduled') - Number(a.status === 'scheduled') || dateValue(b.startsAt ?? b.publishedAt) - dateValue(a.startsAt ?? a.publishedAt))[0];
        const selected = [...(hero ? [hero] : []), ...rows.filter((row) => row.type !== 'hero')]
            .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
        const wanted = [...new Set(selected.filter((row) => row.type === 'collection').flatMap((row) => row.productIds))];
        const curated = await this.catalog.curated(wanted);
        const byId = new Map(curated.map((product) => [product.id, product]));
        return selected.map((row) => ({
            ...row,
            products: row.type === 'collection'
                ? row.productIds.map((id) => byId.get(id)).filter((product) => product !== undefined)
                : [],
        }));
    }
    async create(dto, actor) {
        const data = await this.normalized(dto);
        return this.audit.transaction(async (tx) => {
            await this.lock(tx);
            const last = await tx.storefrontBlock.findFirst({ where: { status: { not: 'archived' } }, orderBy: { position: 'desc' }, select: { position: true } });
            const block = await tx.storefrontBlock.create({ data: { ...data, position: (last?.position ?? -1) + 1, createdBy: actor, updatedBy: actor } });
            return { result: block, events: [this.event(event_types_1.EventType.StorefrontBlockCreated, actor, block)] };
        });
    }
    async update(id, dto, actor) {
        const current = await this.requireBlock(id);
        if (current.status !== 'draft')
            throw new errors_1.ConflictError('storefront_block_not_draft', 'Редактировать можно только черновик');
        const data = await this.normalized({
            type: dto.type ?? current.type,
            device: dto.device ?? current.device,
            title: dto.title ?? current.title,
            eyebrow: dto.eyebrow === undefined ? current.eyebrow ?? undefined : dto.eyebrow,
            body: dto.body === undefined ? current.body ?? undefined : dto.body,
            ctaLabel: dto.ctaLabel === undefined ? current.ctaLabel ?? undefined : dto.ctaLabel,
            ctaHref: dto.ctaHref === undefined ? current.ctaHref ?? undefined : dto.ctaHref,
            imageUrl: dto.imageUrl === undefined ? current.imageUrl ?? undefined : dto.imageUrl,
            tone: dto.tone ?? current.tone,
            productIds: dto.productIds ?? current.productIds,
        });
        return this.audit.transaction(async (tx) => {
            const block = await tx.storefrontBlock.update({ where: { id }, data: { ...data, updatedBy: actor } });
            return { result: block, events: [this.event(event_types_1.EventType.StorefrontBlockUpdated, actor, block)] };
        });
    }
    publish(id, actor) {
        return this.audit.transaction(async (tx) => {
            await this.lock(tx);
            const current = await this.requireBlockOnTx(tx, id);
            if (current.status === 'published')
                return { result: current, events: [] };
            if (!['draft', 'archived'].includes(current.status))
                throw new errors_1.ConflictError('storefront_block_publish_forbidden', 'Сначала отмените расписание блока');
            if (current.type === 'hero')
                await this.archivePublishedHeroes(tx, current.device, id);
            const block = await tx.storefrontBlock.update({
                where: { id },
                data: { status: 'published', startsAt: null, endsAt: null, publishedAt: new Date(), updatedBy: actor },
            });
            return { result: block, events: [this.event(event_types_1.EventType.StorefrontBlockPublished, actor, block)] };
        });
    }
    schedule(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            await this.lock(tx);
            const current = await this.requireBlockOnTx(tx, id);
            if (!['draft', 'archived'].includes(current.status))
                throw new errors_1.ConflictError('storefront_block_schedule_forbidden', 'Запланировать можно черновик или архивный блок');
            const startsAt = new Date(dto.startsAt);
            const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
            if (startsAt <= new Date())
                throw new errors_1.ValidationError('storefront_block_start_invalid', 'Начало должно быть в будущем');
            if (endsAt && endsAt <= startsAt)
                throw new errors_1.ValidationError('storefront_block_window_invalid', 'Окончание должно быть позже начала');
            if (current.type === 'hero')
                await this.assertNoHeroScheduleOverlap(tx, current.device, startsAt, endsAt, id);
            const block = await tx.storefrontBlock.update({
                where: { id }, data: { status: 'scheduled', startsAt, endsAt, publishedAt: null, updatedBy: actor },
            });
            return { result: block, events: [this.event(event_types_1.EventType.StorefrontBlockScheduled, actor, block)] };
        });
    }
    archive(id, actor) {
        return this.changeStatus(id, 'archived', actor, event_types_1.EventType.StorefrontBlockArchived);
    }
    cancelSchedule(id, actor) {
        return this.audit.transaction(async (tx) => {
            const current = await this.requireBlockOnTx(tx, id);
            if (current.status !== 'scheduled')
                throw new errors_1.ConflictError('storefront_block_not_scheduled', 'У блока нет активного расписания');
            const block = await tx.storefrontBlock.update({ where: { id }, data: { status: 'draft', startsAt: null, endsAt: null, updatedBy: actor } });
            return { result: block, events: [this.event(event_types_1.EventType.StorefrontBlockScheduleCancelled, actor, block)] };
        });
    }
    reorder(dto, actor) {
        return this.audit.transaction(async (tx) => {
            await this.lock(tx);
            const rows = await tx.storefrontBlock.findMany({ where: { status: { not: 'archived' } }, select: { id: true } });
            const expected = new Set(rows.map((row) => row.id));
            if (dto.ids.length !== expected.size || dto.ids.some((id) => !expected.has(id))) {
                throw new errors_1.ValidationError('storefront_block_order_incomplete', 'Порядок должен содержать все неархивные блоки ровно один раз');
            }
            await Promise.all(dto.ids.map((id, index) => tx.storefrontBlock.update({ where: { id }, data: { position: 10_000 + index } })));
            await Promise.all(dto.ids.map((id, index) => tx.storefrontBlock.update({ where: { id }, data: { position: index, updatedBy: actor } })));
            return {
                result: await tx.storefrontBlock.findMany({ where: { id: { in: dto.ids } }, orderBy: { position: 'asc' } }),
                events: [{ type: event_types_1.EventType.StorefrontBlocksReordered, actor, payload: { ids: dto.ids }, refs: dto.ids }],
            };
        });
    }
    async normalized(dto) {
        const title = dto.title.trim();
        if (!title)
            throw new errors_1.ValidationError('storefront_block_title_required', 'Введите заголовок блока');
        const productIds = dto.productIds ?? [];
        if (dto.type === 'collection' && productIds.length === 0)
            throw new errors_1.ValidationError('storefront_block_products_required', 'Подборка должна содержать товары');
        if (dto.type !== 'collection' && productIds.length > 0)
            throw new errors_1.ValidationError('storefront_block_products_forbidden', 'Товары можно прикрепить только к подборке');
        if (productIds.length > 0) {
            const count = await this.prisma.product.count({ where: { id: { in: productIds }, archived: false } });
            if (count !== productIds.length)
                throw new errors_1.ValidationError('storefront_block_product_invalid', 'Подборка содержит отсутствующий или архивный товар');
        }
        const ctaHref = optional(dto.ctaHref);
        if (ctaHref && !ctaHref.startsWith('/') && !isHttps(ctaHref))
            throw new errors_1.ValidationError('storefront_block_cta_invalid', 'Ссылка должна начинаться с / или https://');
        const imageUrl = optional(dto.imageUrl);
        if (imageUrl && !isHttps(imageUrl))
            throw new errors_1.ValidationError('storefront_block_image_invalid', 'Изображение должно использовать HTTPS');
        const eyebrow = optional(dto.eyebrow);
        const body = optional(dto.body);
        const ctaLabel = optional(dto.ctaLabel);
        await this.assertContentClean([title, eyebrow, body, ctaLabel]);
        return {
            type: dto.type,
            device: dto.device ?? 'all',
            title,
            eyebrow,
            body,
            ctaLabel,
            ctaHref,
            imageUrl,
            tone: dto.tone ?? 'dark',
            productIds,
        };
    }
    async assertContentClean(parts) {
        const text = parts.filter((v) => typeof v === 'string' && v.trim().length > 0).join('\n');
        if (!text)
            return;
        const verdict = await this.moderation.moderate(text);
        if (!verdict.allowed) {
            throw new errors_1.ValidationError('storefront_block_flagged', verdict.reason || verdict.categories.join(', '));
        }
    }
    async assertNoHeroScheduleOverlap(tx, device, startsAt, endsAt, excludeId) {
        const overlap = await tx.storefrontBlock.findFirst({
            where: {
                id: { not: excludeId }, type: 'hero', status: 'scheduled',
                device: { in: overlappingDevices(device) },
                startsAt: { lt: endsAt ?? new Date('9999-12-31T23:59:59.999Z') },
                OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
            },
            select: { id: true },
        });
        if (overlap)
            throw new errors_1.ConflictError('storefront_block_schedule_overlap', 'Для этого устройства уже запланирован главный баннер на пересекающееся время');
    }
    archivePublishedHeroes(tx, device, excludeId) {
        return tx.storefrontBlock.updateMany({
            where: { id: { not: excludeId }, type: 'hero', status: 'published', device: { in: overlappingDevices(device) } },
            data: { status: 'archived' },
        });
    }
    async changeStatus(id, status, actor, type) {
        const current = await this.requireBlock(id);
        if (current.status === status)
            return current;
        return this.audit.transaction(async (tx) => {
            const block = await tx.storefrontBlock.update({ where: { id }, data: { status, updatedBy: actor } });
            return { result: block, events: [this.event(type, actor, block)] };
        });
    }
    requireBlock(id) {
        return this.prisma.storefrontBlock.findUnique({ where: { id } }).then((row) => {
            if (!row)
                throw new errors_1.ValidationError('storefront_block_not_found', 'Блок витрины не найден');
            return row;
        });
    }
    async requireBlockOnTx(tx, id) {
        const row = await tx.storefrontBlock.findUnique({ where: { id } });
        if (!row)
            throw new errors_1.ValidationError('storefront_block_not_found', 'Блок витрины не найден');
        return row;
    }
    lock(tx) {
        return tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('storefront-blocks'))`;
    }
    event(type, actor, block) {
        return { type, actor, payload: { blockId: block.id, blockType: block.type, status: block.status, device: block.device, position: block.position }, refs: [block.id] };
    }
};
exports.StorefrontBlocksService = StorefrontBlocksService;
exports.StorefrontBlocksService = StorefrontBlocksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        catalog_service_1.CatalogService,
        moderation_service_1.ModerationService])
], StorefrontBlocksService);
function optional(value) { return value?.trim() || null; }
function isHttps(value) { try {
    return new URL(value).protocol === 'https:';
}
catch {
    return false;
} }
function dateValue(value) { return value?.getTime() ?? 0; }
function overlappingDevices(device) {
    return device === 'all' ? ['all', 'desktop', 'mobile'] : ['all', device];
}
//# sourceMappingURL=storefront-blocks.service.js.map