export type GuestCapabilityScope = 'orders:create' | 'orders:read' | 'receipts:read' | 'payments:intent' | 'payments:gift_card' | 'support:create' | 'warranty:create' | 'tradeins:create' | 'evidence:write' | 'evidence:read';
interface GuestCapabilityClaims {
    sub: string;
    typ: 'guest_capability';
    scopes: GuestCapabilityScope[];
    entity?: {
        type: 'order';
        id: string;
    };
    iat?: number;
    exp?: number;
}
export declare function issueGuestCheckoutCapability(customerId: string): string;
export declare function issueGuestOrderCapability(customerId: string, orderId: string, expiresInSeconds?: number): string;
export declare function guestOrderCapabilityTtlSeconds(): number;
export declare function requireGuestCapability(token: string | undefined, scope: GuestCapabilityScope, customerId?: string, entity?: {
    type: 'order';
    id: string;
}): GuestCapabilityClaims;
export {};
