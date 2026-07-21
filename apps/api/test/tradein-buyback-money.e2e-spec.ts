import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { TradeInsModule } from '../src/tradeins/tradeins.module';
import { issueGuestCheckoutCapability } from '../src/auth/guest-capability';
import { JwtStrategy } from '../src/auth/jwt.strategy';

/**
 * Выкуп Б/У устройства у прилавка — единственная операция, где наличные
 * уходят из ящика клиенту. Проводка и движение ящика в коде были, но их не
 * проверял ни один тест: `/tradeins/intake` дёргался только RBAC-спеком,
 * который смотрит на коды ответа и ни разу не заглядывает в деньги. Уронить
 * денежный след можно было, не уронив ни одного теста.
 *
 * Здесь проверяется именно денежный след и граница между двумя эндпоинтами:
 * самооценка клиента с витрины деньги не двигает, приёмка сотрудником — двигает.
 */
describe('Trade-in buyback money trail (accounting + cash drawer)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sellerToken: string;
  let sellerId: string;
  let shiftId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);
  const PRICE = 42_000;
  let seq = 0;
  const createdTradeInIds: string[] = [];
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        TradeInsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const staffAuth = moduleRef.get(StaffAuthService);
    const username = `seller-buyback-${RUN}`;
    const staff = await staffAuth.createStaff(username, 'pass', 'seller');
    sellerId = staff.id;
    sellerToken = (await staffAuth.login(username, 'pass')).accessToken;

    // Выдача наличных требует открытой смены у принимающего.
    const shift = await prisma.cashShift.create({
      data: { staffId: sellerId, point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
    shiftId = shift.id;
  });

  // Спек убирает только за собой: общий леджер и чужие смены не трогаются.
  afterAll(async () => {
    if (createdTradeInIds.length > 0) {
      await prisma.cashDrawerMovement.deleteMany({ where: { sourceRef: { in: createdTradeInIds } } });
      const entries = await prisma.accountingJournalEntry.findMany({
        where: { sourceRef: { in: createdTradeInIds } },
        select: { id: true },
      });
      const entryIds = entries.map((entry) => entry.id);
      if (entryIds.length > 0) {
        // Строки и проводку сносим одной транзакцией: баланс двойной записи
        // стережёт отложенный constraint-триггер, и проводка, оставшаяся без
        // строк хотя бы до конца транзакции, роняет уборку как «unbalanced».
        await prisma.$transaction(async (tx) => {
          await tx.accountingJournalLine.deleteMany({ where: { entryId: { in: entryIds } } });
          await tx.accountingJournalEntry.deleteMany({ where: { id: { in: entryIds } } });
        });
      }
      await prisma.tradeInDevice.deleteMany({ where: { id: { in: createdTradeInIds } } });
    }
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: createdTradeInIds } } });
    await prisma.cashDrawerMovement.deleteMany({ where: { shiftId } });
    await prisma.cashShift.deleteMany({ where: { id: shiftId } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.staffUser.deleteMany({ where: { id: sellerId } });
    await app.close();
  });

  async function customerFixture() {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+996707${RUN}${seq}`, name: 'Trade-in buyback' },
    });
    createdCustomerIds.push(customer.id);
    return customer;
  }

  function payload(customerId: string, imei: string) {
    return {
      customerId,
      model: 'iPhone 13 Pro 256GB',
      imei,
      grade: 'B',
      price: PRICE,
      sellerPassport: 'ID1234567',
    };
  }

  it('пишет двойную проводку и расход из ящика при приёмке сотрудником', async () => {
    const customer = await customerFixture();
    const response = await request(app.getHttpServer())
      .post('/tradeins/intake')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `buyback-${RUN}-1`)
      .send(payload(customer.id, `TI-MONEY-${RUN}-1`))
      .expect(201);
    const tradeInId: string = response.body.id;
    createdTradeInIds.push(tradeInId);

    const entry = await prisma.accountingJournalEntry.findUnique({
      where: { sourceType_sourceRef: { sourceType: 'tradein.buyback', sourceRef: tradeInId } },
      include: { lines: true },
    });
    expect(entry).not.toBeNull();
    expect(entry!.documentAmount).toBe(PRICE);

    // Устройство приходуется на запасы, деньги уходят из кассы — и проводка
    // обязана сходиться, иначе баланс разъедется на стоимость выкупа.
    const debit = entry!.lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = entry!.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(debit).toBe(PRICE);
    expect(credit).toBe(PRICE);
    expect(entry!.lines.find((line) => line.accountCode === '1200')?.debit).toBe(PRICE);
    expect(entry!.lines.find((line) => line.accountCode === '1000')?.credit).toBe(PRICE);

    const movements = await prisma.cashDrawerMovement.findMany({ where: { sourceRef: tradeInId } });
    expect(movements).toHaveLength(1);
    expect(movements[0].amount).toBe(-PRICE);
    expect(movements[0].kind).toBe('tradein_buyback');
    expect(movements[0].shiftId).toBe(shiftId);
    // Движение ящика ссылается на свою проводку: без этого расхождение по
    // смене нельзя объяснить документом.
    expect(movements[0].accountingEntryId).toBe(entry!.id);
  });

  it('самооценка с витрины деньги не двигает', async () => {
    const customer = await customerFixture();
    const response = await request(app.getHttpServer())
      .post('/tradeins')
      .set('x-guest-capability', issueGuestCheckoutCapability(customer.id))
      .set('Idempotency-Key', `selfservice-${RUN}-1`)
      .send(payload(customer.id, `TI-MONEY-${RUN}-2`))
      .expect(201);
    const tradeInId: string = response.body.id;
    createdTradeInIds.push(tradeInId);

    // Оценка — это ещё не выкуп: пока сотрудник не принял аппарат у прилавка,
    // из ящика не должно уйти ни сома.
    const entry = await prisma.accountingJournalEntry.findUnique({
      where: { sourceType_sourceRef: { sourceType: 'tradein.buyback', sourceRef: tradeInId } },
    });
    expect(entry).toBeNull();
    expect(await prisma.cashDrawerMovement.count({ where: { sourceRef: tradeInId } })).toBe(0);
  });

  it('повтор с тем же ключом не платит клиенту дважды', async () => {
    const customer = await customerFixture();
    const send = () => request(app.getHttpServer())
      .post('/tradeins/intake')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `buyback-${RUN}-repeat`)
      .send(payload(customer.id, `TI-MONEY-${RUN}-3`))
      .expect(201);

    const first = await send();
    const second = await send();
    createdTradeInIds.push(first.body.id);
    expect(second.body.id).toBe(first.body.id);

    expect(await prisma.cashDrawerMovement.count({ where: { sourceRef: first.body.id } })).toBe(1);
    const paidOut = await prisma.cashDrawerMovement.aggregate({
      where: { sourceRef: first.body.id },
      _sum: { amount: true },
    });
    expect(paidOut._sum.amount).toBe(-PRICE);
  });
});
