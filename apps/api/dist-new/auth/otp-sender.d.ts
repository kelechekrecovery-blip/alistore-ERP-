export declare const OTP_SENDER: unique symbol;
export interface SendOtpInput {
    phone: string;
    code: string;
    purpose: 'login' | 'recovery';
    expiresInSeconds: number;
}
export interface OtpSender {
    readonly name: 'noop' | 'production' | 'disabled' | 'android_gateway';
    assertOperational(): void;
    send(input: SendOtpInput): Promise<void>;
}
