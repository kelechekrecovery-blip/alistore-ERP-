import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ServiceCenterModule } from '../src/service-center/service-center.module';
import { ServiceSlaService } from '../src/service-center/service-sla.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { EvidenceModule } from '../src/evidence/evidence.module';

describe('Service loaner custody (integration + ownership)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let ownerToken: string;
  let ownerId: string;
  let sellerToken: string;
  let foreignServiceToken: string;
  let localServiceToken: string;
  let adminToken: string;
  let sla: ServiceSlaService;
  const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        EvidenceModule,
        StaffAuthModule,
        ServiceCenterModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    sla = moduleRef.get(ServiceSlaService);
    const auth = moduleRef.get(StaffAuthService);
    const owner = await auth.createStaff(`owner-loaner-${run}`, 'pass', 'owner');
    ownerId = owner.id;
    await prisma.staffUser.update({ where: { id: owner.id }, data: { point: 'BISHKEK-2' } });
    ownerToken = (await auth.login(owner.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`seller-loaner-${run}`, 'pass', 'seller');
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
    const foreignService = await auth.createStaff(`service-loaner-${run}`, 'pass', 'service', 'BISHKEK-1');
    foreignServiceToken = (await auth.login(foreignService.username, 'pass')).accessToken;
    const localService = await auth.createStaff(`service-local-loaner-${run}`, 'pass', 'service', 'BISHKEK-2');
    localServiceToken = (await auth.login(localService.username, 'pass')).accessToken;
    const admin = await auth.createStaff(`admin-loaner-${run}`, 'pass', 'admin', 'BISHKEK-1');
    adminToken = (await auth.login(admin.username, 'pass')).accessToken;
  });

  afterEach(async () => {
    await prisma.outboxMessage.deleteMany({ where: { template: 'service_loaner_overdue' } });
    await prisma.serviceWorkOrderCommand.deleteMany({ where: { workOrder: { warrantyCase: { imei: { startsWith: `LOAN-${run}` } } } } });
    await prisma.loanerLoan.deleteMany({ where: { customerId: { startsWith: `loan-customer-${run}` } } });
    await prisma.loanerDevice.deleteMany({ where: { unit: { imei: { startsWith: `LOAN-${run}` } } } });
    await prisma.serviceWorkOrder.deleteMany({ where: { warrantyCase: { imei: { startsWith: `LOAN-${run}` } } } });
    await prisma.warrantyCase.deleteMany({ where: { imei: { startsWith: `LOAN-${run}` } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ type: { startsWith: 'service.loaner_' } }, { refs: { hasSome: [`loan-customer-${run}-1`, `loan-customer-${run}-2`] } }] } });
    await prisma.deviceUnit.deleteMany({ where: { imei: { startsWith: `LOAN-${run}` } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `LOAN-${run}` } } });
    await prisma.customer.deleteMany({ where: { id: { startsWith: `loan-customer-${run}` } } });
  });

  afterAll(async () => {
    await prisma.staffUser.deleteMany({ where: { username: { contains: `-loaner-${run}` } } });
    await app.close();
  });

  async function fixture(suffix: string) {
    const customer = await prisma.customer.create({ data: { id: `loan-customer-${run}-${suffix}`, phone: `+99655${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, name: 'Loaner Customer' } });
    const product = await prisma.product.create({ data: { sku: `LOAN-${run}-${suffix}`, name: 'iPhone 15 Loaner', price: 70000, cost: 50000, category: 'phones', attrs: {} } });
    const repairImei = `LOAN-${run}-${suffix}-REPAIR`;
    const loanerImei = `LOAN-${run}-${suffix}-DEVICE`;
    await prisma.deviceUnit.create({ data: { imei: repairImei, productId: product.id, status: 'in_repair', location: 'BISHKEK-2' } });
    await prisma.deviceUnit.create({ data: { imei: loanerImei, productId: product.id, status: 'in_stock', location: 'BISHKEK-2' } });
    const warrantyCase = await prisma.warrantyCase.create({ data: { imei: repairImei, customerId: customer.id, problem: 'Не включается', status: 'received', sla: new Date(Date.now() + 86400000) } });
    const workOrder = await prisma.serviceWorkOrder.create({ data: { warrantyCaseId: warrantyCase.id, technicianId: ownerId, createdBy: ownerId, point: 'BISHKEK-2' } });
    const token = jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });
    return { customer, workOrder, loanerImei, token };
  }

  async function evidence(loanId: string, label: 'loaner_issue' | 'loaner_return') {
    await prisma.auditEvent.create({ data: { type: 'evidence.attached', actor: `staff:${ownerId}`, refs: [loanId, `${loanId}-${label}.jpg`], payload: { entityType: 'loaner', entityId: loanId, label, trustedStaffEvidence: true, asset: { key: `${loanId}-${label}.jpg` } } } });
  }

  it('keeps IMEI, custody, evidence, ownership, overdue and repair close consistent', async () => {
    const { customer, workOrder, loanerImei, token } = await fixture('1');
    await request(app.getHttpServer()).post('/service-center/loaners/register').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `register-${run}`).send({ imei: loanerImei, condition: 'Без повреждений' }).expect(403);
    const registered = await request(app.getHttpServer()).post('/service-center/loaners/register').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `register-${run}`).send({ imei: loanerImei, condition: 'Без повреждений' }).expect(201);
    expect(registered.body.unit.status).toBe('loaner_available');
    await request(app.getHttpServer()).post('/service-center/loaners/register').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `register-${run}`).send({ imei: loanerImei, condition: 'Другое состояние' }).expect(409);
    const replay = await request(app.getHttpServer()).post('/service-center/loaners/register').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `register-${run}`).send({ imei: loanerImei, condition: 'Без повреждений' }).expect(201);
    expect(replay.body.id).toBe(registered.body.id);
    await request(app.getHttpServer()).post('/service-center/loaners/register').set('Authorization', `Bearer ${foreignServiceToken}`).set('Idempotency-Key', `register-${run}`).send({ imei: loanerImei, condition: 'Без повреждений' }).expect(403);

    const prepared = await request(app.getHttpServer()).post(`/service-center/work-orders/${workOrder.id}/loaner/prepare`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `prepare-${run}`).send({ loanerDeviceId: registered.body.id, dueAt: new Date(Date.now() + 86400000).toISOString(), issueCondition: 'Комплект с кабелем', depositAmount: 5000, agreementRef: 'LN-001' }).expect(201);
    expect(prepared.body).toMatchObject({ customerId: customer.id, status: 'prepared', depositAmount: 5000 });
    await request(app.getHttpServer()).post('/evidence/images').set('Authorization', `Bearer ${token}`).attach('file', Buffer.from('not-an-image'), 'loaner.jpg').field('entityType', 'loaner').field('entityId', prepared.body.id).field('label', 'loaner_issue').expect(403);
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${prepared.body.id}/issue`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `issue-${run}`).send({}).expect(409);
    await prisma.auditEvent.create({ data: { type: 'evidence.attached', actor: customer.id, refs: [prepared.body.id], payload: { entityType: 'loaner', entityId: prepared.body.id, label: 'loaner_issue', asset: { key: 'untrusted.jpg' } } } });
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${prepared.body.id}/issue`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `issue-${run}-untrusted`).send({}).expect(409);
    await evidence(prepared.body.id, 'loaner_issue');
    const issued = await request(app.getHttpServer()).post(`/service-center/loaner-loans/${prepared.body.id}/issue`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `issue-${run}-ok`).send({}).expect(201);
    expect(issued.body.status).toBe('issued');
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${prepared.body.id}/issue`).set('Authorization', `Bearer ${foreignServiceToken}`).set('Idempotency-Key', `issue-${run}-ok`).send({}).expect(409);
    expect((await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: loanerImei } })).status).toBe('loaner_issued');

    const mine = await request(app.getHttpServer()).get('/service-center/me/loaners').set('Authorization', `Bearer ${token}`).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(prepared.body.id);
    const stranger = await fixture('2');
    const strangerMine = await request(app.getHttpServer()).get('/service-center/me/loaners').set('Authorization', `Bearer ${stranger.token}`).expect(200);
    expect(strangerMine.body).toHaveLength(0);
    const secondDevice = await request(app.getHttpServer()).post('/service-center/loaners/register').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `register-cancel-${run}`).send({ imei: stranger.loanerImei, condition: 'Резервное устройство' }).expect(201);
    const cancellable = await request(app.getHttpServer()).post(`/service-center/work-orders/${stranger.workOrder.id}/loaner/prepare`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `prepare-cancel-${run}`).send({ loanerDeviceId: secondDevice.body.id, dueAt: new Date(Date.now() + 86400000).toISOString(), issueCondition: 'Без повреждений' }).expect(201);
    const cancelled = await request(app.getHttpServer()).post(`/service-center/loaner-loans/${cancellable.body.id}/cancel`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `cancel-${run}`).send({}).expect(201);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', returnedAt: null });

    await prisma.loanerLoan.update({ where: { id: prepared.body.id }, data: { dueAt: new Date(Date.now() - 1000) } });
    expect(await sla.escalateOverdueLoaners()).toEqual({ escalated: 1 });
    expect(await sla.escalateOverdueLoaners()).toEqual({ escalated: 0 });
    expect((await prisma.loanerLoan.findUniqueOrThrow({ where: { id: prepared.body.id } })).status).toBe('overdue');

    await prisma.warrantyCase.update({ where: { id: prepared.body.workOrder.warrantyCase.id }, data: { status: 'repaired' } });
    await request(app.getHttpServer()).post(`/service-center/work-orders/${workOrder.id}/close`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `close-blocked-${run}`).send({}).expect(409);
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${prepared.body.id}/return`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `return-${run}`).send({ returnCondition: 'Исправно' }).expect(409);
    await evidence(prepared.body.id, 'loaner_return');
    const returned = await request(app.getHttpServer()).post(`/service-center/loaner-loans/${prepared.body.id}/return`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `return-${run}-ok`).send({ returnCondition: 'Исправно' }).expect(201);
    expect(returned.body.status).toBe('returned');
    expect((await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: loanerImei } })).status).toBe('loaner_available');

    const damagePrepared = await request(app.getHttpServer()).post(`/service-center/work-orders/${stranger.workOrder.id}/loaner/prepare`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `prepare-damage-${run}`).send({ loanerDeviceId: secondDevice.body.id, dueAt: new Date(Date.now() + 86400000).toISOString(), issueCondition: 'Без повреждений' }).expect(201);
    await evidence(damagePrepared.body.id, 'loaner_issue');
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${damagePrepared.body.id}/issue`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `issue-damage-${run}`).send({}).expect(201);
    await evidence(damagePrepared.body.id, 'loaner_return');
    const disputed = await request(app.getHttpServer()).post(`/service-center/loaner-loans/${damagePrepared.body.id}/return`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `return-damage-${run}`).send({ returnCondition: 'Царапина', damageNote: 'Царапина на рамке' }).expect(201);
    expect(disputed.body.status).toBe('disputed');
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${damagePrepared.body.id}/resolve-dispute`).set('Authorization', `Bearer ${localServiceToken}`).set('Idempotency-Key', `resolve-service-writeoff-${run}`).send({ disposition: 'written_off' }).expect(403);
    await request(app.getHttpServer()).post(`/service-center/loaner-loans/${damagePrepared.body.id}/resolve-dispute`).set('Authorization', `Bearer ${adminToken}`).set('Idempotency-Key', `resolve-admin-writeoff-${run}`).send({ disposition: 'written_off' }).expect(403);
    const resolveRequest = () => request(app.getHttpServer()).post(`/service-center/loaner-loans/${damagePrepared.body.id}/resolve-dispute`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `resolve-damage-${run}`).send({ disposition: 'available' });
    const resolved = await Promise.all([resolveRequest(), resolveRequest()]);
    expect(resolved.map((response) => response.status)).toEqual([201, 201]);
    expect(resolved[0].body.status).toBe('returned');
    expect((await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: stranger.loanerImei } })).status).toBe('loaner_available');
    await request(app.getHttpServer()).post(`/service-center/work-orders/${workOrder.id}/close`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `close-ok-${run}`).send({}).expect(201);
  }, 60_000);
});
