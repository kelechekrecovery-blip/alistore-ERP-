import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { CloseShiftDto, HandoverShiftDto, OpenShiftDto } from './shifts.dto';
export declare const BLIND_COUNT_REASON = "\u0421\u043B\u0435\u043F\u043E\u0439 \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u043A\u0430\u0441\u0441\u044B";
export declare class ShiftsService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    static readonly BLIND_COUNT_REASON = "\u0421\u043B\u0435\u043F\u043E\u0439 \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u043A\u0430\u0441\u0441\u044B";
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    getForStaff(id: string, staffId: string, role: string | undefined): Promise<{
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
    currentOpen(staffId: string): Prisma.Prisma__CashShiftClient<{
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
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    openShifts(point: string | undefined, staffId: string, role: string | undefined, staffPoint?: string): Promise<{
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
    open(dto: OpenShiftDto, actor: string, idempotencyKey?: string): Promise<{
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
    private expectedCash;
    private assertNoPendingCashRefunds;
    private assertOwnerOrManager;
    private closeReason;
    close(shiftId: string, dto: CloseShiftDto, actor: string, idempotencyKey?: string, actorRole?: string): Promise<{
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
    handover(shiftId: string, dto: HandoverShiftDto, actor: string, actorRole: string | undefined, rawKey?: string): Promise<{
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
