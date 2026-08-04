import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';

interface PosCustomerBindingClaims {
  sub: string;
  typ: 'pos_customer_binding';
  staffId: string;
  point: string;
  clientSaleId: string;
  iat?: number;
  exp?: number;
}

const ISSUER = 'alistore-api';
const AUDIENCE = 'alistore-pos';
const DEV_SECRET = 'dev-insecure-change-me';

function secret(): string {
  return process.env.JWT_SECRET ?? DEV_SECRET;
}

function normalizedPoint(point: string): string {
  return point.trim().toUpperCase();
}

export function issuePosCustomerBinding(
  customerId: string,
  staffId: string,
  point: string,
  clientSaleId: string,
  expiresInSeconds = 24 * 60 * 60,
): string {
  return sign(
    {
      sub: customerId,
      typ: 'pos_customer_binding',
      staffId,
      point: normalizedPoint(point),
      clientSaleId,
    } satisfies Omit<PosCustomerBindingClaims, 'iat' | 'exp'>,
    secret(),
    { issuer: ISSUER, audience: AUDIENCE, expiresIn: expiresInSeconds },
  );
}

export function requirePosCustomerBinding(
  token: string | undefined,
  staffId: string,
  point: string,
  clientSaleId: string | undefined,
  options: { allowExpiredReplay?: boolean } = {},
): PosCustomerBindingClaims {
  if (!token) throw new UnauthorizedException('pos_customer_binding_required');
  let claims: PosCustomerBindingClaims;
  try {
    claims = verify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      ignoreExpiration: options.allowExpiredReplay === true,
    }) as PosCustomerBindingClaims;
  } catch {
    throw new UnauthorizedException('pos_customer_binding_invalid');
  }
  if (claims.typ !== 'pos_customer_binding') {
    throw new ForbiddenException('pos_customer_binding_scope_denied');
  }
  if (claims.staffId !== staffId) {
    throw new ForbiddenException('pos_customer_binding_staff_mismatch');
  }
  if (claims.point !== normalizedPoint(point)) {
    throw new ForbiddenException('pos_customer_binding_point_mismatch');
  }
  if (!clientSaleId || claims.clientSaleId !== clientSaleId) {
    throw new ForbiddenException('pos_customer_binding_sale_mismatch');
  }
  return claims;
}
