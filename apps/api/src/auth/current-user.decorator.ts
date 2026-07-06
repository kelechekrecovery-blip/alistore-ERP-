import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthPrincipal } from './jwt.strategy';

/** Injects the authenticated principal resolved by JwtStrategy.validate(). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>();
    return request.user;
  },
);
