export declare class OpenShiftDto {
    staffId: string;
    point: string;
    openCash: number;
}
export declare class CloseShiftDto {
    closeCash: number;
    reason?: string;
}
export declare class HandoverShiftDto {
    toStaffId: string;
    countedCash: number;
    reason?: string;
}
