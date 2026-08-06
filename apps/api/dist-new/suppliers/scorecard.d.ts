import { RmaStatus } from '@prisma/client';
export interface SupplierScore {
    supplierId: string;
    supplier: string;
    total: number;
    open: number;
    resolved: number;
    rejected: number;
    resolutionRate: number | null;
}
interface SupplierRow {
    id: string;
    name: string;
}
interface RmaRow {
    supplierId: string;
    status: RmaStatus;
    resolution: string | null;
}
export declare function buildScorecard(suppliers: SupplierRow[], rmas: RmaRow[]): SupplierScore[];
export {};
