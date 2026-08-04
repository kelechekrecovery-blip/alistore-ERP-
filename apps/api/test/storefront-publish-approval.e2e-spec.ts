import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { StorefrontModule } from '../src/storefront/storefront.module';

/**
 * `storefront:publish` is held by marketer, and publishing went live in one
 * transaction: the previous revision is archived and the public, unauthenticated
 * GET /storefront/content serves the new one on the very next request. One
 * marketer, one POST, new homepage — with no second pair of eyes anywhere.
 *
 * Publishing now parks a `storefront_publish` approval (the campaign_budget
 * template: marketer-initiated, four-eyes, no money moved at approval time) and
 * only the approver's decision makes it public.
 */
describe('Storefront publish is four-eyes gated', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let marketerToken: string;
  let ownerId: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const usernames: string[] = [];
  const revisionIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, ApprovalsModule, StorefrontModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    approvals = moduleRef.get(ApprovalsService);
    const auth = moduleRef.get(StaffAuthService);
    const make = async (role: 'marketer' | 'owner') => {
      const username = `${role}-sfpub-${run}`;
      usernames.push(username);
      const staff = await auth.createStaff(username, 'pass', role);
      return { id: staff.id, token: (await auth.login(username, 'pass')).accessToken };
    };
    marketerToken = (await make('marketer')).token;
    ownerId = (await make('owner')).id;
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { requester: { in: usernames } } });
    await prisma.approval.deleteMany({ where: { action: 'storefront_publish' } });
    await prisma.storefrontContentRevision.deleteMany({ where: { id: { in: revisionIds } } });
    await prisma.staffUser.deleteMany({ where: { username: { in: usernames } } });
    await app.close();
  });

  async function draft() {
    const max = await prisma.storefrontContentRevision.aggregate({ _max: { version: true } });
    const revision = await prisma.storefrontContentRevision.create({
      data: {
        version: (max._max.version ?? 0) + 1,
        status: 'draft',
        heroEyebrow: 'e', heroTitle: `hero-${run}`, heroBody: 'b', heroCtaLabel: 'c', heroCtaHref: '/catalog',
        aboutTitle: 'a', aboutBody: 'ab', deliveryTitle: 'd', deliveryBody: 'db',
        benefits: [],
        createdBy: 'test',
      },
    });
    revisionIds.push(revision.id);
    return revision;
  }

  it('parks an approval instead of going live immediately', async () => {
    const revision = await draft();
    const res = await request(app.getHttpServer())
      .post(`/storefront/revisions/${revision.id}/publish`)
      .set('Authorization', `Bearer ${marketerToken}`)
      .expect(202);

    expect(res.body).toMatchObject({ status: 'requested', action: 'storefront_publish' });
    expect(res.body.approvalId).toEqual(expect.any(String));

    // Still a draft — nothing reached the public storefront.
    const after = await prisma.storefrontContentRevision.findUniqueOrThrow({ where: { id: revision.id } });
    expect(after.status).toBe('draft');
    expect(after.publishedAt).toBeNull();
  });

  it('publishes only once an approver decides, and rejection leaves the draft', async () => {
    const approved = await draft();
    const parked = await request(app.getHttpServer())
      .post(`/storefront/revisions/${approved.id}/publish`)
      .set('Authorization', `Bearer ${marketerToken}`).expect(202);

    await approvals.decide(parked.body.approvalId, { status: 'approved', approver: ownerId, approverRole: 'owner' });
    expect((await prisma.storefrontContentRevision.findUniqueOrThrow({ where: { id: approved.id } })).status).toBe('published');

    const rejected = await draft();
    const parkedReject = await request(app.getHttpServer())
      .post(`/storefront/revisions/${rejected.id}/publish`)
      .set('Authorization', `Bearer ${marketerToken}`).expect(202);
    await approvals.decide(parkedReject.body.approvalId, { status: 'rejected', approver: ownerId, approverRole: 'owner', reason: 'не согласовано' });
    expect((await prisma.storefrontContentRevision.findUniqueOrThrow({ where: { id: rejected.id } })).status).toBe('draft');
  });

  it('lets the marketer see the status of their own request', async () => {
    const revision = await draft();
    const parked = await request(app.getHttpServer())
      .post(`/storefront/revisions/${revision.id}/publish`)
      .set('Authorization', `Bearer ${marketerToken}`).expect(202);

    const list = await request(app.getHttpServer())
      .get('/approvals?status=requested')
      .set('Authorization', `Bearer ${marketerToken}`)
      .expect(200);
    expect((list.body as Array<{ id: string }>).some((row) => row.id === parked.body.approvalId)).toBe(true);
  });
});
