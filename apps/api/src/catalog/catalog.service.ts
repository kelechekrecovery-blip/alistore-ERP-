import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../common/errors';
import { bestInstallmentOffer, installmentLadder, type InstallmentPlan } from './installments';
import { loyaltyEarnAmount } from '../customers/loyalty-ledger';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogDeltaQueryDto,
  CatalogDeltaResponseDto,
  CatalogProductDto,
  CatalogReindexResponseDto,
  CatalogSearchQueryDto,
  CatalogSearchResponseDto,
} from './catalog.dto';

type SearchSource = CatalogSearchResponseDto['source'];
type NormalizedQuery = Required<Pick<CatalogSearchQueryDto, 'limit' | 'offset' | 'sort'>> &
  Pick<CatalogSearchQueryDto, 'q' | 'category' | 'stockOnly'>;

type ProductWithStockCount = Prisma.ProductGetPayload<{
  include: {
    _count: {
      select: {
        units: {
          where: {
            status: 'in_stock';
          };
        };
      };
    };
    balances: true;
    supplierOffers: true;
    bundleComponents: {
      include: {
        componentProduct: {
          include: {
            balances: true;
            _count: {
              select: {
                units: { where: { status: 'in_stock' } };
              };
            };
          };
        };
      };
    };
  };
}>;

type ProductIndexDocument = CatalogProductDto & {
  archived: boolean;
};

type MeiliTask = {
  taskUid?: number;
  uid?: number;
  [key: string]: unknown;
};

type MeiliSearchResponse = {
  hits?: Array<{ id?: string | number }>;
  estimatedTotalHits?: number;
  totalHits?: number;
};

type MeiliIndex = {
  search: (query: string, options: Record<string, unknown>) => Promise<MeiliSearchResponse>;
  updateSettings: (settings: Record<string, unknown>) => Promise<MeiliTask>;
  addDocuments: (
    documents: ProductIndexDocument[],
    options?: { primaryKey?: string },
  ) => Promise<MeiliTask>;
};

type MeiliClient = {
  index: (name: string) => MeiliIndex;
};

type MeiliClientConstructor = new (options: {
  host: string;
  apiKey?: string;
}) => MeiliClient;

type MeiliModule = {
  MeiliSearch?: MeiliClientConstructor;
  Meilisearch?: MeiliClientConstructor;
  default?: MeiliClientConstructor;
};

const importMeili = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<MeiliModule>;

@Injectable()
export class CatalogService {
  private meiliClientPromise?: Promise<MeiliClient>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    // Опционально: каталог обязан отвечать и там, где модуль настроек не поднят
    // (узкие тестовые сборки). Без него рассрочка просто не показывается —
    // отсутствие условия честнее выдуманного.
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async search(query: CatalogSearchQueryDto): Promise<CatalogSearchResponseDto> {
    const normalized = this.normalizeQuery(query);

    if (normalized.q && this.meiliHost()) {
      try {
        return await this.searchMeili(normalized);
      } catch {
        return this.searchPostgres(
          normalized,
          'postgres_fallback',
          'meilisearch_unavailable',
        );
      }
    }

    return this.searchPostgres(normalized, 'postgres');
  }

