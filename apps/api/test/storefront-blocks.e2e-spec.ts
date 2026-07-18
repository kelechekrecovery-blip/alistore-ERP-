import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { CatalogModule } from '../src/catalog/catalog.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { StorefrontBlocksModule } from '../src/storefront-blocks/storefront-blocks.module';

describe('Storefront blocks CMS', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let marketerToken: string;
  let sellerToken: string;
  const run = `BLOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, CatalogModule, StorefrontBlocksModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const marketer = await auth.createStaff(`block-marketer-${run}`, 'pass', 'marketer');
    marketerToken = (await auth.login(marketer.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`block-seller-${run}`, 'pass', 'seller');
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await prisma.storefrontBlock.deleteMany();
    await prisma.product.deleteMany({ where: { sku: { startsWith: run } } });
  });

  const auth = (token = marketerToken) => ({ Authorization: `Bearer ${token}` });
  const http = {
    post: (path: string) => request(app.getHttpServer()).post(path).set('Connection', 'close'),
    get: (path: string) => request(app.getHttpServer()).get(path).set('Connection', 'close'),
  };
  const block = (suffix: string, extra: Record<string, unknown> = {}) => ({
    type: 'promo', device: 'all', title: `${run}-${suffix}`, body: 'Server-managed block', tone: 'coral', ctaLabel: 'Открыть', ctaHref: '/catalog', ...extra,
  });

  it('enforces RBAC, asset/product invariants and publishes device-scoped blocks with Ledger events', async () => {
    await http.post('/storefront-blocks').set(auth(sellerToken)).send(block('DENIED')).expect(403);
    const invalid = await http.post('/storefront-blocks').set(auth()).send(block('BAD', { imageUrl: 'http://unsafe.example/banner.jpg' })).expect(422);
    expect(invalid.body.code).toBe('storefront_block_image_invalid');

    const product = await prisma.product.create({ data: { sku: `${run}-SKU`, name: 'CMS phone', price: 12000, cost: 9000, category: 'phones', attrs: {} } });
    const collection = await http.post('/storefront-blocks').set(auth()).send(block('COLLECTION', { type: 'collection', device: 'desktop', productIds: [product.id], ctaHref: '/catalog?category=phones' })).expect(201);
    const hero = await http.post('/storefront-blocks').set(auth()).send(block('HERO', { type: 'hero', device: 'desktop', imageUrl: 'https://media.example/banner.jpg' })).expect(201);
    await http.post(`/storefront-blocks/${collection.body.id}/publish`).set(auth()).send({}).expect(201);
    await http.post(`/storefront-blocks/${hero.body.id}/publish`).set(auth()).send({}).expect(201);

    const desktop = await http.get('/storefront-blocks/public?device=desktop').expect(200);
    expect(desktop.body.map((item: { id: string }) => item.id)).toEqual([collection.body.id, hero.body.id]);
    expect(desktop.body[0].products).toContainEqual(expect.objectContaining({ id: product.id, sku: product.sku }));
    const mobile = await http.get('/storefront-blocks/public?device=mobile').expect(200);
    expect(mobile.body).toEqual([]);

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: hero.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['storefront.block_created', 'storefront.block_published']);
  });

  it('prevents overlapping hero schedules, reorders all live blocks and archives without stale publication', async () => {
    const first = await http.post('/storefront-blocks').set(auth()).send(block('SCHEDULE-A', { type: 'hero', device: 'desktop' })).expect(201);
    const second = await http.post('/storefront-blocks').set(auth()).send(block('SCHEDULE-B', { type: 'hero', device: 'all' })).expect(201);
    const promo = await http.post('/storefront-blocks').set(auth()).send(block('PROMO')).expect(201);
    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 7_200_000).toISOString();
    await http.post(`/storefront-blocks/${first.body.id}/schedule`).set(auth()).send({ startsAt, endsAt }).expect(201);
    const overlap = await http.post(`/storefront-blocks/${second.body.id}/schedule`).set(auth()).send({ startsAt: new Date(Date.now() + 5_400_000).toISOString(), endsAt: new Date(Date.now() + 9_000_000).toISOString() }).expect(409);
    expect(overlap.body.code).toBe('storefront_block_schedule_overlap');

    await http.post('/storefront-blocks/reorder').set(auth()).send({ ids: [promo.body.id, second.body.id, first.body.id] }).expect(201);
    const rows = await http.get('/storefront-blocks').set(auth()).expect(200);
    expect(rows.body.filter((item: { title: string }) => item.title.startsWith(run)).map((item: { id: string }) => item.id)).toEqual([promo.body.id, second.body.id, first.body.id]);
    await http.post(`/storefront-blocks/${first.body.id}/cancel-schedule`).set(auth()).send({}).expect(201);
    await http.post(`/storefront-blocks/${promo.body.id}/publish`).set(auth()).send({}).expect(201);
    await http.post(`/storefront-blocks/${promo.body.id}/archive`).set(auth()).send({}).expect(201);
    const publicRows = await http.get('/storefront-blocks/public?device=desktop').expect(200);
    expect(publicRows.body).toEqual([]);
    expect(await prisma.auditEvent.count({ where: { type: 'storefront.blocks_reordered', refs: { has: promo.body.id } } })).toBe(1);
  });

  it('rejects flagged banner copy on create and update', async () => {
    const flagged = await http.post('/storefront-blocks')
      .set(auth())
      .send(block('FLAG', { title: `${run} fuck shit` }))
      .expect(422);
    expect(flagged.body.code).toBe('storefront_block_flagged');

    const clean = await http.post('/storefront-blocks').set(auth()).send(block('CLEAN')).expect(201);
    const badUpdate = await http.post(`/storefront-blocks/${clean.body.id}/update`)
      .set(auth())
      .send({ body: 'porn casino заработок' })
      .expect(422);
    expect(badUpdate.body.code).toBe('storefront_block_flagged');
  });
});
