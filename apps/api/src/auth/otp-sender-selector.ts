import { NoopOtpSender } from './noop-otp.sender';
import { OtpSender } from './otp-sender';
import { ProductionOtpSender } from './production-otp.sender';

export type OtpEnvReader = (name: string) => string | undefined;

export function selectOtpSender(env: OtpEnvReader): OtpSender {
  const mode = env('SMS_PROVIDER')?.trim().toLowerCase();
  if (!mode || mode === 'noop') {
    if (env('NODE_ENV') === 'production') {
      throw new Error('SMS_PROVIDER is required in production');
    }
    return new NoopOtpSender();
  }
  if (mode !== 'production') {
    throw new Error(`Unsupported SMS_PROVIDER: ${mode}`);
  }
  const options = {
    apiUrl: value(env, 'SMS_API_URL'),
    apiKey: value(env, 'SMS_API_KEY'),
    senderId: value(env, 'SMS_SENDER_ID'),
  };
  const missing = Object.entries(options).filter(([, item]) => !item).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Incomplete production SMS configuration: ${missing.join(', ')}`);
  }
  return new ProductionOtpSender(options);
}

function value(env: OtpEnvReader, name: string): string {
  return env(name)?.trim() ?? '';
}
