import { OtpSender, SendOtpInput } from './otp-sender';
export interface ProductionOtpSenderOptions {
    apiUrl: string;
    apiKey: string;
    senderId: string;
}
export declare class ProductionOtpSender implements OtpSender {
    private readonly options;
    readonly name: "production";
    constructor(options: ProductionOtpSenderOptions);
    assertOperational(): void;
    send(_input: SendOtpInput): Promise<void>;
    isConfigured(): boolean;
    private unavailable;
}
