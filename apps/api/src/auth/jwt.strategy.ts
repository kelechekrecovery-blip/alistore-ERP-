import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { isActiveCustomer } from './customer-session';
import { resolveJwtSecret } from './jwt-secret';
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
  sessionVersion?: number;
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
    if (payload.typ !== 'customer' && payload.typ !== 'staff') {
      throw new UnauthorizedException('access_token_required');
    }
    if (payload.typ === 'customer') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
        select: { phone: true },
      });
      if (!isActiveCustomer(customer)) {
        throw new UnauthorizedException('customer_session_revoked');
      }
    } else {
      const staff = await this.prisma.staffUser.findUnique({
        where: { id: payload.sub },
        select: { active: true, role: true, point: true, sessionVersion: true },
      });
      if (
        !staff?.active
        || payload.role !== staff.role
        || payload.point !== staff.point
        || (payload.sessionVersion ?? 0) !== staff.sessionVersion
      ) {
        throw new UnauthorizedException('staff_session_revoked');
      }
    }
    return {
      customerId: payload.sub,
      phone: payload.phone,
      typ: payload.typ,
      role: payload.role,
      point: payload.point,
      storePointId: payload.storePointId,
    };
  }
}
