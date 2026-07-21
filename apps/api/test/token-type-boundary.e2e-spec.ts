import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { issueGuestCheckoutCapability } from '../src/auth/guest-capability';
import { CustomersModule } from '../src/customers/customers.module';
import { OrdersModule } from '../src/orders/orders.module';
import { TradeInsModule } from '../src/tradeins/tradeins.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Гостевой capability — не access-токен.
 *
 * Capability подписывается тем же `JWT_SECRET`, что и клиентский/staff access-
 * токен, но несёт `typ: 'guest_capability'` и узкий scope. `JwtStrategy.validate`
 * не проверял `typ` вообще, поэтому capability, положенный в `Authorization:
 * Bearer`, проходил `JwtAuthGuard` как полноценный `request.user`.
 *
 * В текущем прод-конфиге (SMS отключён, соц-логин не настроен) легитимный
 * `typ: 'customer'` токен получить нельзя вовсе — значит эта дыра возвращала
 * анонимному злоумышленнику весь клиентский доступ: `POST /api/customers`
 * (публичный) выдаёт capability → он же открывает чужой Customer 360, смену
 * чужого consent и создание скупок с произвольным паспортом.
 *
 * Тот же проект для WebSocket проверку сделал (`auth.service.ts` —
 * `['customer','staff'].includes(payload.typ)`); HTTP-путь её не получил.
 */
describe('Граница типа токена · capability не проходит как access', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        CustomersModule,
        OrdersModule,
        TradeInsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await prisma.tradeInDevice.deleteMany({ where: { model: { startsWith: `TT-${RUN}` } } });
    await prisma.customer.deleteMany({ where: { name: { startsWith: `TokType-${RUN}` } } });
    await app.close();
  });

  let seq = 0;
  async function customer(name: string) {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+99670${String(RUN % 100000).padStart(5, '0')}${String(seq).padStart(2, '0')}`, name: `TokType-${RUN}-${name}` },
    });
  }

  it('capability в Bearer не читает чужой Customer 360', async () => {
    const victim = await customer('victim');
    const attackerId = 'attacker-cap-1';
    const capability = issueGuestCheckoutCapability(attackerId);

    await request(app.getHttpServer())
      .get(`/customers/${victim.id}/overview`)
      .set('Authorization', `Bearer ${capability}`)
      .expect((res) => {
        // Любой из 401/403 приемлем — важно, что не 200 с чужими ПДн.
        expect([401, 403]).toContain(res.status);
      });
  });

  it('capability в Bearer не меняет чужой marketing-consent', async () => {
    const victim = await customer('consent');
    const capability = issueGuestCheckoutCapability('attacker-cap-2');

    await request(app.getHttpServer())
      .patch(`/customers/${victim.id}/consent`)
      .set('Authorization', `Bearer ${capability}`)
      .send({ consent: true })
      .expect((res) => expect([401, 403]).toContain(res.status));

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.consent).toBe(false);
  });

  it('capability в Bearer не создаёт скупку на чужой паспорт', async () => {
    const victim = await customer('tradein');
    const capability = issueGuestCheckoutCapability('attacker-cap-3');

    await request(app.getHttpServer())
      .post('/tradeins')
      .set('Authorization', `Bearer ${capability}`)
      .send({
        customerId: victim.id,
        model: `TT-${RUN}-phone`,
        grade: 'B',
        price: 10000,
        sellerPassport: 'AN1234567',
      })
      .expect((res) => expect([401, 403]).toContain(res.status));

    expect(await prisma.tradeInDevice.count({ where: { model: `TT-${RUN}-phone` } })).toBe(0);
  });

  it('леджер заказа не отдаёт клиенту себестоимость и комиссию', async () => {
    const buyer = await customer('ledger');
    const order = await prisma.order.create({
      data: { customerId: buyer.id, channel: 'web', status: 'paid', total: 100000 },
    });
    // Событие с себестоимостью в payload — ровно то, что клиент видеть не должен.
    await prisma.auditEvent.createMany({
      data: [
        { type: 'order.created', actor: 'system', payload: { orderId: order.id }, refs: [order.id] },
        { type: 'accounting.entry_posted', actor: 'staff-1', payload: { sourceType: 'inventory.cogs', amount: 80000 }, refs: [order.id] },
        { type: 'consignment.sold', actor: 'staff-1', payload: { commissionAmount: 5000, ownerAmount: 45000, salePrice: 50000 }, refs: [order.id] },
      ],
    });
    const token = jwt.sign({ sub: buyer.id, typ: 'customer', phone: buyer.phone });

    const res = await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const serialized = JSON.stringify(res.body);
    // Таймлайн клиент видит — тип и время событий остаются.
    expect(serialized).toContain('order.created');
    // А чисел себестоимости и комиссии — нет ни в каком виде.
    expect(serialized).not.toContain('80000');
    expect(serialized).not.toContain('commissionAmount');
    expect(serialized).not.toContain('ownerAmount');
    expect(res.body.every((event: { payload?: unknown }) => event.payload === undefined)).toBe(true);

    await prisma.auditEvent.deleteMany({ where: { refs: { has: order.id } } });
    await prisma.order.deleteMany({ where: { id: order.id } });
  });
});
