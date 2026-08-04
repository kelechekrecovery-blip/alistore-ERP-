import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { FinanceModule } from '../src/finance/finance.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Finance settlement register (integration + invariants)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let sellerToken: string;
  let ownerId: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const prefix = `fin-settle-${run}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, FinanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const owner = await auth.createStaff(`${prefix}-owner`, 'pass', 'owner');
    ownerId = owner.id;
    ownerToken = (await auth.login(owner.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`${prefix}-seller`, 'pass', 'seller');
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    const settlements = await prisma.financeSettlementRun.findMany({ where: { createdBy: ownerId }, select: { id: true } });
    const settlementIds = settlements.map((item) => item.id);
    await prisma.financeSettlementCommand.deleteMany({ where: { runId: { in: settlementIds } } });
    await prisma.financeSettlementLine.deleteMany({ where: { runId: { in: settlementIds } } });
    await prisma.financeSettlementRun.deleteMany({ where: { id: { in: settlementIds } } });
    const orders = await prisma.order.findMany({ where: { channel: prefix }, select: { id: true } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
    await prisma.customer.deleteMany({ where: { phone: { contains: String(run) } } });
    await prisma.cashShift.deleteMany({ where: { point: prefix } });
    await prisma.courierRun.deleteMany({ where: { courierId: prefix } });
    await prisma.auditEvent.deleteMany({ where: { type: { startsWith: 'finance.settlement_' }, actor: ownerId } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: prefix } } });
    await app.close();
  });

  async function fixtures() {
    const customer = await prisma.customer.create({ data: { phone: `+996700${run}`, name: prefix } });
    const order = await prisma.order.create({ data: { customerId: customer.id, status: 'paid', channel: prefix, total: 10_000, storePointCode: prefix, storePointName: prefix } });
    const provider = await prisma.payment.create({ data: { orderId: order.id, amount: 10_000, method: 'qr_mbank', status: 'received', txnId: `${prefix}-provider` } });
    const refund = await prisma.payment.create({ data: { orderId: order.id, originalPaymentId: provider.id, amount: -1_000, method: 'qr_mbank', status: 'refunded', txnId: `${prefix}-refund` } });
    const shift = await prisma.cashShift.create({ data: { staffId: ownerId, point: prefix, openCash: 2_000, closeCash: 7_000, diff: 0, closedAt: new Date() } });
    await prisma.payment.create({ data: { orderId: order.id, shiftId: shift.id, amount: 5_000, method: 'cash', status: 'received', txnId: `${prefix}-cash` } });
    const courier = await prisma.courierRun.create({ data: { courierId: prefix, codTotal: 3_000, collectedTotal: 3_000, handedOver: true, handoverAmount: 3_000, handedOverAt: new Date(), handoverIdempotencyKey: `${prefix}-cod` } });
    await prisma.order.update({ where: { id: order.id }, data: { courierRunId: courier.id } });
    return { provider, refund, shift, courier };
  }

  it('reconciles provider, refund, POS and COD once and writes the ledger', async () => {
    const source = await fixtures();
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const candidates = await request(app.getHttpServer())
      .get(`/finance/settlement-sources?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&point=${prefix}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(candidates.body.map((item: { sourceType: string }) => item.sourceType).sort()).toEqual(['courier_cod', 'pos_shift', 'provider_payment', 'refund']);

    const payload = {
      idempotencyKey: `${prefix}-create`, from, to, point: prefix,
      entries: [
        { sourceType: 'provider_payment', sourceRef: source.provider.id, actualAmount: 10_000 },
        { sourceType: 'refund', sourceRef: source.refund.id, actualAmount: -1_000 },
        { sourceType: 'pos_shift', sourceRef: source.shift.id, actualAmount: 5_000 },
        { sourceType: 'courier_cod', sourceRef: source.courier.id, actualAmount: 3_000 },
      ],
    };
    await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${sellerToken}`).send(payload).expect(403);
    const created = await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(created.body).toMatchObject({ status: 'balanced', expectedTotal: 17_000, actualTotal: 17_000, variance: 0, idempotent: false });
    expect(created.body.lines).toHaveLength(4);
    const replay = await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, idempotent: true });

    const closePayload = { idempotencyKey: `${prefix}-close` };
    const closed = await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/close`).set('Authorization', `Bearer ${ownerToken}`).send(closePayload).expect(201);
    expect(closed.body).toMatchObject({ status: 'closed', variance: 0, idempotent: false });
    const closeReplay = await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/close`).set('Authorization', `Bearer ${ownerToken}`).send(closePayload).expect(201);
    expect(closeReplay.body).toMatchObject({ id: created.body.id, idempotent: true });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: source.provider.id } })).status).toBe('reconciled');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: source.refund.id } })).status).toBe('reconciled');
    expect(await prisma.auditEvent.count({ where: { type: 'payment.reconciled', refs: { has: created.body.id } } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.settlement_closed', refs: { has: created.body.id } } })).toBe(1);
  });

  it('keeps a variance disputed, rejects close, resolves it idempotently and rolls invalid input back', async () => {
    const customer = await prisma.customer.create({ data: { phone: `+996701${run}`, name: `${prefix}-dispute` } });
    const order = await prisma.order.create({ data: { customerId: customer.id, status: 'paid', channel: prefix, total: 4_000, storePointCode: prefix } });
    const payment = await prisma.payment.create({ data: { orderId: order.id, amount: 4_000, method: 'qr_odengi', status: 'received', txnId: `${prefix}-dispute` } });
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const payload = { idempotencyKey: `${prefix}-dispute-create`, from, to, point: prefix, entries: [{ sourceType: 'provider_payment', sourceRef: payment.id, actualAmount: 3_900, reason: 'Выписка провайдера ниже на 100 сом' }] };
    const created = await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(created.body).toMatchObject({ status: 'disputed', variance: -100 });
    await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/close`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `${prefix}-early-close` }).expect(409);
    const resolvedPayload = { idempotencyKey: `${prefix}-resolve`, lineId: created.body.lines[0].id, adjustmentAmount: 100, reason: 'Компенсирующая проводка провайдера' };
    const resolved = await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/resolve`).set('Authorization', `Bearer ${ownerToken}`).send(resolvedPayload).expect(201);
    expect(resolved.body).toMatchObject({ status: 'balanced', actualTotal: 3_900, adjustmentTotal: 100, variance: 0, idempotent: false });
    expect(resolved.body.lines[0]).toMatchObject({ actualAmount: 3_900, adjustmentAmount: 100, variance: 0 });
    const resolvedReplay = await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/resolve`).set('Authorization', `Bearer ${ownerToken}`).send(resolvedPayload).expect(201);
    expect(resolvedReplay.body).toMatchObject({ id: created.body.id, idempotent: true });
    await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/close`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `${prefix}-dispute-close` }).expect(201);

    const before = await prisma.financeSettlementRun.count({ where: { createdBy: ownerId } });
    await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send({ ...payload, idempotencyKey: `${prefix}-invalid`, entries: [{ sourceType: 'provider_payment', sourceRef: 'missing', actualAmount: 1 }] }).expect(422);
    expect(await prisma.financeSettlementRun.count({ where: { createdBy: ownerId } })).toBe(before);
  });

  it('keeps POS/COD observations immutable and assigns COD to the handover period', async () => {
    const oldCreatedAt = new Date('2026-01-01T12:00:00.000Z');
    const handedOverAt = new Date();
    const shift = await prisma.cashShift.create({ data: { staffId: ownerId, point: prefix, openCash: 1_000, closeCash: 3_900, diff: -100, closeReason: 'Недостача подтверждена', closedAt: handedOverAt } });
    const customer = await prisma.customer.create({ data: { phone: `+996703${run}`, name: `${prefix}-cash` } });
    const order = await prisma.order.create({ data: { customerId: customer.id, status: 'completed', channel: prefix, total: 3_000, storePointCode: prefix } });
    await prisma.payment.create({ data: { orderId: order.id, shiftId: shift.id, amount: 3_000, method: 'cash', status: 'received', txnId: `${prefix}-cash-short` } });
    const courier = await prisma.courierRun.create({ data: { courierId: prefix, codTotal: 2_000, collectedTotal: 2_000, handedOver: true, handoverAmount: 1_900, handoverReason: 'Недостача курьера', handedOverAt, createdAt: oldCreatedAt, handoverIdempotencyKey: `${prefix}-cod-short` } });
    await prisma.order.update({ where: { id: order.id }, data: { courierRunId: courier.id } });
    const from = new Date(handedOverAt.getTime() - 60_000).toISOString();
    const to = new Date(handedOverAt.getTime() + 60_000).toISOString();
    const candidates = await request(app.getHttpServer()).get(`/finance/settlement-sources?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&point=${prefix}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(candidates.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'pos_shift', sourceRef: shift.id, expectedAmount: 3_000, suggestedActualAmount: 2_900 }),
      expect.objectContaining({ sourceType: 'courier_cod', sourceRef: courier.id, expectedAmount: 2_000, suggestedActualAmount: 1_900 }),
    ]));
    const created = await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send({
      idempotencyKey: `${prefix}-cash-create`, from, to, point: prefix,
      entries: [
        { sourceType: 'pos_shift', sourceRef: shift.id, actualAmount: 2_900, reason: 'Недостача кассы' },
        { sourceType: 'courier_cod', sourceRef: courier.id, actualAmount: 1_900, reason: 'Недостача COD' },
      ],
    }).expect(201);
    expect(created.body).toMatchObject({ status: 'disputed', actualTotal: 4_800, adjustmentTotal: 0, variance: -200 });
    for (const line of created.body.lines) {
      await request(app.getHttpServer()).post(`/finance/settlements/${created.body.id}/resolve`).set('Authorization', `Bearer ${ownerToken}`).send({
        idempotencyKey: `${prefix}-cash-resolve-${line.id}`, lineId: line.id, adjustmentAmount: 100, reason: 'Утверждённая компенсирующая проводка',
      }).expect(201);
    }
    const persisted = await prisma.financeSettlementRun.findUniqueOrThrow({ where: { id: created.body.id }, include: { lines: true } });
    expect(persisted).toMatchObject({ status: 'balanced', actualTotal: 4_800, adjustmentTotal: 200, variance: 0 });
    expect(persisted.lines.map((line) => line.actualAmount).sort()).toEqual([1_900, 2_900]);
    expect((await prisma.courierRun.findUniqueOrThrow({ where: { id: courier.id } })).handoverAmount).toBe(1_900);
    expect((await prisma.cashShift.findUniqueOrThrow({ where: { id: shift.id } })).closeCash).toBe(3_900);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.settlement_adjustment_created', refs: { has: created.body.id } } })).toBe(2);
  });

  it('serializes competing runs for the same source', async () => {
    const customer = await prisma.customer.create({ data: { phone: `+996702${run}`, name: `${prefix}-race` } });
    const order = await prisma.order.create({ data: { customerId: customer.id, status: 'paid', channel: prefix, total: 2_500, storePointCode: prefix } });
    const payment = await prisma.payment.create({ data: { orderId: order.id, amount: 2_500, method: 'obank', status: 'received', txnId: `${prefix}-race` } });
    const base = {
      from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), point: prefix,
      entries: [{ sourceType: 'provider_payment', sourceRef: payment.id, actualAmount: 2_500 }],
    };
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send({ ...base, idempotencyKey: `${prefix}-race-a` }),
      request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send({ ...base, idempotencyKey: `${prefix}-race-b` }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.financeSettlementLine.count({ where: { sourceType: 'provider_payment', sourceRef: payment.id } })).toBe(1);
  });

  it('serializes one idempotency key across commands on different runs', async () => {
    const customer = await prisma.customer.create({ data: { phone: `+996704${run}`, name: `${prefix}-key-race` } });
    const order = await prisma.order.create({ data: { customerId: customer.id, status: 'paid', channel: prefix, total: 6_000, storePointCode: prefix } });
    const payments = await Promise.all([1, 2].map((index) => prisma.payment.create({ data: { orderId: order.id, amount: 3_000, method: 'obank', status: 'received', txnId: `${prefix}-key-race-${index}` } })));
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const runs = [] as Array<{ id: string; lines: Array<{ id: string }> }>;
    for (const [index, payment] of payments.entries()) {
      const response = await request(app.getHttpServer()).post('/finance/settlements').set('Authorization', `Bearer ${ownerToken}`).send({
        idempotencyKey: `${prefix}-key-run-${index}`, from, to, point: prefix,
        entries: [{ sourceType: 'provider_payment', sourceRef: payment.id, actualAmount: 2_900, reason: 'Тест конкурентного ключа' }],
      }).expect(201);
      runs.push(response.body);
    }
    const sharedKey = `${prefix}-shared-resolve`;
    const responses = await Promise.all(runs.map((settlement) => request(app.getHttpServer()).post(`/finance/settlements/${settlement.id}/resolve`).set('Authorization', `Bearer ${ownerToken}`).send({
      idempotencyKey: sharedKey, lineId: settlement.lines[0].id, adjustmentAmount: 100, reason: 'Компенсирующая проводка',
    })));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  });
});
