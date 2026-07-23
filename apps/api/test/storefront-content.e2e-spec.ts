import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { StorefrontModule } from '../src/storefront/storefront.module';

describe('Storefront CMS publication', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let marketerToken: string;
  let sellerToken: string;
  let approvals: ApprovalsService;
  let staffAuth: StaffAuthService;
  const ownerIds: string[] = [];
  const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, ApprovalsModule, StorefrontModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    approvals = moduleRef.get(ApprovalsService);
    staffAuth = moduleRef.get(StaffAuthService);
    const auth = staffAuth;
    const marketer = await auth.createStaff(`storefront-marketer-${run}`, 'pass', 'marketer');
    marketerToken = (await auth.login(marketer.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`storefront-seller-${run}`, 'pass', 'seller');
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { action: 'storefront_publish' } });
    await prisma.staffUser.deleteMany({ where: { id: { in: ownerIds } } });
    await app.close();
  });
  beforeEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { type: { in: ['storefront.content_drafted', 'storefront.content_published', 'storefront.content_scheduled', 'storefront.content_schedule_cancelled'] } } });
    await prisma.storefrontContentRevision.deleteMany();
    await prisma.storePoint.deleteMany({ where: { code: { startsWith: `CMS-${run}` } } });
    const productIds = (await prisma.product.findMany({
      where: { sku: { startsWith: `CMS-${run}` } },
      select: { id: true },
    })).map((product) => product.id);
    await prisma.productReview.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.deviceUnit.deleteMany({ where: { product: { sku: { startsWith: `CMS-${run}` } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `CMS-${run}` } } });
  });

  const body = (featuredProductIds: string[] = []) => ({
    heroEyebrow: 'Проверено CMS', heroTitle: 'Точный заголовок', heroBody: 'Только подтверждённый контент.',
    heroCtaLabel: 'Каталог', heroCtaHref: '/catalog', heroImageUrl: 'https://media.example.com/hero.webp',
    aboutTitle: 'О компании', aboutBody: 'Фактическое описание.', deliveryTitle: 'Получение', deliveryBody: 'Условия подтверждаются при checkout.',
    contactPhone: '+996 700 000 000', supportHours: '10:00–19:00', benefits: [{ title: 'Остатки', body: 'Из складской системы' }],
    featuredTitle: 'Выбор редакции', featuredProductIds,
  });


  /**
   * Publishing is four-eyes gated (STOREFRONT-PUBLISH): the marketer parks an
   * approval and an owner's decision makes it public.
   */
  async function publishViaApproval(revisionId: string) {
    const parked = await request(app.getHttpServer())
      .post(`/storefront/revisions/${revisionId}/publish`)
      .set('Authorization', `Bearer ${marketerToken}`).send({}).expect(202);
    const owner = await staffAuth.createStaff(`owner-sf-${Math.floor(Math.random() * 1_000_000)}`, 'pass', 'owner');
    ownerIds.push(owner.id);
    await approvals.decide(parked.body.approvalId, { status: 'approved', approver: owner.id, approverRole: 'owner' });
  }

  it('keeps drafts private, publishes one revision, exposes active points and writes the ledger', async () => {
    await prisma.storePoint.create({ data: { code: `CMS-${run}-1`, name: 'AliStore Test', address: 'Тестовый адрес', inventoryLocation: `CMS-${run}-LOC`, hours: '10:00–20:00', active: true, sortOrder: 1, createdBy: 'test', idempotencyKey: `CMS-${run}-KEY` } });
    const first = await prisma.product.create({ data: { sku: `CMS-${run}-1`, name: 'Первый товар подборки', price: 1000, cost: 800, category: 'CMS', attrs: {} } });
    const second = await prisma.product.create({ data: { sku: `CMS-${run}-2`, name: 'Второй товар подборки', price: 2000, cost: 1500, category: 'CMS', attrs: {} } });
    const fallback = await request(app.getHttpServer()).get('/storefront/content').expect(200);
    expect(fallback.body.content.id).toBe('fallback');

    await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${sellerToken}`).send(body([second.id, first.id])).expect(403);
    const draft = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send(body([second.id, first.id])).expect(201);
    expect(draft.body.status).toBe('draft');
    expect((await request(app.getHttpServer()).get('/storefront/content')).body.content.id).toBe('fallback');

    await publishViaApproval(draft.body.id);
    const published = await request(app.getHttpServer()).get('/storefront/content').expect(200);
    expect(published.body.content).toMatchObject({ id: draft.body.id, heroTitle: body().heroTitle, heroImageUrl: body().heroImageUrl, featuredTitle: 'Выбор редакции' });
    expect(published.body.featuredProducts.map((product: { id: string }) => product.id)).toEqual([second.id, first.id]);
    expect(published.body.stores).toContainEqual(expect.objectContaining({ name: 'AliStore Test', hours: '10:00–20:00' }));
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: draft.body.id } }, orderBy: { ts: 'asc' } });
    // publish_approved ties the revision to the approval that released it — the
    // drafter and the approver are now two different people on the record.
    expect(events.map((event) => event.type)).toEqual(['storefront.content_drafted', 'storefront.content_published', 'storefront.publish_approved']);
  });

  it('rejects non-HTTPS external media', async () => {
    await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send({ ...body(), heroImageUrl: 'http://unsafe.example/hero.png' }).expect(422);
  });

  it('activates and expires a scheduled collection without exposing it early', async () => {
    const product = await prisma.product.create({ data: { sku: `CMS-${run}-SCHEDULED`, name: 'Товар по расписанию', price: 3000, cost: 2000, category: 'CMS', attrs: {} } });
    const baseline = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send(body()).expect(201);
    await publishViaApproval(baseline.body.id);
    const candidate = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send({ ...body([product.id]), heroTitle: 'Запланированная витрина' }).expect(201);
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const endsAt = new Date(Date.now() + 120_000).toISOString();
    await request(app.getHttpServer()).post(`/storefront/revisions/${candidate.body.id}/schedule`).set('Authorization', `Bearer ${marketerToken}`).send({ startsAt, endsAt }).expect(201);
    expect((await request(app.getHttpServer()).get('/storefront/content')).body.content.id).toBe(baseline.body.id);

    await prisma.storefrontContentRevision.update({ where: { id: candidate.body.id }, data: { startsAt: new Date(Date.now() - 1000) } });
    const active = await request(app.getHttpServer()).get('/storefront/content').expect(200);
    expect(active.body.content).toMatchObject({ id: candidate.body.id, heroTitle: 'Запланированная витрина' });
    expect(active.body.featuredProducts.map((item: { id: string }) => item.id)).toEqual([product.id]);

    await prisma.storefrontContentRevision.update({ where: { id: candidate.body.id }, data: { endsAt: new Date(Date.now() - 1) } });
    expect((await request(app.getHttpServer()).get('/storefront/content')).body.content.id).toBe(baseline.body.id);
    const cancelled = await request(app.getHttpServer()).post(`/storefront/revisions/${candidate.body.id}/cancel-schedule`).set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    expect(cancelled.body.status).toBe('draft');
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: candidate.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['storefront.content_drafted', 'storefront.content_scheduled', 'storefront.content_schedule_cancelled']);
  });

  it('rejects invalid collection products and past schedules', async () => {
    await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send(body(['missing-product'])).expect(422);
    const draft = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send(body()).expect(201);
    await request(app.getHttpServer()).post(`/storefront/revisions/${draft.body.id}/schedule`).set('Authorization', `Bearer ${marketerToken}`).send({ startsAt: new Date(Date.now() - 60_000).toISOString() }).expect(422);
  });

  it('rejects overlapping publication schedules', async () => {
    const first = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send(body()).expect(201);
    const second = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send({ ...body(), heroTitle: 'Вторая кампания' }).expect(201);
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const endsAt = new Date(Date.now() + 180_000).toISOString();
    await request(app.getHttpServer()).post(`/storefront/revisions/${first.body.id}/schedule`).set('Authorization', `Bearer ${marketerToken}`).send({ startsAt, endsAt }).expect(201);
    const conflict = await request(app.getHttpServer()).post(`/storefront/revisions/${second.body.id}/schedule`).set('Authorization', `Bearer ${marketerToken}`).send({ startsAt: new Date(Date.now() + 120_000).toISOString(), endsAt: new Date(Date.now() + 240_000).toISOString() }).expect(409);
    expect(conflict.body.code).toBe('storefront_schedule_overlap');
  });
});