  async delta(query: CatalogDeltaQueryDto): Promise<CatalogDeltaResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 500);
    const since = parseSince(query.since);
    const where: Prisma.ProductWhereInput = since
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
      changed: active.map((product) => this.toCatalogProduct(product)),
      removed,
      totalChanged: active.length,
      totalRemoved: removed.length,
      truncated: products.length > limit,
    };
  }

  async categories(): Promise<Array<{ category: string; count: number }>> {
    const rows = await this.prisma.product.groupBy({
      by: ['category'], where: { archived: false }, orderBy: { category: 'asc' }, _count: { _all: true },
    });
    return rows.map((row) => ({ category: row.category, count: row._count._all }));
  }

  async product(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, archived: false }, include: this.stockCountInclude(),
    });
    if (!product) throw new ValidationError('catalog_product_not_found', `Товар ${id} не найден`);
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
    const enriched = await this.enrichOffers(await this.enrichReviews([product, ...variants, ...related].map((item) => this.toCatalogProduct(item))));
    const [main, ...rest] = enriched;
    return { product: main, variants: rest.slice(0, variants.length), related: rest.slice(variants.length) };
  }

  async curated(ids: string[]): Promise<CatalogProductDto[]> {
    if (ids.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, archived: false },
      include: this.stockCountInclude(),
    });
    const byId = new Map(products.map((product) => [product.id, this.toCatalogProduct(product)]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((product): product is CatalogProductDto => Boolean(product));
    return this.enrichReviews(ordered);
  }

  async reindex(maintenanceToken?: string): Promise<CatalogReindexResponseDto> {
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

  private async searchMeili(
    query: NormalizedQuery,
  ): Promise<CatalogSearchResponseDto> {
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
      .filter((id): id is string => Boolean(id));

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
      .filter((product): product is CatalogProductDto => Boolean(product));

    return {
      source: 'meilisearch',
      total: response.estimatedTotalHits ?? response.totalHits ?? ordered.length,
      limit: query.limit,
      offset: query.offset,
      items: await this.enrichOffers(await this.enrichReviews(ordered)),
    };
  }

  private async searchPostgres(
    query: NormalizedQuery,
    source: SearchSource,
    warning?: string,
  ): Promise<CatalogSearchResponseDto> {
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
        items: await this.enrichOffers(await this.enrichReviews(sorted.slice(query.offset, query.offset + query.limit))),
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
      items: await this.enrichOffers(await this.enrichReviews(products.map((product) => this.toCatalogProduct(product)))),
    };
  }

  private sourceOfTruthWhere(
    query: Pick<CatalogSearchQueryDto, 'q' | 'category' | 'stockOnly'>,
  ): Prisma.ProductWhereInput {
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

  private normalizeQuery(
    query: CatalogSearchQueryDto,
  ): NormalizedQuery {
    return {
      q: query.q?.trim() || undefined,
      category: query.category?.trim() || undefined,
      stockOnly: query.stockOnly ?? false,
      sort: query.sort ?? 'name',
      limit: query.limit ?? 24,
      offset: query.offset ?? 0,
    };
  }

  private toCatalogProduct(product: ProductWithStockCount): CatalogProductDto {
    const availableUnits = product.bundleComponents.length > 0
      ? Math.min(...product.bundleComponents.map((component) =>
          Math.floor(this.directAvailability(component.componentProduct) / component.qty),
        ))
      : this.directAvailability(product);
    const offer = product.supplierOffers.find((candidate) => candidate.active);
    const toOrderCheckoutEnabled =
      this.config.get<string>('TO_ORDER_CHECKOUT_ENABLED')?.trim().toLowerCase() === 'true';
    const marginBps = offer && product.price > 0
      ? Math.floor(((product.price - offer.unitCost) * 10_000) / product.price)
      : -10_000;
    const orderableToOrder =
      product.supplyMode === 'to_order'
      && toOrderCheckoutEnabled
      && Boolean(offer)
      && offer!.validUntil > new Date()
      && offer!.availableQty > 0
      && marginBps >= 1000;
    const availabilityKind = availableUnits > 0
      ? 'in_stock' as const
      : product.supplyMode === 'to_order'
        ? 'to_order' as const
        : 'unavailable' as const;
    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      variantGroup: product.variantGroup,
      name: product.name,
      price: product.price,
      category: product.category,
      trackingMode: product.trackingMode,
      // Политика поставки — публичная: покупатель должен видеть, что товар идёт
      // под заказ и сколько это займёт. supplierId и cost сюда НЕ попадают.
      supplyMode: product.supplyMode,
      supplyLeadDays: product.supplyLeadDays,
      orderable: availableUnits > 0 || orderableToOrder,
      availabilityKind,
      leadTimeDays: product.supplyMode === 'to_order' ? product.supplyLeadDays : null,
      estimatedDeliveryDate:
        product.supplyMode === 'to_order' && product.supplyLeadDays
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

  /**
   * Партнёрские рассрочки владельца: Payda (Оптима Банк), O!Market (O!Bank),
   * ZERO (А Банк), M+. Сроки, потолки и наценка магазина задаются в настройках,
   * потому что это коммерческие условия договора, а не константы кода.
   * Провайдер со сроком 0 выключен — так по умолчанию стоят те, чьи условия
   * не опубликованы: показывать срок, которого мы не знаем, нельзя.
   */
  private async installmentPlans(): Promise<InstallmentPlan[]> {
    const settings = this.settings;
    if (!settings) return [];
    // Ключи выписаны литералами намеренно: `settings-wired.e2e-spec` следит,
    // что каждый объявленный параметр где-то действительно читается, а
    // шаблонная строка эту проверку обходит — мёртвая настройка проползла бы
    // в реестр незамеченной.
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

  /**
   * «от N сом/мес» и бонусы на карточке: обе цифры считает сервер, не вёрстка.
   *
   * Рассрочка — по договорным условиям владельца, бонус — той же функцией,
   * что потом реально начислит заказ. Витрина не имеет права ни придумать
   * финансовое условие, ни пообещать бонус, которого не будет.
   */
  private async enrichOffers(items: CatalogProductDto[]): Promise<CatalogProductDto[]> {
    if (items.length === 0) return items;
    const [plans, earnRateBps] = await Promise.all([
      this.installmentPlans(),
      this.settings ? this.settings.value('loyalty.earn_rate_bps') : Promise.resolve(undefined),
    ]);
    const anyPlan = plans.some((plan) => plan.maxMonths > 0);
    if (!anyPlan && earnRateBps === undefined) return items;
    return items.map((item) => {
      const steps = anyPlan ? installmentLadder(item.price, plans) : [];
      return {
        ...item,
        installment: anyPlan ? bestInstallmentOffer(item.price, plans) : null,
        installmentSteps: steps,
        bonusPoints: earnRateBps === undefined ? undefined : loyaltyEarnAmount(item.price, earnRateBps),
      };
    });
  }

  private async enrichReviews(items: CatalogProductDto[]): Promise<CatalogProductDto[]> {
    if (items.length === 0) return items;
    const rows = await this.prisma.productReview.groupBy({
      by: ['productId'], where: { productId: { in: items.map((item) => item.id) }, status: 'approved' },
      _count: { _all: true }, _avg: { rating: true },
    });
    const summaries = new Map(rows.map((row) => [row.productId, { reviewCount: row._count._all, avgRating: row._avg.rating === null ? null : Math.round(row._avg.rating * 10) / 10 }]));
    return items.map((item) => ({ ...item, ...(summaries.get(item.id) ?? { reviewCount: 0, avgRating: null }) }));
  }

  private orderBy(sort: NormalizedQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    if (sort === 'price_asc') return [{ price: 'asc' }, { name: 'asc' }];
    if (sort === 'price_desc') return [{ price: 'desc' }, { name: 'asc' }];
    return [{ category: 'asc' }, { name: 'asc' }];
  }

  private compareProducts(a: CatalogProductDto, b: CatalogProductDto, sort: NormalizedQuery['sort']) {
    if (sort === 'price_asc') return a.price - b.price || a.name.localeCompare(b.name, 'ru');
    if (sort === 'price_desc') return b.price - a.price || a.name.localeCompare(b.name, 'ru');
    if (sort === 'stock_desc') return b.availableUnits - a.availableUnits || a.name.localeCompare(b.name, 'ru');
    return a.name.localeCompare(b.name, 'ru');
  }

  private stockCountInclude() {
    return {
      _count: {
        select: {
          units: { where: { status: 'in_stock' as const } },
        },
      },
      bundleComponents: {
        orderBy: { componentProductId: 'asc' as const },
        include: {
          componentProduct: {
            include: {
              balances: true,
              _count: {
                select: {
                  units: { where: { status: 'in_stock' as const } },
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

  private directAvailability(product: {
    trackingMode: 'serialized' | 'quantity';
    _count: { units: number };
    balances: Array<{ onHand: number; reserved: number }>;
  }): number {
    if (product.trackingMode === 'serialized') return product._count.units;
    return product.balances.reduce((sum, balance) => sum + balance.onHand - balance.reserved, 0);
  }

  private async requireMeiliClient(): Promise<MeiliClient> {
    const host = this.meiliHost();
    if (!host) {
      throw new ValidationError(
        'meilisearch_not_configured',
        'MEILI_HOST must be configured before using Meilisearch',
      );
    }

    if (!this.meiliClientPromise) {
      const apiKey = this.config.get<string>('MEILI_API_KEY')?.trim();
      this.meiliClientPromise = importMeili('meilisearch').then((module) => {
        const MeiliClient = module.MeiliSearch ?? module.Meilisearch ?? module.default;
        if (!MeiliClient) {
          throw new ValidationError(
            'meilisearch_client_unavailable',
            'The meilisearch package did not expose a supported client constructor',
          );
        }
        return new MeiliClient({ host, apiKey: apiKey || undefined });
      });
    }
    return this.meiliClientPromise;
  }

  private assertMaintenanceToken(token?: string): void {
    const expected = this.config.get<string>('SEARCH_ADMIN_TOKEN')?.trim();
    if (!expected) {
      throw new ForbiddenError(
        'maintenance_token_not_configured',
        'SEARCH_ADMIN_TOKEN must be configured before reindexing catalog search',
      );
    }
    if (token !== expected) {
      throw new ForbiddenError(
        'maintenance_token_invalid',
        'Invalid catalog search maintenance token',
      );
    }
  }

  private meiliHost(): string | undefined {
    return this.config.get<string>('MEILI_HOST')?.trim() || undefined;
  }

  private indexName(): string {
    return this.config.get<string>('MEILI_PRODUCTS_INDEX')?.trim() || 'products';
  }

  private quoteMeiliFilterValue(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
}

function bishkekDatePlusDays(days: number, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bishkek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(
    numberPart('year'),
    numberPart('month') - 1,
    numberPart('day') + days,
  )).toISOString().slice(0, 10);
}

function parseSince(value: string | undefined): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('catalog_delta_cursor_invalid', 'Invalid catalog delta cursor');
  }
  return parsed;
}
