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
import { randomUUID } from 'node:crypto';

/**
 * F-03 — payroll 500 из-за формата actor в `Payment.receivedBy`.
 *
 * POS-платёж пишет `receivedBy = "staff:<id>"` (payments.controller.ts:113), а
 * покупательский — `receivedBy = "<customerId>"` (payForCustomer). `soldBy()`
 * отдавал оба сырыми; `hr.service` добавлял их в набор staffId и строил
 * `HrPayrollLine.staffId` (FK → StaffUser.id). Префикс `staff:` и id покупателя
 * не резолвятся в StaffUser → FK-violation → 500 на `POST /hr/payroll/runs`, а в
 * preview рисуется призрачная строка `staff:<id>`.
 *
 * Ожидание после фикса: `staff:<id>` нормализуется к `<id>` и сливается со
 * строкой реального продавца (выручка учитывается ему, а не призраку); id
 * покупателя как продавец отбрасывается (комиссия не уходит призраку); post
 * проходит без 500.
 */
describe('F-03: payroll устойчив к формату receivedBy', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let sellerId: string;
  let customerId: string;
  const run = `${Date.now().toString(36)}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const point = `HR-F03-${run}`;
  const period = '2026-07';
  let pointId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, HrModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const storePoint = await prisma.storePoint.create({
      data: {
        code: `hr-f03-${run}`,
        name: 'HR F03 fixture',
        address: 'Test address',
        inventoryLocation: point,
        hours: '10:00–20:00',
        createdBy: 'hr-payroll-test',
        idempotencyKey: `hr-payroll-point-${run}`,
      },
    });
    pointId = storePoint.id;
    const auth = moduleRef.get(StaffAuthService);
    ownerToken = (await auth.login(
      (await auth.createStaff(`owner-f03-${run}`, 'pass', 'owner', point)).username,
      'pass',
    )).accessToken;
    const seller = await auth.createStaff(`seller-f03-${run}`, 'pass', 'seller', point);
    sellerId = seller.id;
    const customer = await prisma.customer.create({
      data: { phone: `+99670F03${run}`.slice(0, 15), name: 'F03 customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.hrPayrollLine.deleteMany({ where: { run: { point } } });
    await prisma.hrPayrollRun.deleteMany({ where: { point } });
    await prisma.hrPayrollCommand.deleteMany();
    await prisma.payment.deleteMany({ where: { point } });
    await prisma.hrAttendance.deleteMany({ where: { schedule: { point } } });
    await prisma.hrSchedule.deleteMany({ where: { point } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.staffUser.deleteMany({ where: { id: sellerId } });
    await prisma.staffUser.deleteMany({ where: { username: `owner-f03-${run}` } });
    if (pointId) await prisma.storePoint.deleteMany({ where: { id: pointId } });
    await app.close();
  });

  it('нормализует staff:<id>, отбрасывает id покупателя, не падает на post', async () => {
    // Реальный продавец: одна смена в периоде, отработана.
    const schedule = await prisma.hrSchedule.create({
      data: {
        idempotencyKey: `${point}:sched`, createdBy: 'test',
        staffId: sellerId, point, shiftDate: new Date('2026-07-15'),
        startsAt: new Date('2026-07-15T03:00:00.000Z'),
        endsAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    });
    await prisma.hrAttendance.create({
      data: {
        scheduleId: schedule.id, staffId: sellerId, point, checkInKey: `${point}:in`,
        checkedInAt: new Date('2026-07-15T03:00:00.000Z'),
        checkedOutAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    });
    // POS-платёж: receivedBy в формате actor — принадлежит реальному продавцу.
    await prisma.payment.create({
      data: {
        point, amount: 100_000, method: 'cash', status: 'received',
        receivedBy: `staff:${sellerId}`, createdAt: new Date('2026-07-15T08:00:00.000Z'),
      },
    });
    // Покупательский платёж: receivedBy = id покупателя, не сотрудник.
    await prisma.payment.create({
      data: {
        point, amount: 50_000, method: 'card', status: 'received',
        receivedBy: customerId, createdAt: new Date('2026-07-15T09:00:00.000Z'),
      },
    });

    const preview = await request(app.getHttpServer())
      .get(`/hr/payroll/preview?period=${period}&point=${point}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    // Ровно одна строка — реального продавца. Ни `staff:<id>`, ни id покупателя.
    expect(preview.body.lines).toHaveLength(1);
    expect(preview.body.lines[0].staffId).toBe(sellerId);
    // Выручка POS-платежа учтена продавцу (а не потеряна на призраке).
    expect(preview.body.lines[0].revenue).toBe(100_000);
    const ids = preview.body.lines.map((l: { staffId: string }) => l.staffId);
    expect(ids).not.toContain(`staff:${sellerId}`);
    expect(ids).not.toContain(customerId);

    // Главное: post не падает FK-violation → 500.
    const posted = await request(app.getHttpServer())
      .post('/hr/payroll/runs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `hr-f03-${run}`)
      .send({ period, point })
      .expect(201);
    expect(posted.body.lines.every((l: { staffId: string }) => l.staffId === sellerId)).toBe(true);
  });
});
