import { HrAbsenceStatus, HrAbsenceType } from '@prisma/client';
export declare class HrPayrollQueryDto {
    period: string;
    point: string;
}
export declare class PayHrPayrollDto {
    externalRef: string;
    fundingAccountCode?: '1000' | '1010' | '1020';
}
export declare class HrWeekQueryDto {
    weekStart: string;
    point?: string;
}
export declare class CreateHrScheduleDto {
    staffId: string;
    point: string;
    shiftDate: string;
    startsAt: string;
    endsAt: string;
}
export declare class UpdateHrScheduleDto {
    point: string;
    shiftDate: string;
    startsAt: string;
    endsAt: string;
}
export declare class CancelHrScheduleDto {
    reason?: string;
}
export declare class OpenHrAttendanceDto {
    scheduleId: string;
}
export declare class RequestHrAbsenceDto {
    type: HrAbsenceType;
    startsOn: string;
    endsOn: string;
    reason?: string;
}
export declare class DecideHrAbsenceDto {
    status: HrAbsenceStatus;
    note?: string;
}
