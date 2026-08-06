import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { AppleSocialLoginDto, VerifyEmailOtpDto, VerifyOtpDto } from '../src/auth/auth.dto';

function validateDto(Dto: ClassConstructor<object>, input: object) {
  return validate(plainToInstance(Dto, input));
}

describe('Auth OTP DTO validation', () => {
  it.each([
    ['phone', VerifyOtpDto, { phone: '+996700000000', code: 'A2b3C4' }],
    ['email', VerifyEmailOtpDto, { email: 'reviewer@example.test', code: '12 345' }],
  ])('rejects a non-numeric six-character %s code', async (_kind, Dto, input) => {
    const errors = await validateDto(Dto, input);
    expect(errors.some((error) => error.property === 'code')).toBe(true);
  });

  it.each([
    ['phone', VerifyOtpDto, { phone: '+996700000000', code: '123456' }],
    ['email', VerifyEmailOtpDto, { email: 'reviewer@example.test', code: '123456' }],
  ])('accepts an exact six-digit %s code', async (_kind, Dto, input) => {
    await expect(validateDto(Dto, input)).resolves.toEqual([]);
  });
});

describe('Apple social DTO validation', () => {
  const base = { identityToken: 'header.payload.signature', nonce: 'hashed-nonce' };

  it.each([undefined, null, '', 42])('rejects an invalid authorization code %p', async (authorizationCode) => {
    const errors = await validateDto(AppleSocialLoginDto, { ...base, authorizationCode });
    expect(errors.some((error) => error.property === 'authorizationCode')).toBe(true);
  });

  it('accepts a non-empty authorization code', async () => {
    await expect(validateDto(AppleSocialLoginDto, {
      ...base,
      authorizationCode: 'short-lived-apple-code',
    })).resolves.toEqual([]);
  });
});
