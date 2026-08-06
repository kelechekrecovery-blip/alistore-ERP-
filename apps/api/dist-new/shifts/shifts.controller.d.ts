import { ShiftsService } from './shifts.service';
import { CloseShiftDto, HandoverShiftDto, OpenShiftDto } from './shifts.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
export declare class ShiftsController {
    private readonly shifts;
    private readonly staffAuth;
    constructor(shifts: ShiftsService, staffAuth: StaffAuthService);
    current(user: AuthPrincipal, _staffId?: string): Promise<{
        id: string;
        point: string;
        closedAt: Date | null;
        staffId: string;
        openCash: number;
        closeCash: number | null;
        closeReason: string | null;
        openIdempotencyKey: string | null;
        closeIdempotencyKey: string | null;
        diff: number | null;
        openedAt: Date;
    } | null>;
    openShifts(user: AuthPrincipal, point?: string): Promise<{
        shifts: {
            staff: {
                id: string;
                username: string;
                role: import(".prisma/client").$Enums.Role;
            } | null;
            id: string;
            point: string;
            closedAt: Date | null;
            staffId: string;
            openCash: number;
            closeCash: number | null;
            closeReason: string | null;
            openIdempotencyKey: string | null;
            closeIdempotencyKey: string | null;
            diff: number | null;
            openedAt: Date;
        }[];
        staff: {
            id: string;
            username: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
    }>;
    handoverTargets(user: AuthPrincipal): Promise<{
        id: string;
        username: string;
        role: import(".prisma/client").$Enums.Role;
    }[]>;
    get(user: AuthPrincipal, id: string): Promise<{
        id: string;
        point: string;
        closedAt: Date | null;
        staffId: string;
        openCash: number;
        closeCash: number | null;
        closeReason: string | null;
        openIdempotencyKey: string | null;
        closeIdempotencyKey: string | null;
        diff: number | null;
        openedAt: Date;
    }>;
    open(user: AuthPrincipal, idempotencyKey: string | undefined, dto: OpenShiftDto): Promise<{
        id: string;
        point: string;
        closedAt: Date | null;
        staffId: string;
        openCash: number;
        closeCash: number | null;
        closeReason: string | null;
        openIdempotencyKey: string | null;
        closeIdempotencyKey: string | null;
        diff: number | null;
        openedAt: Date;
    }>;
    close(user: AuthPrincipal, id: string, idempotencyKey: string | undefined, dto: CloseShiftDto): Promise<{
        expected: number;
        id: string;
        point: string;
        closedAt: Date | null;
        staffId: string;
        openCash: number;
        closeCash: number | null;
        closeReason: string | null;
        openIdempotencyKey: string | null;
        closeIdempotencyKey: string | null;
        diff: number | null;
        openedAt: Date;
    }>;
    handover(user: AuthPrincipal, id: string, idempotencyKey: string | undefined, dto: HandoverShiftDto): Promise<{
        handover: {
            id: string;
            idempotencyKey: string;
            point: string;
            createdBy: string;
            createdAt: Date;
            reason: string | null;
            diff: number;
            toStaffId: string;
            countedCash: number;
            expectedCash: number;
            fromShiftId: string;
            toShiftId: string;
            fromStaffId: string;
        };
        targetShift: {
            id: string;
            point: string;
            closedAt: Date | null;
            staffId: string;
            openCash: number;
            closeCash: number | null;
            closeReason: string | null;
            openIdempotencyKey: string | null;
            closeIdempotencyKey: string | null;
            diff: number | null;
            openedAt: Date;
        };
    }>;
}
