interface PosCustomerBindingClaims {
    sub: string;
    typ: 'pos_customer_binding';
    staffId: string;
    point: string;
    clientSaleId: string;
    iat?: number;
    exp?: number;
}
export declare function issuePosCustomerBinding(customerId: string, staffId: string, point: string, clientSaleId: string, expiresInSeconds?: number): string;
export declare function requirePosCustomerBinding(token: string | undefined, staffId: string, point: string, clientSaleId: string | undefined, options?: {
    allowExpiredReplay?: boolean;
}): PosCustomerBindingClaims;
export {};
