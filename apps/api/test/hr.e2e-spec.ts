import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { HrModule } from '../src/hr/hr.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('HR schedules, attendance and absence (integration + RBAC)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let sellerToken: string;
  let secondSellerToken: string;
  let sellerId: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const weekStart = '2026-07-13';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, HrModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const session = async (role: 'owner' | 'seller', suffix: string) => {
      const username = `${role}-hr-${suffix}-${run}`;
      const staff = await auth.createStaff(username, 'pass', role);
      return { id: staff.id, token: (await auth.login(username, 'pass')).accessToken };
    };
    ownerToken = (await session('owner', 'owner')).token;
    const seller = await session('seller', 'primary');
    sellerId = seller.id;
    sellerToken = seller.token;
    secondSellerToken = (await session('seller', 'foreign')).token;
  });

  beforeEach(async () => {
    await prisma.hrAttendance.deleteMany();
    await prisma.hrScheduleCommand.deleteMany();
    await prisma.hrSchedule.deleteMany();
    await prisma.hrAbsence.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { type: { startsWith: 'hr.' } } });
  });

  afterAll(async () => {
    await prisma.hrAttendance.deleteMany();
    await prisma.hrScheduleCommand.deleteMany();
    await prisma.hrSchedule.deleteMany();
    await prisma.hrAbsence.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { contains: `-hr-` } } });
    await app.close();
  });

  it('runs owner schedule → self attendance → derived timesheet with ownership and idempotency', async () => {
    const payload = {
      staffId: sellerId,
      point: 'BISHKEK-1',
      shiftDate: '2026-07-15',
      startsAt: '2026-07-15T03:00:00.000Z',
      endsAt: '2026-07-15T15:00:00.000Z',
    };
    await request(app.getHttpServer()).post('/hr/schedules').send(payload).expect(401);
    await request(app.getHttpServer()).post('/hr/schedules').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-plan-${run}`).send(payload).expect(403);
    const created = await request(app.getHttpServer()).post('/hr/schedules').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-plan-${run}`).send(payload).expect(201);
    const replay = await request(app.getHttpServer()).post('/hr/schedules').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-plan-${run}`).send(payload).expect(201);
    expect(replay.body.id).toBe(created.body.id);

    await request(app.getHttpServer()).get(`/hr/week?weekStart=${weekStart}`).set('Authorization', `Bearer ${sellerToken}`).expect(403);
    const mine = await request(app.getHttpServer()).get(`/hr/me/week?weekStart=${weekStart}`).set('Authorization', `Bearer ${sellerToken}`).expect(200);
    expect(mine.body.schedules).toHaveLength(1);
    expect(mine.body.staff).toHaveLength(1);

    await request(app.getHttpServer()).post('/hr/me/attendance/open').set('Authorization', `Bearer ${secondSellerToken}`).set('Idempotency-Key', `hr-open-foreign-${run}`).send({ scheduleId: created.body.id }).expect(403);
    const opened = await request(app.getHttpServer()).post('/hr/me/attendance/open').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-open-${run}`).send({ scheduleId: created.body.id }).expect(201);
    await request(app.getHttpServer()).post('/hr/me/attendance/open').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-open-${run}`).send({ scheduleId: created.body.id }).expect(201);
    const closed = await request(app.getHttpServer()).post('/hr/me/attendance/close').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-close-${run}`).send({ scheduleId: created.body.id }).expect(201);
    expect(closed.body.id).toBe(opened.body.id);

    await prisma.hrAttendance.update({ where: { id: opened.body.id }, data: { checkedInAt: new Date('2026-07-15T03:12:00.000Z'), checkedOutAt: new Date('2026-07-15T15:25:00.000Z') } });
    const report = await request(app.getHttpServer()).get(`/hr/week?weekStart=${weekStart}&point=BISHKEK-1`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(report.body.timesheet.find((row: { staffId: string }) => row.staffId === sellerId)).toMatchObject({ shifts: 1, minutes: 733, lateMinutes: 12, overtimeMinutes: 25 });
    expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'hr.' }, refs: { has: sellerId } } })).toBe(3);
  });

  it('lets staff request absence and owner decide, then blocks a conflicting schedule', async () => {
    const absence = await request(app.getHttpServer()).post('/hr/me/absences').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-absence-${run}`).send({ type: 'annual_leave', startsOn: '2026-07-16', endsOn: '2026-07-17', reason: 'Семейные обстоятельства' }).expect(201);
    expect(absence.body).toMatchObject({ staffId: sellerId, status: 'requested' });
    await request(app.getHttpServer()).post(`/hr/absences/${absence.body.id}/decide`).set('Authorization', `Bearer ${sellerToken}`).send({ status: 'approved' }).expect(403);
    const approved = await request(app.getHttpServer()).post(`/hr/absences/${absence.body.id}/decide`).set('Authorization', `Bearer ${ownerToken}`).send({ status: 'approved' }).expect(201);
    expect(approved.body.status).toBe('approved');

    await request(app.getHttpServer()).post('/hr/schedules').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-plan-absence-${run}`).send({ staffId: sellerId, point: 'BISHKEK-1', shiftDate: '2026-07-16', startsAt: '2026-07-16T03:00:00.000Z', endsAt: '2026-07-16T15:00:00.000Z' }).expect(409);
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: absence.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['hr.absence_requested', 'hr.absence_approved']);
  });

  it('lets owner edit or cancel an unstarted plan with replay protection', async () => {
    const created = await request(app.getHttpServer()).post('/hr/schedules').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-edit-plan-${run}`).send({
      staffId: sellerId, point: 'BISHKEK-1', shiftDate: '2026-07-14', startsAt: '2026-07-14T03:00:00.000Z', endsAt: '2026-07-14T15:00:00.000Z',
    }).expect(201);
    const update = { point: 'BISHKEK-2', shiftDate: '2026-07-14', startsAt: '2026-07-14T04:00:00.000Z', endsAt: '2026-07-14T14:00:00.000Z' };
    await request(app.getHttpServer()).patch(`/hr/schedules/${created.body.id}`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-edit-${run}`).send(update).expect(403);
    const edited = await request(app.getHttpServer()).patch(`/hr/schedules/${created.body.id}`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-edit-${run}`).send(update).expect(200);
    const replay = await request(app.getHttpServer()).patch(`/hr/schedules/${created.body.id}`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-edit-${run}`).send(update).expect(200);
    expect(edited.body).toMatchObject({ point: 'BISHKEK-2', startsAt: update.startsAt, cancelledAt: null });
    expect(replay.body.id).toBe(created.body.id);

    const cancelled = await request(app.getHttpServer()).post(`/hr/schedules/${created.body.id}/cancel`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-cancel-${run}`).send({ reason: 'Изменение загрузки' }).expect(201);
    await request(app.getHttpServer()).post(`/hr/schedules/${created.body.id}/cancel`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `hr-cancel-${run}`).send({ reason: 'Изменение загрузки' }).expect(201);
    expect(cancelled.body).toMatchObject({ cancelReason: 'Изменение загрузки' });
    await request(app.getHttpServer()).post('/hr/me/attendance/open').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `hr-open-cancelled-${run}`).send({ scheduleId: created.body.id }).expect(409);
    expect(await prisma.hrScheduleCommand.count({ where: { scheduleId: created.body.id } })).toBe(2);
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['hr.schedule_created', 'hr.schedule_updated', 'hr.schedule_cancelled']);
  });
});
