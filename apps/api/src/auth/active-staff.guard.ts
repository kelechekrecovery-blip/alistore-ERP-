import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthPrincipal } from './jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

/** Ensures a staff JWT still maps to an active StaffUser row. */
@Injectable()
export class ActiveStaffGuard implements CanActivate {
  constructor(private readonly staffAuth: StaffAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (user?.typ !== 'staff' || !user.role) {
      throw new ForbiddenException('Требуется staff JWT');
    }
    await this.staffAuth.me(user.customerId);
    return true;
  }
}
