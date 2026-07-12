import { NoopOtpSender } from '../src/auth/noop-otp.sender';
import { selectOtpSender } from '../src/auth/otp-sender-selector';
import { ProductionOtpSender } from '../src/auth/production-otp.sender';

describe('OTP sender selector', () => {
  const select = (values: Record<string, string> = {}) => selectOtpSender((name) => values[name]);

  it('uses a silent noop sender only outside production', () => {
    expect(select()).toBeInstanceOf(NoopOtpSender);
    expect(select({ SMS_PROVIDER: 'noop' })).toBeInstanceOf(NoopOtpSender);
    expect(() => select({ NODE_ENV: 'production' })).toThrow('SMS_PROVIDER is required');
  });

  it('fails closed for unknown or incomplete production SMS configuration', () => {
    expect(() => select({ SMS_PROVIDER: 'unknown' })).toThrow('Unsupported SMS_PROVIDER');
    expect(() => select({ SMS_PROVIDER: 'production', SMS_API_KEY: 'secret' }))
      .toThrow('Incomplete production SMS configuration');
  });

  it('selects the fail-visible production sender only for a complete env set', () => {
    expect(select({
      SMS_PROVIDER: 'production',
      SMS_API_URL: 'https://sms.example.test',
      SMS_API_KEY: 'secret',
      SMS_SENDER_ID: 'AliStore',
    })).toBeInstanceOf(ProductionOtpSender);
  });
});
