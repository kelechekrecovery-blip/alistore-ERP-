import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ValidationError } from '../src/common/errors';

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
    service = new StaffAuthService(prisma, jwt);
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
