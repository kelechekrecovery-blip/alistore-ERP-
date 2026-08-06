import { CanActivate, ExecutionContext } from '@nestjs/common';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
export declare class ActiveStaffGuard implements CanActivate {
    private readonly staffAuth;
    constructor(staffAuth: StaffAuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
