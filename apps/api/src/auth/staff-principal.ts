import { ForbiddenException } from '@nestjs/common';
import { AuthPrincipal } from './jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

/** Resolve and validate an active staff session from a JWT principal. */
export async function requireActiveStaff(
  user: AuthPrincipal,
  staffAuth: StaffAuthService,
): Promise<string> {
  if (user.typ !== 'staff' || !user.role) {
    throw new ForbiddenException('Требуется staff JWT');
  }
  await staffAuth.me(user.customerId);
  return user.customerId;
}
