import { ConfigService } from '@nestjs/config';
import { EmailOtpSender, SendEmailOtpInput } from './email-otp.sender';
export declare class SmtpEmailOtpSender implements EmailOtpSender {
    readonly name: "smtp";
    private readonly transporter;
    private readonly from;
    private readonly configured;
    constructor(config: ConfigService);
    assertOperational(): void;
    buildMail(input: SendEmailOtpInput): {
        from: string;
        to: string;
        subject: string;
        text: string;
    };
    send(input: SendEmailOtpInput): Promise<void>;
}
