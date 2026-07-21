import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { PrismaModule } from '../src/prisma/prisma.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';

/**
 * The casbin PermissionGuard applied to a real production endpoint: only an owner
 * may create staff — role comes from the JWT, not the request body. This is the
 * P0-authz pattern in place (not just the demo test).
 */
describe('Staff management guard (owner-only, casbin)', () => {
  let app: INestApplication;
  let staffAuth: StaffAuthService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        PrismaModule,
        StaffAuthModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    staffAuth = moduleRef.get(StaffAuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  let seq = 0;
  async function login(role: 'owner' | 'seller' | 'admin'): Promise<string> {
    const username = `${role}-g-${RUN}-${(seq += 1)}`;
    await staffAuth.createStaff(username, 'pass', role);
    return (await staffAuth.login(username, 'pass')).accessToken;
  }

  it('owner may create staff; seller is refused (403); anon is refused (401)', async () => {
    const owner = await login('owner');
    const seller = await login('seller');
    const server = app.getHttpServer();

    const created = await request(server)
      .post('/staff-auth/staff')
      .set('Authorization', `Bearer ${owner}`)
      .send({ username: `new-${RUN}`, password: 'p', role: 'cashier', point: 'OSH-1' })
      .expect(201);
    expect(created.body).toMatchObject({ role: 'cashier', point: 'OSH-1' });

    await request(server)
      .post('/staff-auth/staff')
      .set('Authorization', `Bearer ${seller}`)
      .send({ username: `nope-${RUN}`, password: 'p', role: 'cashier' })
      .expect(403);

    await request(server)
      .post('/staff-auth/staff')
      .send({ username: `anon-${RUN}`, password: 'p', role: 'cashier' })
      .expect(401);
  });

  it('me returns the authenticated staff principal', async () => {
    const admin = await login('admin');
    const res = await request(app.getHttpServer())
      .get('/staff-auth/me')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(res.body.role).toBe('admin');
    expect(res.body.typ).toBe('staff');
  });

  it('supports Web HttpOnly staff session rotation without returning refreshToken', async () => {
    const username = `web-staff-${RUN}`;
    await staffAuth.createStaff(username, 'pass', 'admin');
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/staff-auth/login')
      .set('x-alistore-staff-web', '1')
      .send({ username, password: 'pass' })
      .expect(201);
    expect(login.body).not.toHaveProperty('refreshToken');
    const oldCookies = (login.headers['set-cookie'] as unknown as string[])
      .map((cookie) => cookie.split(';', 1)[0])
      .join('; ');
    expect(oldCookies).toContain('alistore_staff_access=');
    expect(oldCookies).toContain('alistore_staff_refresh=');
    expect(oldCookies).toContain('alistore_staff_session_hint=1');

    const rotated = await request(server)
      .post('/staff-auth/refresh')
      .set('x-alistore-staff-web', '1')
      .set('Cookie', oldCookies)
      .send({})
      .expect(201);
    expect(rotated.body).not.toHaveProperty('refreshToken');
    await request(server)
      .get('/staff-auth/me')
      .set('x-alistore-staff-web', '1')
      .set('Cookie', oldCookies)
      .expect(200);

    await request(server)
      .post('/staff-auth/refresh')
      .set('x-alistore-staff-web', '1')
      .set('Cookie', oldCookies)
      .send({})
      .expect(422);
  });

  it('bootstrap is refused once staff already exist', async () => {
    await login('owner'); // ensure at least one staff row exists
    await request(app.getHttpServer())
      .post('/staff-auth/bootstrap')
      .send({ username: `boot-${RUN}`, password: 'p' })
      .expect(422);
  });
});
