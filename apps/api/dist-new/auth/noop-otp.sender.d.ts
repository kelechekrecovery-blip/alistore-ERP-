import { OtpSender, SendOtpInput } from './otp-sender';
export declare class NoopOtpSender implements OtpSender {
    readonly name: "noop";
    assertOperational(): void;
    send(_input: SendOtpInput): Promise<void>;
}
