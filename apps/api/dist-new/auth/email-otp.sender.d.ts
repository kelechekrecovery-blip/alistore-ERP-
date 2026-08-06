export declare const EMAIL_OTP_SENDER: unique symbol;
export type EmailOtpPurpose = 'login' | 'email_attach';
export interface SendEmailOtpInput {
    email: string;
    code: string;
    purpose: EmailOtpPurpose;
    expiresInSeconds: number;
}
export interface EmailOtpSender {
    readonly name: 'noop' | 'smtp';
    assertOperational(): void;
    send(input: SendEmailOtpInput): Promise<void>;
}
export declare class NoopEmailOtpSender implements EmailOtpSender {
    readonly name: "noop";
    assertOperational(): void;
    send(): Promise<void>;
}
