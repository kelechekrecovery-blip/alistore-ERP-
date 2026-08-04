import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { OtpSender, SendOtpInput } from '../src/auth/otp-sender';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth OTP sender integration', () => {
  const config = { get: (name: string) => name === 'AUTH_OTP_DEV_ECHO' ? 'true' : undefined } as ConfigService;
  const jwt = {} as JwtService;

  it('delivers the plaintext code through the port while storing only its hash', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'challenge-1' });
    const sent: SendOtpInput[] = [];
    const sender: OtpSender = {
      name: 'noop',
      assertOperational: () => undefined,
      send: async (input) => { sent.push(input); },
    };
    const prisma = { otpChallenge: { create, delete: jest.fn() } } as unknown as PrismaService;
    const auth = new AuthService(prisma, jwt, config, sender);

    const result = await auth.requestOtp('+996700000001', 'recovery');

    expect(result.devCode).toMatch(/^\d{6}$/);
    expect(sent).toEqual([expect.objectContaining({
      phone: '+996700000001',
      code: result.devCode,
      purpose: 'recovery',
      expiresInSeconds: 300,
    })]);
    expect(create.mock.calls[0][0].data.codeHash).not.toBe(result.devCode);
  });

  it('removes the challenge when delivery fails', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      otpChallenge: {
        create: jest.fn().mockResolvedValue({ id: 'challenge-failed' }),
        delete: remove,
      },
    } as unknown as PrismaService;
    const sender: OtpSender = {
      name: 'production',
      assertOperational: () => undefined,
      send: async () => { throw new Error('sms unavailable'); },
    };
    const auth = new AuthService(prisma, jwt, config, sender);

    await expect(auth.requestOtp('+996700000002')).rejects.toThrow('sms unavailable');
    expect(remove).toHaveBeenCalledWith({ where: { id: 'challenge-failed' } });
  });
});
