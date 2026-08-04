import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { AuditModule } from '../src/audit/audit.module';
import { CampaignsModule } from '../src/campaigns/campaigns.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Campaign creative moderation (API)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let marketerId: string;
  let token: string;
  const campaignIds: string[] = [];
  const run = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ApprovalsModule,
        CampaignsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);
    const marketer = await staffAuth.createStaff(`campaign-copy-${run}`, 'pass-e2e', 'marketer');
    marketerId = marketer.id;
    token = (await staffAuth.login(marketer.username, 'pass-e2e')).accessToken;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: campaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.staffUser.deleteMany({ where: { id: marketerId } });
    await app.close();
  });

  function draft(headline: string, body?: string) {
    return {
      name: `Creative policy ${run}`,
      channel: 'push',
      budget: 1_000,
      creativeHeadline: headline,
      creativeBody: body,
      creativeCtaLabel: 'Открыть каталог',
      destinationUrl: '/catalog',
    };
  }

  it('rejects flagged create/update copy without mutating a clean draft', async () => {
    const flaggedCreate = await request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send(draft('casino заработок без вложений'))
      .expect(422);
    expect(flaggedCreate.body.code).toBe('campaign_creative_flagged');

    const clean = await request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send(draft('Летняя подборка AliStore', 'Аксессуары для поездок и работы'))
      .expect(201);
    campaignIds.push(clean.body.campaign.id);

    const flaggedUpdate = await request(app.getHttpServer())
      .post(`/campaigns/${clean.body.campaign.id}/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({ creativeBody: 'porn casino fuck' })
      .expect(422);
    expect(flaggedUpdate.body.code).toBe('campaign_creative_flagged');

    const stored = await prisma.campaign.findUniqueOrThrow({ where: { id: clean.body.campaign.id } });
    expect(stored).toMatchObject({
      creativeHeadline: 'Летняя подборка AliStore',
      creativeBody: 'Аксессуары для поездок и работы',
      status: 'draft',
    });
    expect(await prisma.campaign.count({ where: { name: `Creative policy ${run}` } })).toBe(1);
  });
});
