import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from './jwt-secret';

export interface JwtPayload {
  sub: string;
  phone: string;
  typ: string;
}

/** What `request.user` becomes after a valid access token. */
export interface AuthPrincipal {
  customerId: string;
  phone: string;
  typ: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  validate(payload: JwtPayload): AuthPrincipal {
    return { customerId: payload.sub, phone: payload.phone, typ: payload.typ };
  }
}
