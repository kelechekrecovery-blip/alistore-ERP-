import { SupplyQuarantineDisposition } from '@prisma/client';
export declare class ProposeSupplyQuarantineDto {
    reason: string;
    evidence: Record<string, unknown>;
    imeis?: string[];
}
export declare class ResolveSupplyQuarantineDto {
    disposition: SupplyQuarantineDisposition;
    reason: string;
    evidence: Record<string, unknown>;
}
