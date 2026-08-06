import { DeviceGrade } from './valuation';
export declare class AssessDto {
    basePrice?: number;
    sku?: string;
    grade: DeviceGrade;
    ageMonths?: number;
    defects?: string[];
}
