import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from './jwt-secret';
import { PrismaService } from '../prisma/prisma.service';
import { isActiveCustomerPhone } from './customer-session-state';
import {
  isStaffWebSessionRequest,
  isWebSessionRequest,
  readWebCookie,
  STAFF_ACCESS_COOKIE,
  WEB_ACCESS_COOKIE,
} from './web-session';

export interface JwtPayload {
  sub: string;
  phone?: string;
  typ: string;
  role?: string; // staff tokens carry a role for authorization
  point?: string;
  storePointId?: string;
}

/** What `request.user` becomes after a valid access token. */
export interface AuthPrincipal {
  customerId: string;
  phone?: string;
  typ: string;
  role?: string;
  point?: string;
  storePointId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: (request) => {
        const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
        if (bearer) return bearer;
        if (isStaffWebSessionRequest(request)) return readWebCookie(request, STAFF_ACCESS_COOKIE) ?? null;
        return isWebSessionRequest(request) ? (readWebCookie(request, WEB_ACCESS_COOKIE) ?? null) : null;
      },
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    // Только access-токены. Гостевой capability подписан тем же секретом, но
    // несёт `typ: 'guest_capability'` и узкий scope; без этой проверки он
    // проходил `JwtAuthGuard` как полноценный `request.user`. Тот же контракт
    // уже стоит на WebSocket-пути (`auth.service.ts` verifyAccessToken) —
    // HTTP-путь его не имел.
    if (!payload.sub || (payload.typ !== 'customer' && payload.typ !== 'staff')) {
      throw new UnauthorizedException('access_token_required');
    }
    let phone = payload.phone;
    if (payload.typ === 'customer') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
        select: { phone: true },
      });
      if (!customer || !isActiveCustomerPhone(customer.phone)) {
        throw new UnauthorizedException('customer_session_revoked');
      }
      phone = customer.phone;
    }
    return {
      customerId: payload.sub,
      phone,
      typ: payload.typ,
      role: payload.role,
      point: payload.point,
      storePointId: payload.storePointId,
    };
  }
}
