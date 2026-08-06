import { OtpSender, SendOtpInput } from './otp-sender';
export interface AndroidGatewayOtpSenderOptions {
    url: string;
    username: string;
    password: string;
    passphrase: string;
}
export declare class AndroidGatewayOtpSender implements OtpSender {
    private readonly options;
    readonly name: "android_gateway";
    constructor(options: AndroidGatewayOtpSenderOptions);
    assertOperational(): void;
    send(input: SendOtpInput): Promise<void>;
    private unavailable;
}
