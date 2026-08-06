import type { Request, Response } from 'express';
import { StaffAuthService } from './staff-auth.service';
import { BootstrapOwnerDto, ChangeStaffRoleDto, CreateStaffDto, ResetStaffPasswordDto, StaffLoginDto, StaffTotpTokenDto } from './staff-auth.dto';
import { RefreshDto } from '../auth/auth.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class StaffAuthController {
    private readonly staffAuth;
    constructor(staffAuth: StaffAuthService);
    bootstrapStatus(): Promise<{
        needsBootstrap: boolean;
    }>;
    bootstrap(dto: BootstrapOwnerDto): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    private assertBootstrapAvailable;
    login(dto: StaffLoginDto, request: Request, response: Response): Promise<{
        accessToken: string;
        staffId: string;
        username: string;
        role: import(".prisma/client").Role;
        point: string;
        storePoint: {
            id: string;
            code: string;
            name: string;
            inventoryLocation: string;
        };
        totpEnabled: boolean;
    }>;
    refresh(dto: RefreshDto, request: Request, response: Response): Promise<{
        accessToken: string;
        staffId: string;
        username: string;
        role: import(".prisma/client").Role;
        point: string;
        storePoint: {
            id: string;
            code: string;
            name: string;
            inventoryLocation: string;
        };
        totpEnabled: boolean;
    }>;
    logout(dto: RefreshDto, request: Request, response: Response): Promise<void>;
    createStaff(dto: CreateStaffDto): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    me(user: AuthPrincipal): Promise<{
        typ: string;
        storePoint: {
            id: string;
            code: string;
            name: string;
            inventoryLocation: string;
        };
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    setupTotp(user: AuthPrincipal): Promise<{
        secret: string;
        otpauthUrl: string;
        totpEnabled: boolean;
    }>;
    enableTotp(user: AuthPrincipal, dto: StaffTotpTokenDto): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    disableTotp(user: AuthPrincipal, dto: StaffTotpTokenDto): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    resetTotp(user: AuthPrincipal, id: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    deactivate(user: AuthPrincipal, id: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    listStaff(): Promise<{
        id: string;
        point: string;
        active: boolean;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        totpEnabled: boolean;
    }[]>;
    changeRole(user: AuthPrincipal, id: string, dto: ChangeStaffRoleDto): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    reactivate(user: AuthPrincipal, id: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    resetPassword(user: AuthPrincipal, id: string, dto: ResetStaffPasswordDto): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    private publicView;
    private assertStaff;
}
