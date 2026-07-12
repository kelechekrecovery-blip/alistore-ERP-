import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';

export type GuestCapabilityScope =
  | 'orders:create'
  | 'payments:intent'
  | 'payments:gift_card'
  | 'support:create'
  | 'warranty:create'
  | 'tradeins:create'
  | 'evidence:write';

interface GuestCapabilityClaims {
  sub: string;
  typ: 'guest_capability';
  scopes: GuestCapabilityScope[];
  iat?: number;
  exp?: number;
}

const ISSUER = 'alistore-api';
const AUDIENCE = 'alistore-guest-checkout';
const DEV_SECRET = 'dev-insecure-change-me';

function secret(): string {
  return process.env.JWT_SECRET ?? DEV_SECRET;
}

export function issueGuestCheckoutCapability(customerId: string): string {
  return sign(
    {
      sub: customerId,
      typ: 'guest_capability',
      scopes: [
        'orders:create',
        'payments:intent',
        'payments:gift_card',
        'support:create',
        'warranty:create',
        'tradeins:create',
        'evidence:write',
      ],
    } satisfies Omit<GuestCapabilityClaims, 'iat' | 'exp'>,
    secret(),
    { issuer: ISSUER, audience: AUDIENCE, expiresIn: '30m' },
  );
}

export function requireGuestCapability(
  token: string | undefined,
  scope: GuestCapabilityScope,
  customerId?: string,
): GuestCapabilityClaims {
  if (!token) throw new UnauthorizedException('guest_capability_required');
  let claims: GuestCapabilityClaims;
  try {
    claims = verify(token, secret(), { issuer: ISSUER, audience: AUDIENCE }) as GuestCapabilityClaims;
  } catch {
    throw new UnauthorizedException('guest_capability_invalid');
  }
  if (claims.typ !== 'guest_capability' || !Array.isArray(claims.scopes) || !claims.scopes.includes(scope)) {
    throw new ForbiddenException('guest_capability_scope_denied');
  }
  if (customerId && claims.sub !== customerId) {
    throw new ForbiddenException('guest_capability_owner_mismatch');
  }
  return claims;
}
