import { AuthPrincipal } from './jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
export declare function requireActiveStaff(user: AuthPrincipal, staffAuth: StaffAuthService): Promise<string>;
