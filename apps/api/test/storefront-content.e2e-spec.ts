import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { StorefrontModule } from '../src/storefront/storefront.module';

describe('Storefront CMS publication', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let marketerToken: string;
  let sellerToken: string;
  const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, StorefrontModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const marketer = await auth.createStaff(`storefront-marketer-${run}`, 'pass', 'marketer');
    marketerToken = (await auth.login(marketer.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`storefront-seller-${run}`, 'pass', 'seller');
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => { await app.close(); });
  beforeEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { type: { in: ['storefront.content_drafted', 'storefront.content_published'] } } });
    await prisma.storefrontContentRevision.deleteMany();
    await prisma.storePoint.deleteMany({ where: { code: { startsWith: `CMS-${run}` } } });
  });

  const body = {
    heroEyebrow: 'Проверено CMS', heroTitle: 'Точный заголовок', heroBody: 'Только подтверждённый контент.',
    heroCtaLabel: 'Каталог', heroCtaHref: '/catalog', heroImageUrl: 'https://media.example.com/hero.webp',
    aboutTitle: 'О компании', aboutBody: 'Фактическое описание.', deliveryTitle: 'Получение', deliveryBody: 'Условия подтверждаются при checkout.',
    contactPhone: '+996 700 000 000', supportHours: '10:00–19:00', benefits: [{ title: 'Остатки', body: 'Из складской системы' }],
  };

  it('keeps drafts private, publishes one revision, exposes active points and writes the ledger', async () => {
    await prisma.storePoint.create({ data: { code: `CMS-${run}-1`, name: 'AliStore Test', address: 'Тестовый адрес', inventoryLocation: `CMS-${run}-LOC`, hours: '10:00–20:00', active: true, sortOrder: 1, createdBy: 'test', idempotencyKey: `CMS-${run}-KEY` } });
    const fallback = await request(app.getHttpServer()).get('/storefront/content').expect(200);
    expect(fallback.body.content.id).toBe('fallback');

    await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${sellerToken}`).send(body).expect(403);
    const draft = await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send(body).expect(201);
    expect(draft.body.status).toBe('draft');
    expect((await request(app.getHttpServer()).get('/storefront/content')).body.content.id).toBe('fallback');

    await request(app.getHttpServer()).post(`/storefront/revisions/${draft.body.id}/publish`).set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    const published = await request(app.getHttpServer()).get('/storefront/content').expect(200);
    expect(published.body.content).toMatchObject({ id: draft.body.id, heroTitle: body.heroTitle, heroImageUrl: body.heroImageUrl });
    expect(published.body.stores).toContainEqual(expect.objectContaining({ name: 'AliStore Test', hours: '10:00–20:00' }));
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: draft.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['storefront.content_drafted', 'storefront.content_published']);
  });

  it('rejects non-HTTPS external media', async () => {
    await request(app.getHttpServer()).post('/storefront/revisions').set('Authorization', `Bearer ${marketerToken}`).send({ ...body, heroImageUrl: 'http://unsafe.example/hero.png' }).expect(422);
  });
});
