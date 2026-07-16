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
import { StoreOperationsModule } from '../src/store-operations/store-operations.module';

describe('Store Operations checklists and incidents', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let sellerToken: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const point = `STORE-OPS-${run}`;
  const businessDate = '2026-07-17';
  const usernames: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, AuthzModule, StaffAuthModule, StoreOperationsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const session = async (role: 'owner' | 'seller', label: string) => {
      const username = `${role}-store-ops-${label}-${run}`;
      usernames.push(username);
      const staff = await auth.createStaff(username, 'pass', role);
      return { id: staff.id, token: (await auth.login(username, 'pass')).accessToken };
    };
    ownerToken = (await session('owner', 'owner')).token;
    sellerToken = (await session('seller', 'seller')).token;
  });

  afterAll(async () => {
    const checklists = await prisma.storeOperationChecklist.findMany({ where: { point }, include: { items: true } });
    const incidents = await prisma.storeIncident.findMany({ where: { point } });
    const ids = [
      ...checklists.flatMap((item) => [item.id, ...item.items.map((checklistItem) => checklistItem.id)]),
      ...incidents.map((item) => item.id),
    ];
    await prisma.storeOperationCommand.deleteMany({ where: { resourceId: { in: ids } } });
    await prisma.storeOperationChecklist.deleteMany({ where: { point } });
    await prisma.storeIncident.deleteMany({ where: { point } });
    await prisma.auditEvent.deleteMany({ where: { refs: { has: point } } });
    await prisma.staffUser.deleteMany({ where: { username: { in: usernames } } });
    await app.close();
  });

  it('creates a server-owned opening checklist, rejects incomplete close and replays each command', async () => {
    const payload = { point, type: 'opening', businessDate };
    await request(app.getHttpServer()).get(`/store-operations/overview?point=${point}&date=${businessDate}`).expect(401);
    const created = await request(app.getHttpServer()).post('/store-operations/checklists').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-${run}`).send(payload).expect(201);
    expect(created.body).toMatchObject({ point, type: 'opening', status: 'open', startedBy: expect.any(String) });
    expect(created.body.items).toHaveLength(6);
    const replay = await request(app.getHttpServer()).post('/store-operations/checklists').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-${run}`).send(payload).expect(201);
    expect(replay.body.id).toBe(created.body.id);
    await request(app.getHttpServer()).post('/store-operations/checklists').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-${run}`).send({ ...payload, type: 'closing' }).expect(409);

    await request(app.getHttpServer()).post(`/store-operations/checklists/${created.body.id}/complete`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-complete-${run}`).expect(422);
    for (const [index, item] of created.body.items.entries()) {
      const key = `store-checklist-item-${run}-${index}`;
      const checked = await request(app.getHttpServer()).post(`/store-operations/checklists/${created.body.id}/items/${item.code}`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', key).send({ checked: true, note: index === 0 ? 'Проверено утром' : undefined }).expect(201);
      expect(checked.body.checked).toBe(true);
      const itemReplay = await request(app.getHttpServer()).post(`/store-operations/checklists/${created.body.id}/items/${item.code}`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', key).send({ checked: true, note: index === 0 ? 'Проверено утром' : undefined }).expect(201);
      expect(itemReplay.body.id).toBe(checked.body.id);
    }
    const completed = await request(app.getHttpServer()).post(`/store-operations/checklists/${created.body.id}/complete`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-complete-${run}`).expect(201);
    expect(completed.body.status).toBe('completed');
    const completeReplay = await request(app.getHttpServer()).post(`/store-operations/checklists/${created.body.id}/complete`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-complete-${run}`).expect(201);
    expect(completeReplay.body.id).toBe(created.body.id);
    await request(app.getHttpServer()).post(`/store-operations/checklists/${created.body.id}/items/${created.body.items[0].code}`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-checklist-after-${run}`).send({ checked: false }).expect(409);

    const overview = await request(app.getHttpServer()).get(`/store-operations/overview?point=${point}&date=${businessDate}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(overview.body.summary).toMatchObject({ checklists: 1, completedChecklists: 1, openIncidents: 0 });
    expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'store.checklist_' }, refs: { has: created.body.id } } })).toBe(8);
  });

  it('records an incident with role-safe resolution and exact replay', async () => {
    const payload = { point, businessDate, category: 'terminal', severity: 'critical', title: 'Терминал недоступен', description: 'Касса 2 не видит сеть после открытия.' };
    const created = await request(app.getHttpServer()).post('/store-operations/incidents').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-incident-${run}`).send(payload).expect(201);
    const replay = await request(app.getHttpServer()).post('/store-operations/incidents').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-incident-${run}`).send(payload).expect(201);
    expect(replay.body.id).toBe(created.body.id);
    await request(app.getHttpServer()).post(`/store-operations/incidents/${created.body.id}/resolve`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `store-incident-resolve-seller-${run}`).send({ resolution: 'Проверка' }).expect(403);
    const resolved = await request(app.getHttpServer()).post(`/store-operations/incidents/${created.body.id}/resolve`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `store-incident-resolve-${run}`).send({ resolution: 'Терминал заменён, тестовый платёж успешен.' }).expect(201);
    expect(resolved.body).toMatchObject({ status: 'resolved', resolvedBy: expect.any(String) });
    const resolvedReplay = await request(app.getHttpServer()).post(`/store-operations/incidents/${created.body.id}/resolve`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `store-incident-resolve-${run}`).send({ resolution: 'Терминал заменён, тестовый платёж успешен.' }).expect(201);
    expect(resolvedReplay.body.id).toBe(created.body.id);
    const overview = await request(app.getHttpServer()).get(`/store-operations/overview?point=${point}&date=${businessDate}&status=resolved`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(overview.body.incidents).toEqual([expect.objectContaining({ id: created.body.id, severity: 'critical', status: 'resolved' })]);
    expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'store.incident_' }, refs: { has: created.body.id } } })).toBe(2);
  });
});
