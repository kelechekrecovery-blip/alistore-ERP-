import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Authenticates when a Bearer token is present, but allows anonymous reads when it
 * is absent. Useful for role-aware response shaping such as PII masking.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user;
  }
}
