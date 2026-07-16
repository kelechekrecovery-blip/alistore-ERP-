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

describe('Service Center diagnostics and estimate (integration + RBAC)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let ownerToken: string;
  let ownerId: string;
  let sellerToken: string;
  let sellerId: string;
  let cashierToken: string;
  let cashierId: string;
  let technicianToken: string;
  let technicianId: string;
  let foreignTechnicianToken: string;
  let serviceSla: ServiceSlaService;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ServiceCenterModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    const auth = moduleRef.get(StaffAuthService);
    serviceSla = moduleRef.get(ServiceSlaService);
    const owner = await auth.createStaff(`owner-service-${run}`, 'pass', 'owner');
    ownerId = owner.id;
    await prisma.staffUser.update({ where: { id: owner.id }, data: { point: 'BISHKEK-2' } });
    ownerToken = (await auth.login(owner.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`seller-service-${run}`, 'pass', 'seller');
    sellerId = seller.id;
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
    const cashier = await auth.createStaff(`cashier-service-${run}`, 'pass', 'cashier');
    cashierId = cashier.id;
    cashierToken = (await auth.login(cashier.username, 'pass')).accessToken;
    const technician = await auth.createStaff(`technician-service-${run}`, 'pass', 'technician');
    technicianId = technician.id;
    await prisma.staffUser.update({ where: { id: technician.id }, data: { point: 'BISHKEK-2' } });
    technicianToken = (await auth.login(technician.username, 'pass')).accessToken;
    const foreignTechnician = await auth.createStaff(`technician-foreign-service-${run}`, 'pass', 'technician');
    await prisma.staffUser.update({ where: { id: foreignTechnician.id }, data: { point: 'OSH-1' } });
    foreignTechnicianToken = (await auth.login(foreignTechnician.username, 'pass')).accessToken;
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany({ where: { template: 'service_sla_breached' } });
    await prisma.payment.deleteMany({ where: { serviceWorkOrderId: { not: null } } });
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.servicePart.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.$transaction(async (tx) => {
      await tx.accountingJournalLine.deleteMany({ where: { entry: { sourceType: 'service.consumed' } } });
      await tx.accountingJournalEntry.deleteMany({ where: { sourceType: 'service.consumed' } });
    });
    await prisma.inventoryValuationIssue.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.quantityConsignmentLot.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.inventoryMovement.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.inventoryBalance.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ type: { startsWith: 'service.' } }, { type: { startsWith: 'warranty.' } }] } });
    await prisma.warrantyCase.deleteMany();
    await prisma.deviceUnit.deleteMany({ where: { imei: { startsWith: `SERVICE-${run}` } } });
    await prisma.orderItem.deleteMany({ where: { order: { customer: { phone: { startsWith: `+99677${run}` } } } } });
    await prisma.order.deleteMany({ where: { customer: { phone: { startsWith: `+99677${run}` } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `SERVICE-${run}` } } });
    await prisma.customer.deleteMany({ where: { phone: { startsWith: `+99677${run}` } } });
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { template: 'service_sla_breached' } });
    await prisma.payment.deleteMany({ where: { serviceWorkOrderId: { not: null } } });
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.servicePart.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.$transaction(async (tx) => {
      await tx.accountingJournalLine.deleteMany({ where: { entry: { sourceType: 'service.consumed' } } });
      await tx.accountingJournalEntry.deleteMany({ where: { sourceType: 'service.consumed' } });
    });
    await prisma.inventoryValuationIssue.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.quantityConsignmentLot.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.inventoryMovement.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.inventoryBalance.deleteMany({ where: { product: { sku: { startsWith: `SERVICE-${run}` } } } });
    await prisma.warrantyCase.deleteMany({ where: { imei: { startsWith: `SERVICE-${run}` } } });
    await prisma.deviceUnit.deleteMany({ where: { imei: { startsWith: `SERVICE-${run}` } } });
    await prisma.order.deleteMany({ where: { customer: { phone: { startsWith: `+99677${run}` } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `SERVICE-${run}` } } });
    await prisma.customer.deleteMany({ where: { phone: { startsWith: `+99677${run}` } } });
    await prisma.cashShift.deleteMany({ where: { staffId: { in: [sellerId, cashierId] } } });
    await prisma.staffUser.deleteMany({ where: { username: { contains: `-service-${run}` } } });
    await app.close();
  });

  async function fixture(suffix: string) {
    const customer = await prisma.customer.create({
      data: { phone: `+99677${run}${suffix}`, name: `Service Customer ${suffix}` },
    });
    const product = await prisma.product.create({
      data: { sku: `SERVICE-${run}-${suffix}`, name: 'iPhone 15 Pro', price: 100_000, cost: 80_000, category: 'phones', attrs: {} },
    });
    const order = await prisma.order.create({ data: { customerId: customer.id, channel: 'web', total: 100_000, status: 'paid' } });
    const imei = `SERVICE-${run}-${suffix}-IMEI`;
    await prisma.deviceUnit.create({ data: { imei, productId: product.id, status: 'sold', location: 'BISHKEK-1', orderId: order.id } });
    const warrantyCase = await prisma.warrantyCase.create({
      data: { imei, customerId: customer.id, problem: 'Не заряжается', sla: new Date(Date.now() + 86_400_000) },
    });
    return { customer, warrantyCase, product, order, imei };
  }

  const customerToken = (customer: { id: string; phone: string }) =>
    jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });

  it('runs intake → diagnostics → customer approval with replay and Ledger', async () => {
    const { customer, warrantyCase } = await fixture('1');
    await request(app.getHttpServer()).get('/service-center/queue').expect(401);
    await request(app.getHttpServer()).get('/service-center/queue').set('Authorization', `Bearer ${sellerToken}`).expect(403);
    const queue = await request(app.getHttpServer()).get('/service-center/queue').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(queue.body[0]).toMatchObject({ id: warrantyCase.id, productName: 'iPhone 15 Pro', customer: { id: customer.id } });

    const intake = { warrantyCaseId: warrantyCase.id, technicianId: ownerId };
    await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).send(intake).expect(422);
    const created = await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-intake-${run}`).send(intake).expect(201);
    const replayed = await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-intake-${run}`).send(intake).expect(201);
    expect(replayed.body.id).toBe(created.body.id);
    expect(created.body.warrantyCase.status).toBe('received');

    const diagnosis = { summary: 'Износ аккумулятора 71%', estimateAmount: 4500, diagnosticFee: 500 };
    const [diagnosed, diagnosisReplay] = await Promise.all([
      request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/diagnose`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-diagnose-${run}`).send(diagnosis).expect(201),
      request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/diagnose`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-diagnose-${run}`).send(diagnosis).expect(201),
    ]);
    expect(diagnosisReplay.body.id).toBe(diagnosed.body.id);
    expect(diagnosed.body).toMatchObject({ diagnosticSummary: diagnosis.summary, estimateAmount: 4500, diagnosticFee: 500 });
    expect(diagnosed.body.warrantyCase.status).toBe('diagnostics');

    const other = await prisma.customer.create({ data: { phone: `+99677${run}9`, name: 'Foreign Service Customer' } });
    await request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${customerToken(other)}`).set('Idempotency-Key', `service-foreign-${run}`).expect(422);
    await request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-staff-${run}`).expect(403);

    const [approved, approvalReplay] = await Promise.all([
      request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${customerToken(customer)}`).set('Idempotency-Key', `service-approve-${run}`).expect(201),
      request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${customerToken(customer)}`).set('Idempotency-Key', `service-approve-${run}`).expect(201),
    ]);
    expect(approvalReplay.body.id).toBe(approved.body.id);
    expect(approved.body.warrantyCase.status).toBe('approved');
    expect(approved.body.estimateApprovedBy).toBe(customer.id);

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual([
      'service.work_order_created',
      'service.diagnostics_completed',
      'service.estimate_approved',
    ]);
    expect(events[2].actor).toBe(customer.id);
    expect(await prisma.serviceWorkOrderCommand.count({ where: { workOrderId: created.body.id } })).toBe(3);
  });

  it('keeps customer reads owner-scoped and rejects changed command replay', async () => {
    const first = await fixture('2');
    const second = await fixture('3');
    const created = await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-scope-${run}`).send({ warrantyCaseId: first.warrantyCase.id }).expect(201);
    await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-scope-${run}`).send({ warrantyCaseId: second.warrantyCase.id }).expect(409);
    const mine = await request(app.getHttpServer()).get('/service-center/me/work-orders').set('Authorization', `Bearer ${customerToken(first.customer)}`).expect(200);
    const otherMine = await request(app.getHttpServer()).get('/service-center/me/work-orders').set('Authorization', `Bearer ${customerToken(second.customer)}`).expect(200);
    expect(mine.body.map((item: { id: string }) => item.id)).toContain(created.body.id);
    expect(otherMine.body).toEqual([]);
    expect(JSON.stringify(mine.body)).not.toContain('"cost"');
  });

  it('serializes diagnosis edits with customer approval', async () => {
    const { customer, warrantyCase } = await fixture('6');
    const created = await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-race-create-${run}`).send({ warrantyCaseId: warrantyCase.id, technicianId: ownerId }).expect(201);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/diagnose`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-race-first-${run}`).send({ summary: 'Первая смета', estimateAmount: 1000 }).expect(201);
    const [edited, approved] = await Promise.all([
      request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/diagnose`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-race-edit-${run}`).send({ summary: 'Уточнённая смета', estimateAmount: 1200 }),
      request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${customerToken(customer)}`).set('Idempotency-Key', `service-race-approve-${run}`),
    ]);
    expect([201, 409]).toContain(edited.status);
    expect(approved.status).toBe(201);
    const final = await prisma.serviceWorkOrder.findUniqueOrThrow({ where: { id: created.body.id }, include: { warrantyCase: true } });
    expect(final.warrantyCase.status).toBe('approved');
    expect(final.estimateApprovedAt).not.toBeNull();
  });

  it('escalates an overdue SLA once and records it in the Ledger', async () => {
    const { warrantyCase } = await fixture('5');
    await prisma.warrantyCase.update({ where: { id: warrantyCase.id }, data: { sla: new Date(Date.now() - 60_000) } });
    await expect(serviceSla.escalateOverdue()).resolves.toEqual({ escalated: 1 });
    await expect(serviceSla.escalateOverdue()).resolves.toEqual({ escalated: 0 });
    const updated = await prisma.warrantyCase.findUniqueOrThrow({ where: { id: warrantyCase.id } });
    expect(updated.slaEscalatedAt).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { type: 'service.sla_breached', refs: { has: warrantyCase.id } } })).toBe(1);
    expect(await prisma.outboxMessage.count({ where: { template: 'service_sla_breached', recipient: updated.customerId } })).toBe(1);
  });

  it('reserves store-owned parts and runs an idempotent technician repair lifecycle', async () => {
    const { customer, warrantyCase } = await fixture('4');
    const created = await request(app.getHttpServer())
      .post('/service-center/work-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `service-exec-create-${run}`)
      .send({ warrantyCaseId: warrantyCase.id })
      .expect(201);
    const assigned = await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `service-exec-assign-${run}`)
      .send({ technicianId })
      .expect(201);
    expect(assigned.body.technicianId).toBe(technicianId);
    const assignedQueue = await request(app.getHttpServer()).get('/service-center/queue').set('Authorization', `Bearer ${technicianToken}`).expect(200);
    expect(assignedQueue.body.map((item: { id: string }) => item.id)).toContain(warrantyCase.id);
    const foreignQueue = await request(app.getHttpServer()).get('/service-center/queue').set('Authorization', `Bearer ${foreignTechnicianToken}`).expect(200);
    expect(foreignQueue.body.map((item: { id: string }) => item.id)).not.toContain(warrantyCase.id);
    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/diagnose`)
      .set('Authorization', `Bearer ${foreignTechnicianToken}`)
      .set('Idempotency-Key', `service-exec-foreign-diagnose-${run}`)
      .send({ summary: 'Чужая диагностика', estimateAmount: 0 })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/diagnose`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-exec-diagnose-${run}`)
      .send({ summary: 'Замена контроллера питания', estimateAmount: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`)
      .set('Authorization', `Bearer ${customerToken(customer)}`)
      .set('Idempotency-Key', `service-exec-approve-${run}`)
      .expect(201);

    const partProduct = await prisma.product.create({
      data: { sku: `SERVICE-${run}-PART`, name: 'Контроллер питания', price: 2500, cost: 1200, category: 'parts', trackingMode: 'quantity', attrs: {} },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: partProduct.id, location: 'BISHKEK-2', onHand: 2, inventoryValue: 1200 },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: partProduct.id,
        balanceId: balance.id,
        location: 'BISHKEK-2',
        sourceType: 'service.test.receive',
        sourceRef: `service-part-layer-${run}`,
        unitCost: 1200,
        quantityReceived: 1,
        quantityRemaining: 1,
      },
    });
    await prisma.quantityConsignmentLot.create({
      data: {
        idempotencyKey: `service-consignment-${run}`,
        productId: partProduct.id,
        balanceId: balance.id,
        location: 'BISHKEK-2',
        ownerName: 'Комитент',
        commissionBps: 1000,
        receivedQty: 1,
        availableQty: 1,
        createdBy: ownerId,
      },
    });

    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/parts`)
      .set('Authorization', `Bearer ${foreignTechnicianToken}`)
      .set('Idempotency-Key', `service-part-foreign-${run}`)
      .send({ productId: partProduct.id, qty: 1 })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/parts`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-part-too-many-${run}`)
      .send({ productId: partProduct.id, qty: 2 })
      .expect(409);
    const competingReservations = await Promise.all([
      request(app.getHttpServer())
        .post(`/service-center/work-orders/${created.body.id}/parts`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .set('Idempotency-Key', `service-part-race-a-${run}`)
        .send({ productId: partProduct.id, qty: 1 }),
      request(app.getHttpServer())
        .post(`/service-center/work-orders/${created.body.id}/parts`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .set('Idempotency-Key', `service-part-race-b-${run}`)
        .send({ productId: partProduct.id, qty: 1 }),
    ]);
    expect(competingReservations.map((response) => response.status).sort()).toEqual([201, 409]);
    const winningReservation = competingReservations.find((response) => response.status === 201)!;
    const racedPartId = winningReservation.body.parts.find((part: { status: string }) => part.status === 'reserved').id;
    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/parts/${racedPartId}/release`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-part-race-release-${run}`)
      .expect(201);
    const reserveKey = `service-part-reserve-${run}`;
    const reserved = await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/parts`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', reserveKey)
      .send({ productId: partProduct.id, qty: 1 })
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/parts`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', reserveKey)
      .send({ productId: partProduct.id, qty: 1 })
      .expect(201);
    expect(replay.body.parts.filter((part: { status: string }) => part.status === 'reserved')).toHaveLength(1);
    const partId = reserved.body.parts.find((part: { status: string }) => part.status === 'reserved').id;
    const customerView = await request(app.getHttpServer()).get('/service-center/me/work-orders').set('Authorization', `Bearer ${customerToken(customer)}`).expect(200);
    expect(JSON.stringify(customerView.body)).not.toContain('"cost"');

    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/start`)
      .set('Authorization', `Bearer ${foreignTechnicianToken}`)
      .set('Idempotency-Key', `service-start-foreign-${run}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/start`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-start-${run}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-complete-early-${run}`)
      .send({ summary: 'Устройство проверено' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/parts/${partId}/consume`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-consume-${run}`)
      .expect(201);
    const completed = await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-complete-${run}`)
      .send({ summary: 'Контроллер заменён, тесты пройдены' })
      .expect(201);
    expect(completed.body.warrantyCase.status).toBe('repaired');
    const closed = await request(app.getHttpServer())
      .post(`/service-center/work-orders/${created.body.id}/close`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('Idempotency-Key', `service-close-${run}`)
      .expect(201);
    expect(closed.body.warrantyCase.status).toBe('closed');
    expect(new Date(closed.body.repairWarrantyUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const stock = await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
    expect(stock).toMatchObject({ onHand: 1, reserved: 0, inventoryValue: 0 });
    const serviceMovement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { type: 'service_consumed', productId: partProduct.id },
    });
    expect(serviceMovement).toMatchObject({ qty: -1, valuationQty: 1, unitCost: 1200, totalValue: 1200 });
    expect(await prisma.inventoryValuationIssue.count({
      where: { sourceType: 'service.consumed', sourceRef: { startsWith: `${serviceMovement.id}:` }, totalCost: 1200 },
    })).toBe(1);
    const serviceJournal = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'service.consumed', sourceRef: serviceMovement.id } },
      include: { lines: true },
    });
    expect(serviceJournal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '5000', debit: 1200, credit: 0 }),
      expect.objectContaining({ accountCode: '1200', debit: 0, credit: 1200 }),
    ]));
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } } });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'service.technician_assigned',
      'service.part_reserved',
      'service.repair_started',
      'service.part_consumed',
      'service.repair_completed',
      'service.work_order_closed',
    ]));
  });

  it('replaces an approved warranty device from same-model store stock exactly once', async () => {
    const { customer, warrantyCase, product, order, imei } = await fixture('7');
    const replacementImei = `SERVICE-${run}-7-REPLACEMENT`;
    await prisma.deviceUnit.create({ data: { imei: replacementImei, productId: product.id, status: 'in_stock', location: 'BISHKEK-2' } });
    const created = await request(app.getHttpServer()).post('/service-center/work-orders').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `service-replace-create-${run}`).send({ warrantyCaseId: warrantyCase.id, technicianId }).expect(201);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/diagnose`).set('Authorization', `Bearer ${technicianToken}`).set('Idempotency-Key', `service-replace-diagnose-${run}`).send({ summary: 'Ремонт невозможен', estimateAmount: 0 }).expect(201);
    await request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${customerToken(customer)}`).set('Idempotency-Key', `service-replace-approve-${run}`).expect(201);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/start`).set('Authorization', `Bearer ${technicianToken}`).set('Idempotency-Key', `service-replace-start-${run}`).expect(201);
    const key = `service-replace-device-${run}`;
    const replaced = await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/replace`).set('Authorization', `Bearer ${technicianToken}`).set('Idempotency-Key', key).send({ replacementImei, summary: 'Выдано новое устройство той же модели' }).expect(201);
    expect(replaced.body).toMatchObject({ replacementImei, warrantyCase: { status: 'replaced' } });
    const replay = await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/replace`).set('Authorization', `Bearer ${technicianToken}`).set('Idempotency-Key', key).send({ replacementImei, summary: 'Выдано новое устройство той же модели' }).expect(201);
    expect(replay.body.replacementImei).toBe(replacementImei);
    const unit = await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: replacementImei } });
    expect(unit).toMatchObject({ status: 'sold', orderId: order.id });
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei } })).toMatchObject({ status: 'in_repair', orderId: order.id });
    expect(await prisma.auditEvent.count({ where: { type: 'service.device_replaced', refs: { has: created.body.id } } })).toBe(1);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/close`).set('Authorization', `Bearer ${technicianToken}`).set('Idempotency-Key', `service-replace-close-${run}`).expect(201);
  });

  it('accepts a third-party device without adding sellable inventory and reuses customer approval', async () => {
    const phone = `+99677${run}8`;
    const payload = {
      phone,
      customerName: 'Paid Repair Customer',
      deviceName: 'Xiaomi 13',
      serial: `paid-${run}-serial`,
      problem: 'Замена экрана',
      technicianId: ownerId,
    };
    await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `paid-denied-${run}`).send(payload).expect(403);
    await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(422);
    await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `paid-invalid-tech-${run}`).send({ ...payload, technicianId: 'missing-staff' }).expect(422);

    const created = await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `paid-create-${run}`).send(payload).expect(201);
    const replayed = await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `paid-create-${run}`).send(payload).expect(201);
    expect(replayed.body.id).toBe(created.body.id);
    expect(created.body.warrantyCase).toMatchObject({
      status: 'received',
      serviceType: 'paid',
      deviceName: 'Xiaomi 13',
      imei: `PAID-${run}-SERIAL`,
    });
    await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `paid-create-${run}`).send({ ...payload, problem: 'Другая проблема' }).expect(409);
    await request(app.getHttpServer()).post('/service-center/paid-repairs').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `paid-duplicate-${run}`).send(payload).expect(409);

    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    expect(customer.name).toBe('Paid Repair Customer');
    expect(await prisma.deviceUnit.count({ where: { imei: `PAID-${run}-SERIAL` } })).toBe(0);
    const queue = await request(app.getHttpServer()).get('/service-center/queue').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(queue.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.warrantyCaseId, serviceType: 'paid', productName: 'Xiaomi 13' })]));

    const diagnosed = await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/diagnose`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `paid-diagnose-${run}`).send({ summary: 'Нужна замена дисплея', estimateAmount: 6500, diagnosticFee: 500 }).expect(201);
    expect(diagnosed.body.warrantyCase.status).toBe('diagnostics');
    expect(diagnosed.body).toMatchObject({ taxCode: 'vat_standard', taxRateBps: 1200, taxBaseAmount: 5804, taxAmount: 696 });
    const mine = await request(app.getHttpServer()).get('/service-center/me/work-orders').set('Authorization', `Bearer ${customerToken(customer)}`).expect(200);
    expect(mine.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));
    const approved = await request(app.getHttpServer()).post(`/service-center/me/work-orders/${created.body.id}/approve-estimate`).set('Authorization', `Bearer ${customerToken(customer)}`).set('Idempotency-Key', `paid-approve-${run}`).expect(201);
    expect(approved.body.warrantyCase.status).toBe('approved');
    expect(approved.body.point).toBe('BISHKEK-2');

    const tenders = { payments: [{ method: 'cash', amount: 2500 }, { method: 'card', amount: 4000 }] };
    await request(app.getHttpServer()).get(`/service-center/work-orders/${created.body.id}/payment-context`).set('Authorization', `Bearer ${sellerToken}`).expect(403);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `paid-seller-denied-${run}`).send(tenders).expect(403);
    await request(app.getHttpServer()).get(`/service-center/work-orders/${created.body.id}/payment-context`).set('Authorization', `Bearer ${cashierToken}`).expect(409);
    const shift = await prisma.cashShift.create({ data: { staffId: cashierId, point: 'BISHKEK-1', openCash: 1000, openIdempotencyKey: `paid-shift-${run}` } });
    await request(app.getHttpServer()).get(`/service-center/work-orders/${created.body.id}/payment-context`).set('Authorization', `Bearer ${cashierToken}`).expect(409);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', `paid-wrong-point-${run}`).send(tenders).expect(409);
    await prisma.cashShift.update({ where: { id: shift.id }, data: { point: 'BISHKEK-2' } });
    const context = await request(app.getHttpServer()).get(`/service-center/work-orders/${created.body.id}/payment-context`).set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(context.body).toMatchObject({ id: created.body.id, customer: { id: customer.id }, paidTotal: 0, point: 'BISHKEK-2' });
    expect(context.body).not.toHaveProperty('payments');
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).send(tenders).expect(422);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', `paid-wrong-total-${run}`).send({ payments: [{ method: 'cash', amount: 6400 }] }).expect(422);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', `paid-gift-${run}`).send({ payments: [{ method: 'gift_card', amount: 6500 }] }).expect(422);

    const competingKeys = [`paid-settle-a-${run}`, `paid-settle-b-${run}`];
    const competing = await Promise.all(competingKeys.map((key) => request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', key).send(tenders)));
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    const winningKey = competingKeys[competing.findIndex((response) => response.status === 201)];
    const replay = await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', winningKey).send(tenders).expect(201);
    expect(replay.body.paidTotal).toBe(6500);
    await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', winningKey).send({ payments: [{ method: 'cash', amount: 6500 }] }).expect(409);

    const recordedPayments = await prisma.payment.findMany({ where: { serviceWorkOrderId: created.body.id }, orderBy: { amount: 'asc' } });
    expect(recordedPayments).toHaveLength(2);
    expect(recordedPayments.map(({ amount, method, orderId, shiftId, status }) => ({ amount, method, orderId, shiftId, status }))).toEqual([
      { amount: 2500, method: 'cash', orderId: null, shiftId: shift.id, status: 'received' },
      { amount: 4000, method: 'card', orderId: null, shiftId: shift.id, status: 'received' },
    ]);
    const cash = await prisma.payment.aggregate({ where: { shiftId: shift.id, method: 'cash' }, _sum: { amount: true } });
    expect(shift.openCash + (cash._sum.amount ?? 0)).toBe(3500);
    expect(await prisma.deviceUnit.count({ where: { imei: `PAID-${run}-SERIAL` } })).toBe(0);
    const serviceEntries = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: 'payment.receipt', sourceRef: { in: recordedPayments.map((payment) => payment.id) } },
      include: { lines: true },
    });
    expect(serviceEntries).toHaveLength(2);
    expect(serviceEntries.reduce((sum, entry) => sum + entry.taxAmount, 0)).toBe(696);
    expect(serviceEntries.flatMap((entry) => entry.lines).filter((line) => line.accountCode === '2200').reduce((sum, line) => sum + line.credit, 0)).toBe(696);

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } }, orderBy: { ts: 'asc' } });
    expect(events).toHaveLength(9);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'service.paid_repair_received',
      'service.work_order_created',
      'service.diagnostics_completed',
      'service.estimate_approved',
      'payment.received',
      'payment.received',
      'accounting.entry_posted',
      'accounting.entry_posted',
      'service.payment_completed',
    ]));
    expect(events.filter((event) => event.type === 'payment.received')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'accounting.entry_posted')).toHaveLength(2);
    expect(events.some((event) => event.type.startsWith('warranty.'))).toBe(false);
    expect(await prisma.serviceWorkOrderCommand.count({ where: { workOrderId: created.body.id } })).toBe(4);

    await prisma.payment.createMany({
      data: recordedPayments.map((payment) => ({
        serviceWorkOrderId: created.body.id,
        originalPaymentId: payment.id,
        amount: -payment.amount,
        method: payment.method,
        status: 'refunded',
      })),
    });
    const refundedMine = await request(app.getHttpServer()).get('/service-center/me/work-orders').set('Authorization', `Bearer ${customerToken(customer)}`).expect(200);
    const refundedWorkOrder = refundedMine.body.find((item: { id: string }) => item.id === created.body.id);
    expect(refundedWorkOrder.payments.reduce((sum: number, payment: { amount: number }) => sum + payment.amount, 0)).toBe(0);
    const refundedContext = await request(app.getHttpServer()).get(`/service-center/work-orders/${created.body.id}/payment-context`).set('Authorization', `Bearer ${cashierToken}`).expect(200);
    expect(refundedContext.body.paidTotal).toBe(0);
    const repaid = await request(app.getHttpServer()).post(`/service-center/work-orders/${created.body.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).set('Idempotency-Key', `paid-after-refund-${run}`).send(tenders).expect(201);
    expect(repaid.body.paidTotal).toBe(6500);
    const repaymentRows = await prisma.payment.findMany({ where: { txnId: { startsWith: `service:paid-after-refund-${run}:` } } });
    expect(repaymentRows).toHaveLength(2);
    const allPaymentEvents = await prisma.auditEvent.findMany({ where: { type: 'payment.received', refs: { has: created.body.id } } });
    expect(allPaymentEvents).toHaveLength(4);
    const repaymentIds = new Set(repaymentRows.map((payment) => payment.id));
    const repaymentEvents = allPaymentEvents.filter((event) => repaymentIds.has(String((event.payload as { paymentId?: string }).paymentId)));
    expect(repaymentEvents).toHaveLength(2);
    expect(repaymentEvents.every((event) => Number((event.payload as { amount?: number }).amount) > 0)).toBe(true);
    expect(await prisma.auditEvent.count({ where: { type: 'service.payment_completed', refs: { has: created.body.id } } })).toBe(2);
  });
});
