declare const PLAN_TYPES: readonly ["accidental_damage", "extended_warranty", "full_protection"];
declare const COVERAGE_MONTHS: readonly [12, 24];
declare const STAFF_STATUSES: readonly ["reviewing", "offered", "rejected"];
export declare class RequestProtectionDto {
    imei: string;
    planType: (typeof PLAN_TYPES)[number];
    coverageMonths: (typeof COVERAGE_MONTHS)[number];
}
export declare class UpdateProtectionDto {
    status: (typeof STAFF_STATUSES)[number];
    premium?: number;
    staffNote?: string;
}
export {};
