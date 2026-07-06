import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

/**
 * Rate limiting on the OTP endpoints (anti SMS-bomb / cost abuse). Boots the REAL
 * AuthController with a mocked AuthService (no DB) and asserts the 4th
 * /auth/otp/request within the window is rejected with 429.
 */
describe('Auth throttling', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            requestOtp: async () => ({ challengeId: 'stub' }),
            verifyOtp: async () => ({}),
            refresh: async () => ({}),
            logout: async () => undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 3 OTP requests then returns 429 on the 4th', async () => {
    const server = app.getHttpServer();
    const body = { phone: '+996700000000' };
    for (let i = 0; i < 3; i += 1) {
      await request(server).post('/auth/otp/request').send(body).expect(201);
    }
    await request(server).post('/auth/otp/request').send(body).expect(429);
  });
});
