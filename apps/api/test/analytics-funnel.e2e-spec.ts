import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditModule } from '../src/audit/audit.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { AnalyticsModule } from '../src/analytics/analytics.module';
import { ReportsModule } from '../src/reports/reports.module';

/**
 * Client analytics funnel (integration, real Postgres).
 *
 * The storefront must report what shoppers do before they buy — product views
 * and add-to-cart — so campaign ROI is measured against real conversions instead
 * of guessed. These events are first-party but deliberately land in their OWN
 * table (`AnalyticsEvent`), never in the Event Ledger (`AuditEvent`): the ledger
 * is the money/stock/status spine (Invariant #10) that reports read as truth, and
 * high-volume marketing telemetry has no business bloating it.
 *
 * Ingestion is public (a browser posts it, no staff token) and throttled; reading
 * the funnel is owner-gated (`reports:read`).
 */
describe('Analytics funnel (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  const run = `af-${Math.floor(Math.random() * 1_000_000)}`;
  const session = `sess-${run}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        AnalyticsModule,
        ReportsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);
    await staffAuth.createStaff(`owner-${run}`, 'pass', 'owner');
    ownerToken = (await staffAuth.login(`owner-${run}`, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.analyticsEvent.deleteMany({ where: { sessionId: session } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: `owner-${run}` } } });
    await app.close();
  });

  function track(type: string, extra: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/analytics/events')
      .send({ type, sessionId: session, ...extra });
  }

  it('records public funnel events with their attribution source, without a staff token', async () => {
    await track('product_view', { productId: 'p-1', source: 'meta' }).expect(201);
    await track('product_view', { productId: 'p-2', source: 'meta' }).expect(201);
    await track('add_to_cart', { productId: 'p-1', source: 'meta' }).expect(201);
    await track('checkout_started').expect(201); // no source → «(direct)» in the funnel

    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId: session } });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.type))).toEqual(
      new Set(['product_view', 'add_to_cart', 'checkout_started']),
    );
    expect(rows.filter((r) => r.source === 'meta')).toHaveLength(3);
  });

  it('rejects an unknown event type before writing anything', async () => {
    await track('please_drop_tables').expect(422);
    const rows = await prisma.analyticsEvent.findMany({ where: { sessionId: session, type: 'please_drop_tables' } });
    expect(rows).toHaveLength(0);
  });

  it('serves owner the funnel counts for a period', async () => {
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/reports/funnel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.productViews).toBe(2);
    expect(res.body.addToCarts).toBe(1);
    expect(res.body.checkoutsStarted).toBe(1);
    // Per-source breakdown: the campaign drove the views/cart, the checkout was direct.
    expect(res.body.bySource.meta).toMatchObject({ productViews: 2, addToCarts: 1, checkoutsStarted: 0 });
    expect(res.body.bySource['(direct)']).toMatchObject({ checkoutsStarted: 1 });
  });

  it('refuses the funnel to a request without a token', async () => {
    await request(app.getHttpServer()).get('/reports/funnel').expect(401);
  });
});
