import { AuthPrincipal } from '../auth/jwt.strategy';
import { CancelHrScheduleDto, CreateHrScheduleDto, DecideHrAbsenceDto, HrPayrollQueryDto, HrWeekQueryDto, OpenHrAttendanceDto, PayHrPayrollDto, RequestHrAbsenceDto, UpdateHrScheduleDto } from './hr.dto';
import { HrService } from './hr.service';
export declare class HrController {
    private readonly hr;
    constructor(hr: HrService);
    week(query: HrWeekQueryDto): Promise<{
        weekStart: Date;
        weekEnd: Date;
        point: string | null;
        staff: {
            id: string;
            active: boolean;
            username: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
        schedules: ({
            attendance: {
                id: string;
                point: string;
                createdAt: Date;
                updatedAt: Date;
                staffId: string;
                scheduleId: string;
                checkedInAt: Date;
                checkedOutAt: Date | null;
                checkInKey: string;
                checkOutKey: string | null;
            } | null;
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            createdBy: string;
            createdAt: Date;
            updatedAt: Date;
            staffId: string;
            startsAt: Date;
            endsAt: Date;
            shiftDate: Date;
            cancelledAt: Date | null;
            cancelledBy: string | null;
            cancelReason: string | null;
        })[];
        absences: {
            id: string;
            type: import(".prisma/client").$Enums.HrAbsenceType;
            idempotencyKey: string;
            createdBy: string;
            status: import(".prisma/client").$Enums.HrAbsenceStatus;
            createdAt: Date;
            updatedAt: Date;
            staffId: string;
            reason: string | null;
            startsOn: Date;
            endsOn: Date;
            decidedBy: string | null;
            decidedAt: Date | null;
            decisionNote: string | null;
        }[];
        timesheet: {
            staffId: string;
            username: string;
            shifts: number;
            minutes: number;
            lateMinutes: number;
            overtimeMinutes: number;
        }[];
    }>;
    myWeek(user: AuthPrincipal, query: HrWeekQueryDto): Promise<{
        weekStart: Date;
        weekEnd: Date;
        point: string | null;
        staff: {
            id: string;
            active: boolean;
            username: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
        schedules: ({
            attendance: {
                id: string;
                point: string;
                createdAt: Date;
                updatedAt: Date;
                staffId: string;
                scheduleId: string;
                checkedInAt: Date;
                checkedOutAt: Date | null;
                checkInKey: string;
                checkOutKey: string | null;
            } | null;
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            createdBy: string;
            createdAt: Date;
            updatedAt: Date;
            staffId: string;
            startsAt: Date;
            endsAt: Date;
            shiftDate: Date;
            cancelledAt: Date | null;
            cancelledBy: string | null;
            cancelReason: string | null;
        })[];
        absences: {
            id: string;
            type: import(".prisma/client").$Enums.HrAbsenceType;
            idempotencyKey: string;
            createdBy: string;
            status: import(".prisma/client").$Enums.HrAbsenceStatus;
            createdAt: Date;
            updatedAt: Date;
            staffId: string;
            reason: string | null;
            startsOn: Date;
            endsOn: Date;
            decidedBy: string | null;
            decidedAt: Date | null;
            decisionNote: string | null;
        }[];
        timesheet: {
            staffId: string;
            username: string;
            shifts: number;
            minutes: number;
            lateMinutes: number;
            overtimeMinutes: number;
        }[];
    }>;
    createSchedule(user: AuthPrincipal, key: string | undefined, dto: CreateHrScheduleDto): Promise<{
        id: string;
        idempotencyKey: string;
        point: string;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        staffId: string;
        startsAt: Date;
        endsAt: Date;
        shiftDate: Date;
        cancelledAt: Date | null;
        cancelledBy: string | null;
        cancelReason: string | null;
    }>;
    updateSchedule(user: AuthPrincipal, id: string, key: string | undefined, dto: UpdateHrScheduleDto): Promise<import("@prisma/client/runtime/library").InputJsonValue | null>;
    cancelSchedule(user: AuthPrincipal, id: string, key: string | undefined, dto: CancelHrScheduleDto): Promise<import("@prisma/client/runtime/library").InputJsonValue | null>;
    openAttendance(user: AuthPrincipal, key: string | undefined, dto: OpenHrAttendanceDto): Promise<{
        id: string;
        point: string;
        createdAt: Date;
        updatedAt: Date;
        staffId: string;
        scheduleId: string;
        checkedInAt: Date;
        checkedOutAt: Date | null;
        checkInKey: string;
        checkOutKey: string | null;
    }>;
    closeAttendance(user: AuthPrincipal, key: string | undefined, dto: OpenHrAttendanceDto): Promise<{
        id: string;
        point: string;
        createdAt: Date;
        updatedAt: Date;
        staffId: string;
        scheduleId: string;
        checkedInAt: Date;
        checkedOutAt: Date | null;
        checkInKey: string;
        checkOutKey: string | null;
    }>;
    requestAbsence(user: AuthPrincipal, key: string | undefined, dto: RequestHrAbsenceDto): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.HrAbsenceType;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.HrAbsenceStatus;
        createdAt: Date;
        updatedAt: Date;
        staffId: string;
        reason: string | null;
        startsOn: Date;
        endsOn: Date;
        decidedBy: string | null;
        decidedAt: Date | null;
        decisionNote: string | null;
    }>;
    decideAbsence(user: AuthPrincipal, id: string, dto: DecideHrAbsenceDto): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.HrAbsenceType;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.HrAbsenceStatus;
        createdAt: Date;
        updatedAt: Date;
        staffId: string;
        reason: string | null;
        startsOn: Date;
        endsOn: Date;
        decidedBy: string | null;
        decidedAt: Date | null;
        decisionNote: string | null;
    }>;
    payrollPreview(query: HrPayrollQueryDto): Promise<{
        period: string;
        point: string;
        config: {
            baseAmount: number;
            commissionBps: number;
            latePenaltyPerMinute: number;
            overtimePayPerMinute: number;
        };
        lines: {
            staffId: string;
            username: string;
            plannedShifts: number;
            completedShifts: number;
            paidAbsenceShifts: number;
            workedMinutes: number;
            lateMinutes: number;
            overtimeMinutes: number;
            revenue: number;
            sales: number;
            baseEarned: number;
            commission: number;
            lateDeduction: number;
            overtimePay: number;
            total: number;
        }[];
        totals: {
            base: number;
            commission: number;
            adjustments: number;
            payout: number;
        };
    }>;
    payrollRuns(query: HrPayrollQueryDto): Promise<({
        lines: {
            id: string;
            createdAt: Date;
            revenue: number;
            username: string;
            staffId: string;
            total: number;
            runId: string;
            sales: number;
            plannedShifts: number;
            completedShifts: number;
            paidAbsenceShifts: number;
            workedMinutes: number;
            lateMinutes: number;
            overtimeMinutes: number;
            baseEarned: number;
            commission: number;
            lateDeduction: number;
            overtimePay: number;
        }[];
    } & {
        id: string;
        point: string;
        baseAmount: number;
        createdBy: string;
        status: import(".prisma/client").$Enums.HrPayrollStatus;
        createdAt: Date;
        period: string;
        updatedAt: Date;
        commissionBps: number;
        externalRef: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        latePenaltyPerMinute: number;
        overtimePayPerMinute: number;
        totalBase: number;
        totalCommission: number;
        totalAdjustments: number;
        totalPayout: number;
        accrualAccountingEntryId: string | null;
        payoutAccountingEntryId: string | null;
    })[]>;
    postPayroll(user: AuthPrincipal, key: string | undefined, dto: HrPayrollQueryDto): Promise<import("@prisma/client/runtime/library").InputJsonValue | null>;
    payPayroll(user: AuthPrincipal, id: string, key: string | undefined, dto: PayHrPayrollDto): Promise<import("@prisma/client/runtime/library").InputJsonValue | null>;
}
