export declare class TotpService {
    generateSecret(): string;
    keyUri(account: string, issuer: string, secret: string): string;
    verify(token: string, secret: string): boolean;
}
