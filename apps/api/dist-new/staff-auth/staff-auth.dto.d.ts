import { Role } from '@prisma/client';
export declare class StaffLoginDto {
    username: string;
    password: string;
    totp?: string;
}
export declare class BootstrapOwnerDto {
    username: string;
    password: string;
    point?: string;
}
export declare class CreateStaffDto {
    username: string;
    password: string;
    role: Role;
    point: string;
}
export declare class ChangeStaffRoleDto {
    role: Role;
}
export declare class ResetStaffPasswordDto {
    password: string;
}
export declare class StaffTotpTokenDto {
    token: string;
}
