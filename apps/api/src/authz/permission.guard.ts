import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthzService } from './authz.service';
import { PERMISSION_KEY, RequiredPermission } from './require-permission.decorator';

/**
 * Enforces @RequirePermission using the caller's role (request.user.role) against
 * the casbin policy. Handlers without the decorator pass through. Ready to guard
 * approval/refund/write-off endpoints once staff auth puts a role in the JWT.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();
    const role = request.user?.role;
    if (!role || !(await this.authz.can(role, required.resource, required.action))) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
    return true;
  }
}
