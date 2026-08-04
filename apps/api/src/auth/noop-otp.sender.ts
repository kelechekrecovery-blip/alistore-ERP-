import { OtpSender, SendOtpInput } from './otp-sender';

/** Local/test sender. It intentionally does not log or persist the plaintext code. */
export class NoopOtpSender implements OtpSender {
  readonly name = 'noop' as const;
  assertOperational(): void {}
  async send(_input: SendOtpInput): Promise<void> {}
}
