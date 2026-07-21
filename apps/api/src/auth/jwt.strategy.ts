import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
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
}

/** What `request.user` becomes after a valid access token. */
export interface AuthPrincipal {
  customerId: string;
  phone?: string;
  typ: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
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

  validate(payload: JwtPayload): AuthPrincipal {
    return {
      customerId: payload.sub,
      phone: payload.phone,
      typ: payload.typ,
      role: payload.role,
    };
  }
}
