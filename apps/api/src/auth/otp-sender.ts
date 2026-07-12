export const OTP_SENDER = Symbol('OTP_SENDER');

export interface SendOtpInput {
  phone: string;
  code: string;
  purpose: 'login' | 'recovery';
  expiresInSeconds: number;
}

export interface OtpSender {
  readonly name: 'noop' | 'production';
  assertOperational(): void;
  send(input: SendOtpInput): Promise<void>;
}
