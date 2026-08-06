import { OtpSender, SendOtpInput } from './otp-sender';
export declare class DisabledOtpSender implements OtpSender {
    readonly name: "disabled";
    assertOperational(): void;
    send(_input: SendOtpInput): Promise<void>;
    private unavailable;
}
