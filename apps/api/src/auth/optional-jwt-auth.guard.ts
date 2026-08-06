import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  isStaffWebSessionRequest,
  isWebSessionRequest,
  readWebCookie,
  STAFF_ACCESS_COOKIE,
  WEB_ACCESS_COOKIE,
} from './web-session';

/**
 * Authenticates when a Bearer token or an explicitly marked Web cookie session is
 * present, but allows anonymous reads when credentials are absent. Useful for
 * role-aware response shaping such as PII masking.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string; cookie?: string; [key: string]: string | string[] | undefined };
    }>();
    const hasBearer = Boolean(request.headers.authorization);
    const hasStaffSession = isStaffWebSessionRequest(request)
      && Boolean(readWebCookie(request, STAFF_ACCESS_COOKIE));
    const hasCustomerSession = isWebSessionRequest(request)
      && Boolean(readWebCookie(request, WEB_ACCESS_COOKIE));
    if (!hasBearer && !hasStaffSession && !hasCustomerSession) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user;
  }
}
