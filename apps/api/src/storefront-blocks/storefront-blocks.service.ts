import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StorefrontBlock,
  StorefrontBlockDevice,
  StorefrontBlockStatus,
} from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ModerationService } from '../ai/moderation.service';
import { CatalogService } from '../catalog/catalog.service';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStorefrontBlockDto,
  ReorderStorefrontBlocksDto,
  ScheduleStorefrontBlockDto,
  UpdateStorefrontBlockDto,
} from './storefront-blocks.dto';

@Injectable()
export class StorefrontBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly moderation: ModerationService,
  ) {}

  list() {
    return this.prisma.storefrontBlock.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  }

  async publicBlocks(device: StorefrontBlockDevice) {
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
    return Promise.all(selected.map(async (row) => ({
      ...row,
      products: row.type === 'collection' ? await this.catalog.curated(row.productIds) : [],
    })));
  }

  async create(dto: CreateStorefrontBlockDto, actor: string) {
    const data = await this.normalized(dto);
    return this.audit.transaction(async (tx) => {
      await this.lock(tx);
      const last = await tx.storefrontBlock.findFirst({ where: { status: { not: 'archived' } }, orderBy: { position: 'desc' }, select: { position: true } });
      const block = await tx.storefrontBlock.create({ data: { ...data, position: (last?.position ?? -1) + 1, createdBy: actor, updatedBy: actor } });
      return { result: block, events: [this.event(EventType.StorefrontBlockCreated, actor, block)] };
    });
  }

  async update(id: string, dto: UpdateStorefrontBlockDto, actor: string) {
    const current = await this.requireBlock(id);
    if (current.status !== 'draft') throw new ConflictError('storefront_block_not_draft', 'Редактировать можно только черновик');
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
      return { result: block, events: [this.event(EventType.StorefrontBlockUpdated, actor, block)] };
    });
  }

  publish(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await this.lock(tx);
      const current = await this.requireBlockOnTx(tx, id);
      if (current.status === 'published') return { result: current, events: [] };
      if (!['draft', 'archived'].includes(current.status)) throw new ConflictError('storefront_block_publish_forbidden', 'Сначала отмените расписание блока');
      if (current.type === 'hero') await this.archivePublishedHeroes(tx, current.device, id);
      const block = await tx.storefrontBlock.update({
        where: { id },
        data: { status: 'published', startsAt: null, endsAt: null, publishedAt: new Date(), updatedBy: actor },
      });
      return { result: block, events: [this.event(EventType.StorefrontBlockPublished, actor, block)] };
    });
  }

  schedule(id: string, dto: ScheduleStorefrontBlockDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      await this.lock(tx);
      const current = await this.requireBlockOnTx(tx, id);
      if (!['draft', 'archived'].includes(current.status)) throw new ConflictError('storefront_block_schedule_forbidden', 'Запланировать можно черновик или архивный блок');
      const startsAt = new Date(dto.startsAt);
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
      if (startsAt <= new Date()) throw new ValidationError('storefront_block_start_invalid', 'Начало должно быть в будущем');
      if (endsAt && endsAt <= startsAt) throw new ValidationError('storefront_block_window_invalid', 'Окончание должно быть позже начала');
      if (current.type === 'hero') await this.assertNoHeroScheduleOverlap(tx, current.device, startsAt, endsAt, id);
      const block = await tx.storefrontBlock.update({
        where: { id }, data: { status: 'scheduled', startsAt, endsAt, publishedAt: null, updatedBy: actor },
      });
      return { result: block, events: [this.event(EventType.StorefrontBlockScheduled, actor, block)] };
    });
  }

  archive(id: string, actor: string) {
    return this.changeStatus(id, 'archived', actor, EventType.StorefrontBlockArchived);
  }

  cancelSchedule(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const current = await this.requireBlockOnTx(tx, id);
      if (current.status !== 'scheduled') throw new ConflictError('storefront_block_not_scheduled', 'У блока нет активного расписания');
      const block = await tx.storefrontBlock.update({ where: { id }, data: { status: 'draft', startsAt: null, endsAt: null, updatedBy: actor } });
      return { result: block, events: [this.event(EventType.StorefrontBlockScheduleCancelled, actor, block)] };
    });
  }

  reorder(dto: ReorderStorefrontBlocksDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      await this.lock(tx);
      const rows = await tx.storefrontBlock.findMany({ where: { status: { not: 'archived' } }, select: { id: true } });
      const expected = new Set(rows.map((row) => row.id));
      if (dto.ids.length !== expected.size || dto.ids.some((id) => !expected.has(id))) {
        throw new ValidationError('storefront_block_order_incomplete', 'Порядок должен содержать все неархивные блоки ровно один раз');
      }
      await Promise.all(dto.ids.map((id, index) => tx.storefrontBlock.update({ where: { id }, data: { position: 10_000 + index } })));
      await Promise.all(dto.ids.map((id, index) => tx.storefrontBlock.update({ where: { id }, data: { position: index, updatedBy: actor } })));
      return {
        result: await tx.storefrontBlock.findMany({ where: { id: { in: dto.ids } }, orderBy: { position: 'asc' } }),
        events: [{ type: EventType.StorefrontBlocksReordered, actor, payload: { ids: dto.ids }, refs: dto.ids }],
      };
    });
  }

  private async normalized(dto: CreateStorefrontBlockDto) {
    const title = dto.title.trim();
    if (!title) throw new ValidationError('storefront_block_title_required', 'Введите заголовок блока');
    const productIds = dto.productIds ?? [];
    if (dto.type === 'collection' && productIds.length === 0) throw new ValidationError('storefront_block_products_required', 'Подборка должна содержать товары');
    if (dto.type !== 'collection' && productIds.length > 0) throw new ValidationError('storefront_block_products_forbidden', 'Товары можно прикрепить только к подборке');
    if (productIds.length > 0) {
      const count = await this.prisma.product.count({ where: { id: { in: productIds }, archived: false } });
      if (count !== productIds.length) throw new ValidationError('storefront_block_product_invalid', 'Подборка содержит отсутствующий или архивный товар');
    }
    const ctaHref = optional(dto.ctaHref);
    if (ctaHref && !ctaHref.startsWith('/') && !isHttps(ctaHref)) throw new ValidationError('storefront_block_cta_invalid', 'Ссылка должна начинаться с / или https://');
    const imageUrl = optional(dto.imageUrl);
    if (imageUrl && !isHttps(imageUrl)) throw new ValidationError('storefront_block_image_invalid', 'Изображение должно использовать HTTPS');
    const eyebrow = optional(dto.eyebrow);
    const body = optional(dto.body);
    const ctaLabel = optional(dto.ctaLabel);
    // Screen the human-readable banner copy before persisting (URLs are validated above,
    // not moderated). Runs pre-transaction in both create and update. ModerationService
    // never throws — falls back to keyless rules / no-op without a provider key.
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

  private async assertContentClean(parts: (string | null)[]) {
    const text = parts.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).join('\n');
    if (!text) return;
    const verdict = await this.moderation.moderate(text);
    if (!verdict.allowed) {
      throw new ValidationError('storefront_block_flagged', verdict.reason || verdict.categories.join(', '));
    }
  }

  private async assertNoHeroScheduleOverlap(tx: Prisma.TransactionClient, device: StorefrontBlockDevice, startsAt: Date, endsAt: Date | null, excludeId: string) {
    const overlap = await tx.storefrontBlock.findFirst({
      where: {
        id: { not: excludeId }, type: 'hero', status: 'scheduled',
        device: { in: overlappingDevices(device) },
        startsAt: { lt: endsAt ?? new Date('9999-12-31T23:59:59.999Z') },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
      },
      select: { id: true },
    });
    if (overlap) throw new ConflictError('storefront_block_schedule_overlap', 'Для этого устройства уже запланирован главный баннер на пересекающееся время');
  }

  private archivePublishedHeroes(tx: Prisma.TransactionClient, device: StorefrontBlockDevice, excludeId: string) {
    return tx.storefrontBlock.updateMany({
      where: { id: { not: excludeId }, type: 'hero', status: 'published', device: { in: overlappingDevices(device) } },
      data: { status: 'archived' },
    });
  }

  private async changeStatus(id: string, status: StorefrontBlockStatus, actor: string, type: string) {
    const current = await this.requireBlock(id);
    if (current.status === status) return current;
    return this.audit.transaction(async (tx) => {
      const block = await tx.storefrontBlock.update({ where: { id }, data: { status, updatedBy: actor } });
      return { result: block, events: [this.event(type, actor, block)] };
    });
  }

  private requireBlock(id: string) {
    return this.prisma.storefrontBlock.findUnique({ where: { id } }).then((row) => {
      if (!row) throw new ValidationError('storefront_block_not_found', 'Блок витрины не найден');
      return row;
    });
  }

  private async requireBlockOnTx(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.storefrontBlock.findUnique({ where: { id } });
    if (!row) throw new ValidationError('storefront_block_not_found', 'Блок витрины не найден');
    return row;
  }

  private lock(tx: Prisma.TransactionClient) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-blocks'))`;
  }

  private event(type: string, actor: string, block: StorefrontBlock): AuditInput {
    return { type, actor, payload: { blockId: block.id, blockType: block.type, status: block.status, device: block.device, position: block.position }, refs: [block.id] };
  }
}

function optional(value?: string | null) { return value?.trim() || null; }
function isHttps(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
function dateValue(value: Date | null) { return value?.getTime() ?? 0; }
function overlappingDevices(device: StorefrontBlockDevice): StorefrontBlockDevice[] {
  return device === 'all' ? ['all', 'desktop', 'mobile'] : ['all', device];
}
