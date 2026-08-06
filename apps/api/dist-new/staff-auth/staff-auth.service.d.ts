import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, StaffUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TotpService } from '../auth/totp.service';
import { AuditService } from '../audit/audit.service';
type StaffStorePoint = {
    id: string;
    code: string;
    name: string;
    inventoryLocation: string;
};
export interface StaffTokens {
    accessToken: string;
    refreshToken: string;
    staffId: string;
    username: string;
    role: Role;
    point: string;
    storePoint: StaffStorePoint;
    totpEnabled: boolean;
}
export declare class StaffAuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly totp;
    private readonly audit?;
    constructor(prisma: PrismaService, jwt: JwtService, totp: TotpService, audit?: AuditService | undefined);
    createStaff(username: string, password: string, role: Role, point?: string): Promise<{
        id: string;
        point: string;
        createdAt: Date;
        active: boolean;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        passwordHash: string;
        totpSecret: string | null;
        totpEnabled: boolean;
        totpLastToken: string | null;
    }>;
    needsBootstrap(): Promise<boolean>;
    bootstrapOwner(username: string, password: string, point?: string): Promise<{
        id: string;
        point: string;
        createdAt: Date;
        active: boolean;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        passwordHash: string;
        totpSecret: string | null;
        totpEnabled: boolean;
        totpLastToken: string | null;
    }>;
    login(username: string, password: string, totp?: string): Promise<StaffTokens>;
    private assertLoginTotp;
    refresh(refreshToken: string): Promise<StaffTokens>;
    logout(refreshToken: string): Promise<void>;
    private issueTokens;
    private hashToken;
    me(staffId: string): Promise<{
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
    setupTotp(staffId: string): Promise<{
        secret: string;
        otpauthUrl: string;
        totpEnabled: boolean;
    }>;
    enableTotp(staffId: string, token: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    disableTotp(staffId: string, token: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    resetTotpByAdmin(actorId: string, targetStaffId: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    deactivateStaff(actorId: string, targetStaffId: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    changeRole(actorId: string, targetStaffId: string, role: Role): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    reactivateStaff(actorId: string, targetStaffId: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    }>;
    resetPasswordByAdmin(actorId: string, targetStaffId: string, password: string): Promise<{
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
    handoverTargets(point: string, excludeStaffId: string): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
    }[]>;
    verifyStepUp(staffId: string, token?: string): Promise<void>;
    verifyStepUpOnTx(tx: Prisma.TransactionClient, staffId: string, token?: string): Promise<void>;
    private getActiveStaff;
    private auditLedger;
    publicView(staff: StaffUser): {
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
        point: string;
        active: boolean;
        totpEnabled: boolean;
    };
}
export {};
