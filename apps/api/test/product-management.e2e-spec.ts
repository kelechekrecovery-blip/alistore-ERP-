import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { ProductsModule } from '../src/products/products.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { MediaService } from '../src/media/media.service';
import { randomUUID } from 'node:crypto';

describe('Product management API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let adminId: string;
  let ownerToken: string;
  let ownerId: string;
  let sellerToken: string;
  let media: MediaService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ProductsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    media = moduleRef.get(MediaService);

    const createSession = async (role: 'admin' | 'owner' | 'seller') => {
      const username = `${role}-pm-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminId = admin.id;
    adminToken = admin.token;

    const owner = await createSession('owner');
    ownerId = owner.id;
    ownerToken = owner.token;

    sellerToken = (await createSession('seller')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.orderBundleAllocation.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
  });

  async function product(price = 100000) {
    return prisma.product.create({
      data: {
        sku: `PM-${RUN}-${Math.random()}`,
        name: 'Managed Phone',
        price,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
  }

  it('guards staff product CRUD and writes ledger events', async () => {
    await request(app.getHttpServer()).get('/products').expect(401);

    await request(app.getHttpServer())
      .get('/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `ADMIN-CREATE-${RUN}`,
        barcode: `194253${RUN}`,
        variantGroup: `iphone-15-${RUN}`,
        name: 'Admin Created Phone',
        price: 120000,
        cost: 90000,
        category: 'phones',
        attrs: { storage: '256GB' },
      })
      .expect(201);

    expect(created.body).toMatchObject({
      sku: `ADMIN-CREATE-${RUN}`,
      barcode: `194253${RUN}`,
      variantGroup: `iphone-15-${RUN}`,
      name: 'Admin Created Phone',
      price: 120000,
      cost: 90000,
      category: 'phones',
      published: false,
      archived: false,
      availableUnits: 0,
    });

    const listed = await request(app.getHttpServer())
      .get(`/products?q=${encodeURIComponent(`194253${RUN}`)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0].sku).toBe(`ADMIN-CREATE-${RUN}`);
    expect(listed.body.items[0]).toMatchObject({
      barcode: `194253${RUN}`,
      variantGroup: `iphone-15-${RUN}`,
    });

    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `DUPLICATE-BARCODE-${RUN}`,
        barcode: `194253${RUN}`,
        name: 'Duplicate Barcode Phone',
        price: 120000,
        cost: 90000,
        category: 'phones',
      })
      .expect(409);

    const updated = await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Admin Updated Phone',
        barcode: `194254${RUN}`,
        variantGroup: `iphone-15-pro-${RUN}`,
        price: 10,
        cost: 88000,
        category: 'premium phones',
        attrs: { storage: '256GB', description: 'Витринная карточка' },
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'Admin Updated Phone',
      barcode: `194254${RUN}`,
      variantGroup: `iphone-15-pro-${RUN}`,
      price: 120000,
      cost: 88000,
      category: 'premium phones',
      attrs: { storage: '256GB', description: 'Витринная карточка' },
    });

    await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ name: 'Seller should not edit' })
      .expect(403);

    const events = await prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual([
      'product.created',
      'product.updated',
      'product.cost_changed',
    ]);
    expect(events.every((event) => event.actor === adminId)).toBe(true);

    // Cost feeds the POS margin floor, so the ledger must carry the movement
    // itself — «product.updated» only lists which keys changed.
    const costEvent = events.find((event) => event.type === 'product.cost_changed');
    expect(costEvent?.payload).toMatchObject({ from: 90000, to: 88000 });
  });

  it('does not emit a cost event when the cost is unchanged', async () => {
    const created = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `SKU-COST-STABLE-${RUN}`,
        name: 'Stable cost phone',
        price: 100000,
        cost: 70000,
        category: 'phones',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed only', cost: 70000 })
      .expect(200);

    const types = (await prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } })).map((e) => e.type);
    expect(types).not.toContain('product.cost_changed');
  });

  it('publishes a draft only after an approved product image is present', async () => {
    const created = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `MEDIA-GATE-${RUN}`,
        name: 'Media-gated phone',
        price: 100000,
        cost: 70000,
        category: 'phones',
        attrs: {},
      })
      .expect(201);

    expect(created.body.published).toBe(false);
    await request(app.getHttpServer())
      .get(`/products/${created.body.id}/reviews`)
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('product_not_found'));
    await request(app.getHttpServer())
      .post(`/products/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('product_media_required'));

    const image = await media.ingestImage(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="#f65" d="M0 0h2v2H0z"/></svg>'),
    );
    await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attrs: { imageUrl: image.url, imageKey: image.key } })
      .expect(200);

    const published = await request(app.getHttpServer())
      .post(`/products/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(published.body).toMatchObject({ id: created.body.id, published: true });

    await request(app.getHttpServer())
      .post(`/products/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.published).toBe(true));

    await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attrs: {} })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('product_media_required'));

    await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attrs: { imageKey: `media/${randomUUID()}.webp`, imageUrl: 'https://external.example/broken.webp' } })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('product_media_not_found'));

    const canonical = await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attrs: { imageKey: image.key, imageUrl: 'https://external.example/tracker.webp' } })
      .expect(200);
    expect(canonical.body.attrs).toMatchObject({ imageKey: image.key, imageUrl: image.url, image: image.url });
  });

  it('keeps dangerous price and archive actions in the approval flow', async () => {
    const p = await product();

    const price = await request(app.getHttpServer())
      .patch(`/products/${p.id}/price`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 140000, reason: 'supplier increase', requester: 'spoof' })
      .expect(200);

    expect(price.body).toHaveProperty('approvalId');
    await expect(prisma.product.findUniqueOrThrow({ where: { id: p.id } }))
      .resolves.toMatchObject({ price: 100000, archived: false });

    const priceApproval = await prisma.approval.findFirst({ where: { action: 'price' } });
    expect(priceApproval?.requester).toBe(adminId);

    await request(app.getHttpServer())
      .delete(`/products/${p.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'legacy sku', requester: 'spoof' })
      .expect(202);

    await expect(prisma.product.findUniqueOrThrow({ where: { id: p.id } }))
      .resolves.toMatchObject({ archived: false });

    const deleteApproval = await prisma.approval.findFirst({ where: { action: 'delete' } });
    expect(deleteApproval?.requester).toBe(ownerId);
  });
});
