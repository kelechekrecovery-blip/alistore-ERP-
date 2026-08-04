import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { AuthzModule } from '../src/authz/authz.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { StaffTasksModule } from '../src/staff-tasks/staff-tasks.module';

describe('Staff tasks HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: StaffAuthService;
  let adminToken: string;
  let sellerToken: string;
  let foreignToken: string;
  let sellerId: string;
  const run = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, AuthzModule,
      StaffAuthModule, StaffTasksModule,
    ] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(StaffAuthService);
    const session = async (name: string, role: 'admin' | 'seller') => {
      const staff = await auth.createStaff(`${name}-${run}`, 'pass', role);
      return { id: staff.id, token: (await auth.login(staff.username, 'pass')).accessToken };
    };
    const admin = await session('task-admin', 'admin');
    const seller = await session('task-seller', 'seller');
    const foreign = await session('task-foreign', 'seller');
    adminToken = admin.token;
    sellerId = seller.id;
    sellerToken = seller.token;
    foreignToken = foreign.token;
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { template: 'staff_task_created' } });
    await prisma.staffTask.deleteMany({ where: { createdBy: { username: { endsWith: String(run) } } } });
    await prisma.staffUser.deleteMany({ where: { username: { endsWith: String(run) } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany({ where: { template: 'staff_task_created' } });
    await prisma.staffTask.deleteMany({ where: { createdBy: { username: { endsWith: String(run) } } } });
    await prisma.auditEvent.deleteMany({ where: { type: { startsWith: 'staff_task.' } } });
  });

  it('keeps assignment server-owned and records a single completion event', async () => {
    await request(app.getHttpServer()).get('/staff-tasks/mine').expect(401);
    await request(app.getHttpServer()).post('/staff-tasks').set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Spoof', assigneeId: sellerId }).expect(403);

    const created = await request(app.getHttpServer()).post('/staff-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: '  Обновить ценники  ', assigneeId: sellerId, priority: 'high' }).expect(201);
    expect(created.body).toMatchObject({ title: 'Обновить ценники', assigneeId: sellerId, status: 'open' });
    const queued = await prisma.outboxMessage.findMany({ where: { template: 'staff_task_created' } });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ channel: 'push', recipient: sellerId, status: 'pending' });
    expect(queued[0].payload).toMatchObject({ taskId: created.body.id, deepLink: `alistore-staff://tasks/${created.body.id}` });

    const mine = await request(app.getHttpServer()).get('/staff-tasks/mine')
      .set('Authorization', `Bearer ${sellerToken}`).expect(200);
    expect(mine.body).toHaveLength(1);

    await request(app.getHttpServer()).patch(`/staff-tasks/mine/${created.body.id}`)
      .set('Authorization', `Bearer ${foreignToken}`).send({ status: 'completed' }).expect(403);
    await request(app.getHttpServer()).patch(`/staff-tasks/mine/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`).send({ status: 'completed' }).expect(200);
    await request(app.getHttpServer()).patch(`/staff-tasks/mine/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`).send({ status: 'completed' }).expect(409);

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } } });
    expect(events.map((event) => event.type).sort()).toEqual(['staff_task.created', 'staff_task.updated']);
  });

  it('rejects a revoked assignee before reading tasks', async () => {
    await prisma.staffUser.update({ where: { id: sellerId }, data: { active: false } });
    await request(app.getHttpServer()).get('/staff-tasks/mine')
      .set('Authorization', `Bearer ${sellerToken}`).expect(403);
    await prisma.staffUser.update({ where: { id: sellerId }, data: { active: true } });
  });
});
