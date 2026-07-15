import { ProductsService } from '../src/products/products.service';
import { StorefrontService } from '../src/storefront/storefront.service';
import { EventType } from '../src/audit/event-types';
import { ValidationError } from '../src/common/errors';
import type { ModerationResult } from '../src/ai/moderation';

type Verdict = (text: string) => Promise<ModerationResult>;
const allow: Verdict = async () => ({ allowed: true, categories: [], reason: '', source: 'rules' });
const block: Verdict = async () => ({ allowed: false, categories: ['profanity'], reason: 'мат', source: 'rules' });

/** Wire a ProductsService with in-memory prisma/audit and a stub moderation verdict. */
function makeProducts(moderate: Verdict) {
  const events: { type: string; actor: string; payload: Record<string, unknown> }[] = [];
  const tx = {
    productReview: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'rev1', ...data })) },
  };
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', sku: 'SKU1', archived: false }) },
    order: { findFirst: jest.fn().mockResolvedValue({ id: 'o1', customer: { name: 'Иван', phone: '+996700000000' } }) },
    productReview: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const audit = {
    transaction: jest.fn(async (work: (t: unknown) => Promise<{ result: unknown; events: typeof events }>) => {
      const out = await work(tx);
      events.push(...out.events);
      return out.result;
    }),
  };
  const moderation = { moderate: jest.fn(moderate) };
  const service = new ProductsService(prisma as never, audit as never, {} as never, moderation as never);
  return { service, tx, events, moderation };
}

const user = { typ: 'customer', customerId: 'c1' } as never;

describe('createReview AI moderation', () => {
  it('auto-rejects a flagged review and emits ProductReviewRejected', async () => {
    const { service, tx, events, moderation } = makeProducts(block);
    await service.createReview('p1', user, { rating: 1, text: 'это fuck полный shit' } as never);

    expect(moderation.moderate).toHaveBeenCalledTimes(1);
    const created = tx.productReview.create.mock.calls[0][0].data;
    expect(created.status).toBe('rejected');
    expect(created.moderatedBy).toBe('ai');
    expect(created.moderationReason).toBe('мат');
    expect(events.map((e) => e.type)).toEqual([EventType.ProductReviewSubmitted, EventType.ProductReviewRejected]);
    expect(events[1].actor).toBe('ai');
  });

  it('leaves a clean review pending for the human queue', async () => {
    const { service, tx, events } = makeProducts(allow);
    await service.createReview('p1', user, { rating: 5, text: 'Отличный телефон' } as never);

    const created = tx.productReview.create.mock.calls[0][0].data;
    expect(created.status).toBe('pending');
    expect(created.moderatedBy).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual([EventType.ProductReviewSubmitted]);
  });

  it('skips moderation entirely for a rating-only review (no text)', async () => {
    const { service, tx, moderation } = makeProducts(block);
    await service.createReview('p1', user, { rating: 4 } as never);

    expect(moderation.moderate).not.toHaveBeenCalled();
    expect(tx.productReview.create.mock.calls[0][0].data.status).toBe('pending');
  });
});

/** A complete, valid storefront draft dto — normalize() must pass so moderation is reached. */
const draftDto = {
  heroEyebrow: 'AliStore',
  heroTitle: 'Заголовок',
  heroBody: 'Описание',
  heroCtaLabel: 'Каталог',
  heroCtaHref: '/catalog',
  aboutTitle: 'О нас',
  aboutBody: 'Текст о компании',
  deliveryTitle: 'Доставка',
  deliveryBody: 'Условия доставки',
  featuredTitle: 'Подборка',
  featuredProductIds: [] as string[],
  benefits: [{ title: 'Плюс', body: 'Описание плюса' }],
};

function makeStorefront(moderate: Verdict) {
  const tx = {
    $executeRaw: jest.fn(),
    storefrontContentRevision: {
      findFirst: jest.fn().mockResolvedValue({ version: 0 }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'sc1', ...data })),
    },
    product: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = {
    transaction: jest.fn(async (work: (t: unknown) => Promise<{ result: unknown; events: unknown[] }>) => (await work(tx)).result),
  };
  const moderation = { moderate: jest.fn(moderate) };
  const service = new StorefrontService({} as never, audit as never, {} as never, moderation as never);
  return { service, audit, moderation };
}

describe('createDraft AI moderation', () => {
  it('blocks a flagged draft with a ValidationError before the transaction', async () => {
    const { service, audit } = makeStorefront(block);
    await expect(
      service.createDraft({ ...draftDto, heroBody: 'fuck this shit' } as never, 'staff1'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(audit.transaction).not.toHaveBeenCalled();
  });

  it('persists a clean draft', async () => {
    const { service, audit, moderation } = makeStorefront(allow);
    const revision = await service.createDraft(draftDto as never, 'staff1');
    expect(moderation.moderate).toHaveBeenCalledTimes(1);
    expect(audit.transaction).toHaveBeenCalledTimes(1);
    expect((revision as { version: number }).version).toBe(1);
  });
});
