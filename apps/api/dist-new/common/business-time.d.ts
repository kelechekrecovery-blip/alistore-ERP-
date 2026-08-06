export declare const BUSINESS_TIME_ZONE = "Asia/Bishkek";
export declare const BUSINESS_UTC_OFFSET = "+06:00";
export declare function parseBusinessDay(iso: string): number | null;
export declare function businessDayIso(at: Date): string;
export declare function businessDayStartMs(at: Date): number;
