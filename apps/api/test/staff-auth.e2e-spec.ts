import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ValidationError } from '../src/common/errors';
import { TotpService } from '../src/auth/totp.service';
import { authenticator } from 'otplib';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import * as argon2 from 'argon2';

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

    // F-14: после включения 2FA вход без кода больше не выдаёт токен.
    await expect(service.login(username, 'strong-pass')).rejects.toMatchObject({ code: 'totp_required' });
    const login = await service.login(username, 'strong-pass', authenticator.generate(setup.secret));
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

  it('consumes a TOTP step-up token only once, including concurrent requests', async () => {
    const username = `replay-${RUN}`;
    const staff = await service.createStaff(username, 'strong-pass', 'owner');
    const setup = await service.setupTotp(staff.id);
    await service.enableTotp(staff.id, authenticator.generate(setup.secret));
    const token = authenticator.generate(setup.secret);

    const attempts = await Promise.allSettled([
      service.verifyStepUp(staff.id, token),
      service.verifyStepUp(staff.id, token),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { code: 'staff_2fa_token_reused' },
    });

    await expect(service.verifyStepUp(staff.id, token)).rejects.toMatchObject({
      code: 'staff_2fa_token_reused',
    });
  });

  it('rejects a wrong password', async () => {
    const username = `owner-${RUN}`;
    await service.createStaff(username, 'right-pass', 'owner');

    const err = await service.login(username, 'wrong-pass').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('staff_invalid_credentials');
  });

  it('cannot insert a late session after credentials change during password verification', async () => {
    const username = `login-race-${RUN}`;
    const staff = await service.createStaff(username, 'old-strong-pass', 'admin');
    const originalFindUnique = prisma.staffUser.findUnique.bind(prisma.staffUser);
    let snapshotRead!: () => void;
    let releaseSnapshot!: () => void;
    const read = new Promise<void>((resolve) => { snapshotRead = resolve; });
    const released = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    const pausedFindUnique = async (args: Parameters<typeof originalFindUnique>[0]) => {
      const snapshot = await originalFindUnique(args);
      snapshotRead();
      await released;
      return snapshot;
    };
    const findSpy = jest.spyOn(prisma.staffUser, 'findUnique')
      .mockImplementationOnce(pausedFindUnique as never);

    try {
      const login = service.login(username, 'old-strong-pass');
      await read;
      await prisma.staffUser.update({
        where: { id: staff.id },
        data: {
          passwordHash: await argon2.hash('new-strong-pass'),
          sessionVersion: { increment: 1 },
        },
      });
      releaseSnapshot();
      await expect(login).rejects.toMatchObject({ code: 'staff_session_changed' });
      await expect(prisma.refreshToken.count({
        where: { customerId: `staff:${staff.id}`, revokedAt: null },
      })).resolves.toBe(0);
    } finally {
      releaseSnapshot();
      findSpy.mockRestore();
    }
  });

  it('rejects an unknown user', async () => {
    const err = await service.login(`nobody-${RUN}`, 'x').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('staff_invalid_credentials');
  });

  it('revokes an old-writer legacy child when a new-family staff parent is replayed', async () => {
    const username = `mixed-${RUN}`;
    const staff = await service.createStaff(username, 'strong-pass', 'admin');
    const current = await service.login(username, 'strong-pass');
    const ancestor = `staff-hex-ancestor-${RUN}`;
    const legacyChild = `staff-legacy-child-${RUN}`;
    const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
    await prisma.refreshToken.createMany({
      data: [
        {
          customerId: `staff:${staff.id}`,
          familyId: 'b'.repeat(32),
          tokenHash: tokenHash(ancestor),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(Date.now() - 60_000),
          rotatedAt: new Date(Date.now() - 60_000),
        },
        {
          customerId: `staff:${staff.id}`,
          familyId: 'legacy:old-writer-child',
          tokenHash: tokenHash(legacyChild),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(service.refresh(ancestor)).rejects.toMatchObject({
      code: 'staff_refresh_reused',
    });
    await expect(prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(legacyChild) },
    })).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    await expect(service.refresh(current.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('rejects a stale staff role on the non-HTTP realtime token path', async () => {
    const username = `realtime-${RUN}`;
    const staff = await service.createStaff(username, 'strong-pass', 'admin');
    const session = await service.login(username, 'strong-pass');
    const transportAuth = new AuthService(
      prisma,
      jwt,
      { get: () => undefined } as unknown as ConfigService,
    );

    await expect(transportAuth.verifyAccessToken(session.accessToken)).resolves.toMatchObject({
      customerId: staff.id,
      typ: 'staff',
      role: 'admin',
    });
    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { role: 'seller', sessionVersion: { increment: 1 } },
    });
    await expect(transportAuth.verifyAccessToken(session.accessToken)).rejects.toMatchObject({
      code: 'staff_session_revoked',
    });
  });
});
