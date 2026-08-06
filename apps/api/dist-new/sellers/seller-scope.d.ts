import type { AuthPrincipal } from '../auth/jwt.strategy';
export declare function sellerScopeFor(principal: AuthPrincipal): string | null;
export declare function sellerProductWhere(scope: string | null): {
    sellerId?: string;
};
