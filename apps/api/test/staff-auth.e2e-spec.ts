import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ValidationError } from '../src/common/errors';
import { TotpService } from '../src/auth/totp.service';
import { authenticator } from 'otplib';

/** Staff login carries the role in the JWT (foundation for server-side authz). */
describe('StaffAuth (login → role in JWT)', () => {
  let prisma: PrismaService;
  let jwt: JwtService;
  let service: StaffAuthService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    jwt = new JwtService({ secret: 'test-secret' });
    service = new StaffAuthService(prisma, jwt, new TotpService());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('logs a staff member in and puts their role in the JWT', async () => {
    const username = `admin-${RUN}`;
    await service.createStaff(username, 'strong-pass', 'admin');

    const { accessToken, role } = await service.login(username, 'strong-pass');
    expect(role).toBe('admin');

    const claims = jwt.verify<{ sub: string; role: string; typ: string }>(
      accessToken,
    );
    expect(claims.role).toBe('admin');
    expect(claims.typ).toBe('staff');
  });

  it('sets up and enables staff TOTP without exposing the secret on public view', async () => {
    const username = `totp-${RUN}`;
    const staff = await service.createStaff(username, 'strong-pass', 'owner');
    const setup = await service.setupTotp(staff.id);
    const token = authenticator.generate(setup.secret);

    const enabled = await service.enableTotp(staff.id, token);
    expect(enabled.totpEnabled).toBe(true);
    expect(enabled).not.toHaveProperty('totpSecret');

    const login = await service.login(username, 'strong-pass');
    expect(login.totpEnabled).toBe(true);
  });

  it('requires a valid TOTP token for approval step-up', async () => {
    const username = `stepup-${RUN}`;
    const staff = await service.createStaff(username, 'strong-pass', 'owner');
    const setup = await service.setupTotp(staff.id);

    await expect(service.verifyStepUp(staff.id)).rejects.toMatchObject({
      code: 'staff_2fa_required',
    });
    await service.enableTotp(staff.id, authenticator.generate(setup.secret));
    await expect(service.verifyStepUp(staff.id, '000000')).rejects.toMatchObject({
      code: 'staff_2fa_invalid_token',
    });
    await expect(
      service.verifyStepUp(staff.id, authenticator.generate(setup.secret)),
    ).resolves.toBeUndefined();
  });

  it('rejects a wrong password', async () => {
    const username = `owner-${RUN}`;
    await service.createStaff(username, 'right-pass', 'owner');

    const err = await service.login(username, 'wrong-pass').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('staff_invalid_credentials');
  });

  it('rejects an unknown user', async () => {
    const err = await service.login(`nobody-${RUN}`, 'x').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('staff_invalid_credentials');
  });
});
