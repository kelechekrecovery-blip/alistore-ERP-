import { authenticator } from 'otplib';
import { TotpService } from '../src/auth/totp.service';

/** 2FA TOTP helper (pure, no DB). */
describe('TOTP 2FA', () => {
  const totp = new TotpService();

  it('verifies a token generated for the same secret', () => {
    const secret = totp.generateSecret();
    const token = authenticator.generate(secret);
    expect(totp.verify(token, secret)).toBe(true);
  });

  it('rejects a token generated for a different secret', () => {
    const token = authenticator.generate(totp.generateSecret());
    expect(totp.verify(token, totp.generateSecret())).toBe(false);
  });

  it('produces an otpauth:// provisioning URI', () => {
    const uri = totp.keyUri('+996700000000', 'AliStore', totp.generateSecret());
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('AliStore');
  });
});
