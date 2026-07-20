import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { OutboxModule } from '../src/outbox/outbox.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { StaffTasksModule } from '../src/staff-tasks/staff-tasks.module';

/**
 * Доска задач команды.
 *
 * `GET /staff-tasks/mine` жёстко фильтрует по исполнителю, поэтому собрать из
 * него общую доску нельзя — экран «Задачи» в ERP как раз поэтому и рисовал
 * выдуманных сотрудников. Списочный маршрут закрыт правом staff_tasks:manage,
 * которым уже владеют admin и owner: доска показывает чужие задачи и имена,
 * а это не то, что должен видеть продавец.
 */
describe('Staff task board (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let sellerToken: string;
  let sellerId: string;
  let cashierId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        OutboxModule,
        StaffAuthModule,
        StaffTasksModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);

    const session = async (role: 'owner' | 'seller' | 'cashier') => {
      const username = `${role}-board-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const { accessToken } = await staffAuth.login(username, 'pass');
      return { id: staff.id, username, token: accessToken };
    };

    const owner = await session('owner');
    ownerToken = owner.token;
    const seller = await session('seller');
    sellerId = seller.id;
    sellerToken = seller.token;
    const cashier = await session('cashier');
    cashierId = cashier.id;

    await prisma.staffTask.createMany({
      data: [
        { title: `Проверить витрину ${RUN}`, assigneeId: sellerId, createdById: owner.id, status: 'open' },
        { title: `Сверить кассу ${RUN}`, assigneeId: cashierId, createdById: owner.id, status: 'in_progress' },
        { title: `Отменённая ${RUN}`, assigneeId: cashierId, createdById: owner.id, status: 'cancelled' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.staffTask.deleteMany({ where: { title: { contains: String(RUN) } } });
    await app.close();
  });

  it('закрыт от продавца: доска показывает чужие задачи и имена', async () => {
    await request(app.getHttpServer())
      .get('/staff-tasks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
  });

  it('владельцу видны задачи всех исполнителей, кроме отменённых', async () => {
    const res = await request(app.getHttpServer())
      .get('/staff-tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const mine = (res.body as { title: string; assigneeId: string }[]).filter((task) => task.title.includes(String(RUN)));
    expect(mine.map((task) => task.assigneeId).sort()).toEqual([cashierId, sellerId].sort());
    expect(mine.some((task) => task.title.startsWith('Отменённая'))).toBe(false);
  });

  it('фильтрует по статусу и исполнителю', async () => {
    const byStatus = await request(app.getHttpServer())
      .get('/staff-tasks?status=in_progress')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const statuses = new Set((byStatus.body as { status: string }[]).map((task) => task.status));
    expect([...statuses]).toEqual(['in_progress']);

    const byAssignee = await request(app.getHttpServer())
      .get(`/staff-tasks?assigneeId=${sellerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const assignees = new Set((byAssignee.body as { assigneeId: string }[]).map((task) => task.assigneeId));
    expect([...assignees]).toEqual([sellerId]);
  });

  it('отдаёт имя исполнителя, а не голый идентификатор', async () => {
    const res = await request(app.getHttpServer())
      .get(`/staff-tasks?assigneeId=${sellerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const [task] = res.body as { assignee?: { id: string; username: string; role: string } }[];
    expect(task.assignee?.username).toBe(`seller-board-${RUN}`);
    expect(task.assignee?.role).toBe('seller');
  });
});
