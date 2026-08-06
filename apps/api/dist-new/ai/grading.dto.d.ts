import { DeviceGrade } from './valuation';
export declare class PhotoEvidenceDto {
    url?: string;
    evidenceId?: string;
    label?: string;
    mimeType?: string;
}
export declare class GradePhotosDto {
    photos: PhotoEvidenceDto[];
    model?: string;
    imei?: string;
    claimedGrade?: DeviceGrade;
    observedDefects?: string[];
}
