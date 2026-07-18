import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { CatalogService } from '../catalog/catalog.service';
import { ConflictError, ValidationError } from '../common/errors';
import { ModerationService } from '../ai/moderation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStorefrontContentDto, ScheduleStorefrontContentDto, StorefrontBenefitDto } from './storefront.dto';

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
} as const;

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly moderation: ModerationService,
  ) {}

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

  async createDraft(dto: CreateStorefrontContentDto, actor: string) {
    const normalized = this.normalize(dto);
    await this.assertContentClean(normalized);
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-content-version'))`;
      await this.assertFeaturedProducts(tx, normalized.featuredProductIds);
      const latest = await tx.storefrontContentRevision.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
      const revision = await tx.storefrontContentRevision.create({
        data: { ...normalized, version: (latest?.version ?? 0) + 1, benefits: normalized.benefits as unknown as Prisma.InputJsonValue, createdBy: actor },
      });
      return {
        result: revision,
        events: [{ type: EventType.StorefrontContentDrafted, actor, payload: { revisionId: revision.id, version: revision.version }, refs: [revision.id] }],
      };
    });
  }

  async publish(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-content-publish'))`;
      const revision = await tx.storefrontContentRevision.findUnique({ where: { id } });
      if (!revision) throw new ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
      if (revision.status === 'published') return { result: revision, events: [] };
      if (revision.status !== 'draft') throw new ConflictError('storefront_revision_not_draft', 'Опубликовать можно только черновик');
      await tx.storefrontContentRevision.updateMany({
        where: {
          OR: [
            { status: 'published' },
            { status: 'scheduled', startsAt: { lte: new Date() } },
          ],
        },
        data: { status: 'archived' },
      });
      const published = await tx.storefrontContentRevision.update({
        where: { id },
        data: {
          status: 'published',
          publishedBy: actor,
          publishedAt: new Date(),
          scheduledBy: null,
          startsAt: null,
          endsAt: null,
        },
      });
      return {
        result: published,
        events: [{ type: EventType.StorefrontContentPublished, actor, payload: { revisionId: id, version: published.version }, refs: [id] }],
      };
    });
  }

  async schedule(id: string, dto: ScheduleStorefrontContentDto, actor: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt.getTime() <= Date.now()) {
      throw new ValidationError('storefront_schedule_future_required', 'Начало публикации должно быть в будущем');
    }
    if (endsAt && endsAt <= startsAt) {
      throw new ValidationError('storefront_schedule_range_invalid', 'Окончание должно быть позже начала');
    }
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-content-schedule'))`;
      const revision = await tx.storefrontContentRevision.findUnique({ where: { id } });
      if (!revision) throw new ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
      if (revision.status !== 'draft') throw new ConflictError('storefront_revision_not_draft', 'Запланировать можно только черновик');
      const overlap = await tx.storefrontContentRevision.findFirst({
        where: {
          status: 'scheduled',
          ...(endsAt ? { startsAt: { lt: endsAt } } : {}),
          OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        },
        select: { id: true, version: true },
      });
      if (overlap) {
        throw new ConflictError(
          'storefront_schedule_overlap',
          `Интервал пересекается с запланированной версией v${overlap.version}`,
        );
      }
      const scheduled = await tx.storefrontContentRevision.update({
        where: { id },
        data: { status: 'scheduled', scheduledBy: actor, startsAt, endsAt },
      });
      return {
        result: scheduled,
        events: [{
          type: EventType.StorefrontContentScheduled,
          actor,
          payload: { revisionId: id, version: scheduled.version, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null },
          refs: [id],
        }],
      };
    });
  }

  async cancelSchedule(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-content-schedule'))`;
      const revision = await tx.storefrontContentRevision.findUnique({ where: { id } });
      if (!revision) throw new ValidationError('storefront_revision_not_found', 'Ревизия витрины не найдена');
      if (revision.status !== 'scheduled') throw new ConflictError('storefront_revision_not_scheduled', 'У ревизии нет активного расписания');
      const draft = await tx.storefrontContentRevision.update({
        where: { id },
        data: { status: 'draft', scheduledBy: null, startsAt: null, endsAt: null },
      });
      return {
        result: draft,
        events: [{ type: EventType.StorefrontContentScheduleCancelled, actor, payload: { revisionId: id, version: draft.version }, refs: [id] }],
      };
    });
  }

  private normalize(dto: CreateStorefrontContentDto) {
    const required = (value: string, field: string) => {
      const result = value.trim();
      if (!result) throw new ValidationError('storefront_content_required', `${field} обязательно`);
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

  private async assertFeaturedProducts(tx: Prisma.TransactionClient, ids: string[]) {
    if (ids.length === 0) return;
    const products = await tx.product.findMany({
      where: { id: { in: ids }, archived: false },
      select: { id: true },
    });
    if (products.length !== ids.length) {
      throw new ValidationError('storefront_featured_product_invalid', 'Подборка содержит отсутствующий или архивный товар');
    }
  }

  /**
   * Screen the human-readable draft copy (hero/about/delivery + financing + benefits) for
   * disallowed content before persisting. Runs outside the transaction — the LLM call must
   * not hold a DB tx. Blocks the draft with a clear error when flagged; the moderation
   * service falls back to keyless rules / no-op without a provider key, so this never fails
   * a legitimate draft because the AI API is down.
   */
  private async assertContentClean(content: {
    heroEyebrow: string;
    heroTitle: string;
    heroBody: string;
    heroCtaLabel: string;
    financingText: string | null;
    aboutTitle: string;
    aboutBody: string;
    deliveryTitle: string;
    deliveryBody: string;
    featuredTitle: string;
    benefits: { title: string; body: string }[];
  }): Promise<void> {
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
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join('\n');
    if (!text) return;
    const verdict = await this.moderation.moderate(text);
    if (!verdict.allowed) {
      throw new ValidationError('storefront_content_flagged', verdict.reason || verdict.categories.join(', '));
    }
  }

  private benefit(value: StorefrontBenefitDto) {
    const title = value.title.trim();
    const body = value.body.trim();
    if (!title || !body) throw new ValidationError('storefront_benefit_required', 'Преимущество требует заголовок и описание');
    return { title, body };
  }

  private safeUrl(value: string, field: string) {
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') return url.toString();
    } catch {}
    throw new ValidationError('storefront_url_invalid', `${field}: используйте внутренний путь или HTTPS URL`);
  }

  private publicView(revision: { id: string; version: number; status: string; heroEyebrow: string; heroTitle: string; heroBody: string; heroCtaLabel: string; heroCtaHref: string; heroImageUrl: string | null; financingText: string | null; aboutTitle: string; aboutBody: string; deliveryTitle: string; deliveryBody: string; contactPhone: string | null; supportHours: string | null; benefits: Prisma.JsonValue; featuredTitle: string; featuredProductIds: string[]; publishedAt: Date | null; startsAt: Date | null; endsAt: Date | null }) {
    return {
      ...revision,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      startsAt: revision.startsAt?.toISOString() ?? null,
      endsAt: revision.endsAt?.toISOString() ?? null,
    };
  }
}
