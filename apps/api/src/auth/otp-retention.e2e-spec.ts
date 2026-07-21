import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { OtpRetentionService } from './otp-retention.service';

/**
 * Телефон в `OtpChallenge` лежит открытым текстом. Удаление аккаунта чистит
 * challenge'ы своего номера, но большинство номеров аккаунтом так и не становятся:
 * ошиблись цифрой, передумали на экране кода, перебирали чужой номер. Эти строки
 * не удалял никто и никогда — номер оставался в базе бессрочно.
 *
 * Challenge не читается после истечения (`verifyOtp` отвергает просроченный), так
 * что удалять безопасно. Окно сверх срока жизни оставлено на разбор злоупотреблений.
 */
describe('OTP challenge retention', () => {
  let prisma: PrismaService;
  let retention: OtpRetentionService;
  const run = `${Date.now()}${Math.floor(Math.random() * 10_000)}`.slice(-8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [OtpRetentionService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    retention = moduleRef.get(OtpRetentionService);
  });

  afterAll(async () => prisma.$disconnect());

  function phone(suffix: string) {
    return `+9967${run.slice(-6)}${suffix}`;
  }

  async function challenge(at: Date, suffix: string) {
    return prisma.otpChallenge.create({
      data: {
        phone: phone(suffix),
        codeHash: 'irrelevant',
        expiresAt: at,
        createdAt: at,
      },
    });
  }

  it('удаляет просроченные challenge и оставляет живые', async () => {
    const hour = 60 * 60_000;
    const ancient = await challenge(new Date(Date.now() - 72 * hour), '01');
    const justExpired = await challenge(new Date(Date.now() - 60_000), '02');
    const alive = await challenge(new Date(Date.now() + 5 * 60_000), '03');

    const { purged } = await retention.purgeExpired();
    expect(purged).toBeGreaterThanOrEqual(1);

    // старше окна — номера в базе больше нет
    expect(await prisma.otpChallenge.findUnique({ where: { id: ancient.id } })).toBeNull();
    // истёк, но внутри окна разбора злоупотреблений — ещё жив
    expect(await prisma.otpChallenge.findUnique({ where: { id: justExpired.id } })).not.toBeNull();
    // действующий вход ломать нельзя
    expect(await prisma.otpChallenge.findUnique({ where: { id: alive.id } })).not.toBeNull();

    await prisma.otpChallenge.deleteMany({ where: { phone: { startsWith: `+9967${run.slice(-6)}` } } });
  });
});
