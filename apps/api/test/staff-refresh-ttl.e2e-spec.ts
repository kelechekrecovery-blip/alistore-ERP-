import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { AuditModule } from '../src/audit/audit.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * S-05 — окно, в котором работает украденный refresh сотрудника.
 *
 * Сотрудник и покупатель делили один срок — 30 дней. Для покупателя это
 * нормально: выкидывать его из аккаунта каждые сутки значит терять корзину и
 * продажи, а его токен не открывает ничего, кроме собственных заказов.
 *
 * Токен сотрудника открывает кассу, склад и согласования. Тридцать дней — это
 * срок, в течение которого украденный токен остаётся годным, причём кража
 * ничем себя не проявляет: ротация выдаёт вору новый токен так же охотно, как
 * владельцу. Сутки не делают кражу невозможной, но сокращают окно в тридцать
 * раз и привязывают его к рабочему циклу — смена начинается с входа.
 *
 * Поэтому срок расходится по ролям сознательно, и тест закрепляет **обе**
 * стороны: сокращение staff и то, что покупателя оно не задело.
 */
describe('Срок refresh сотрудника — сутки, не месяц (S-05)', () => {
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const created: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
  });

  afterAll(async () => {
    for (const id of created) {
      await prisma.refreshToken.deleteMany({ where: { customerId: `staff:${id}` } });
      await prisma.staffUser.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('логин сотрудника кладёт refresh со сроком 24 часа', async () => {
    const username = `owner-ttl-${Math.floor(Math.random() * 1_000_000)}`;
    const staff = await staffAuth.createStaff(username, 'pass1234', 'owner');
    created.push(staff.id);

    const before = Date.now();
    await staffAuth.login(username, 'pass1234');

    const record = await prisma.refreshToken.findFirst({
      where: { customerId: `staff:${staff.id}` },
      orderBy: { expiresAt: 'desc' },
    });
    expect(record).not.toBeNull();

    const lifetimeMs = record!.expiresAt.getTime() - before;
    // Ровно сутки, с запасом на время выполнения теста.
    expect(lifetimeMs).toBeGreaterThan(23 * HOUR_MS);
    expect(lifetimeMs).toBeLessThanOrEqual(24 * HOUR_MS + 60_000);
  });
});
