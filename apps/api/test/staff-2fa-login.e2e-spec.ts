import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { TotpService } from '../src/auth/totp.service';
import { UnauthorizedError } from '../src/common/errors';

/**
 * F-14. `2fa/setup` и `2fa/enable` работали и ставили `totpEnabled: true`, но
 * `login` проверял только пароль и сразу выдавал accessToken. То есть включённая
 * двухфакторка не защищала ровно то, ради чего её включают — вход. Одобрение
 * опасных действий step-up код требовало, а сам вход — нет.
 *
 * Одноразовость кода тут та же, что у step-up (`totpLastToken`): перехваченный
 * код нельзя переиграть, даже пока он ещё «свежий» по времени.
 */
describe('Staff login with 2FA enforced', () => {
  let prisma: PrismaService;
  let service: StaffAuthService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new StaffAuthService(prisma, new JwtService({ secret: 'test-secret' }), new TotpService());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Заводит сотрудника с включённой 2FA и возвращает его секрет. */
  async function staffWith2fa(suffix: string) {
    const username = `f14-${suffix}-${RUN}`;
    const created = await service.createStaff(username, 'strong-pass-1', 'cashier');
    const secret = authenticator.generateSecret();
    await prisma.staffUser.update({
      where: { id: created.id },
      data: { totpSecret: secret, totpEnabled: true, totpLastToken: null },
    });
    return { username, secret };
  }

  it('без кода вход не выдаёт токен', async () => {
    const { username } = await staffWith2fa('missing');
    await expect(service.login(username, 'strong-pass-1')).rejects.toMatchObject({ code: 'totp_required' });
    await expect(service.login(username, 'strong-pass-1')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('с неверным кодом вход не выдаёт токен', async () => {
    const { username } = await staffWith2fa('wrong');
    await expect(service.login(username, 'strong-pass-1', '000000'))
      .rejects.toMatchObject({ code: 'totp_invalid' });
  });

  it('с верным кодом вход проходит', async () => {
    const { username, secret } = await staffWith2fa('ok');
    const tokens = await service.login(username, 'strong-pass-1', authenticator.generate(secret));
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.role).toBe('cashier');
  });

  /**
   * Вход НЕ тратит слот одноразовости step-up. Иначе ломается боевой сценарий
   * «владелец вошёл и сразу одобрил»: код уже потрачен логином, и одобрение
   * падает на денежном действии из-за входа.
   */
  it('вход не расходует код, нужный для одобрения опасного действия', async () => {
    const { username, secret } = await staffWith2fa('stepup');
    const token = authenticator.generate(secret);
    const { staffId } = await service.login(username, 'strong-pass-1', token) as unknown as { staffId: string };
    const staff = await prisma.staffUser.findFirstOrThrow({ where: { username } });
    expect(staff.totpLastToken).toBeNull();
    await expect(service.verifyStepUp(staff.id, token)).resolves.toBeUndefined();
    void staffId;
  });

  it('неверный пароль не отличим по ответу от неверного кода — не даём оракул', async () => {
    const { username, secret } = await staffWith2fa('oracle');
    await expect(service.login(username, 'wrong-password', authenticator.generate(secret)))
      .rejects.toMatchObject({ code: 'staff_invalid_credentials' });
  });

  it('без включённой 2FA поведение прежнее', async () => {
    const username = `f14-plain-${RUN}`;
    await service.createStaff(username, 'strong-pass-1', 'seller');
    const tokens = await service.login(username, 'strong-pass-1');
    expect(tokens.accessToken).toBeTruthy();
  });
});
