export const OTP_SENDER = Symbol('OTP_SENDER');

export interface SendOtpInput {
  phone: string;
  code: string;
  purpose: 'login' | 'recovery';
  expiresInSeconds: number;
}

export interface OtpSender {
  // `android_gateway` — мост через телефон с обычной SIM, намеренно отдельное
  // имя от `production`: preflight и readiness не должны выдавать его за
  // сертифицированного оператора.
  readonly name: 'noop' | 'production' | 'disabled' | 'android_gateway';
  assertOperational(): void;
  send(input: SendOtpInput): Promise<void>;
}
