export declare const DEFAULT_SMS_GATEWAY_ITERATIONS = 75000;
export interface EncryptGatewayFieldOptions {
    iterations?: number;
    salt?: Buffer;
}
export declare function encryptGatewayField(cleartext: string, passphrase: string, options?: EncryptGatewayFieldOptions): string;
