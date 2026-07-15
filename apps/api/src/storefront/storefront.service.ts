import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStorefrontContentDto, StorefrontBenefitDto } from './storefront.dto';

const FALLBACK_CONTENT = {
  id: 'fallback',
  version: 0,
  status: 'published',
  heroEyebrow: 'AliStore',
  heroTitle: 'Техника из актуального каталога',
  heroBody: 'Цены и наличие обновляются из складской системы. Выберите товар и доступный способ получения.',
  heroCtaLabel: 'Открыть каталог',
  heroCtaHref: '/catalog',
  heroImageUrl: null,
  financingText: null,
  aboutTitle: 'О AliStore',
  aboutBody: 'AliStore объединяет интернет-магазин, склад, сервис и торговую точку в одной системе. На сайте публикуются только товары и условия, подтверждённые операционными данными.',
  deliveryTitle: 'Доставка и получение',
  deliveryBody: 'Доступные точки, зоны, стоимость и интервалы показываются при оформлении заказа. Итоговые условия подтверждает сервер до оплаты.',
  contactPhone: null,
  supportHours: null,
  benefits: [
    { title: 'Актуальное наличие', body: 'Остаток поступает из складской системы' },
    { title: 'Прозрачное оформление', body: 'Цена и доставка подтверждаются до оплаты' },
  ],
  publishedAt: null,
} as const;

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async publicContent() {
    const [revision, stores] = await Promise.all([
      this.prisma.storefrontContentRevision.findFirst({
        where: { status: 'published' },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
      }),
      this.prisma.storePoint.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, address: true, hours: true },
      }),
    ]);
    return { content: revision ? this.publicView(revision) : FALLBACK_CONTENT, stores };
  }

  list() {
    return this.prisma.storefrontContentRevision.findMany({ orderBy: { version: 'desc' }, take: 20 });
  }

  async createDraft(dto: CreateStorefrontContentDto, actor: string) {
    const normalized = this.normalize(dto);
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storefront-content-version'))`;
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
      await tx.storefrontContentRevision.updateMany({ where: { status: 'published' }, data: { status: 'archived' } });
      const published = await tx.storefrontContentRevision.update({
        where: { id }, data: { status: 'published', publishedBy: actor, publishedAt: new Date() },
      });
      return {
        result: published,
        events: [{ type: EventType.StorefrontContentPublished, actor, payload: { revisionId: id, version: published.version }, refs: [id] }],
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
    };
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

  private publicView(revision: { id: string; version: number; status: string; heroEyebrow: string; heroTitle: string; heroBody: string; heroCtaLabel: string; heroCtaHref: string; heroImageUrl: string | null; financingText: string | null; aboutTitle: string; aboutBody: string; deliveryTitle: string; deliveryBody: string; contactPhone: string | null; supportHours: string | null; benefits: Prisma.JsonValue; publishedAt: Date | null }) {
    return { ...revision, publishedAt: revision.publishedAt?.toISOString() ?? null };
  }
}
