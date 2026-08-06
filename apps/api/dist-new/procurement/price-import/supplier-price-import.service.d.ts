import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SupplierPriceImportMapping, SupplierPriceImportRow, SupplierPriceImportSummary } from './supplier-price-import.types';
export declare class SupplierPriceImportService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    stage(file: Buffer, supplierId: string, mappingInput: SupplierPriceImportMapping | undefined, actor: string): Promise<{
        batchId: string;
        supplierId: string;
        mapping: SupplierPriceImportMapping;
        rows: SupplierPriceImportRow[];
        summary: SupplierPriceImportSummary;
    }>;
    get(batchId: string): Promise<{
        batchId: string;
        supplierId: string;
        mapping: SupplierPriceImportMapping;
        rows: SupplierPriceImportRow[];
        summary: SupplierPriceImportSummary;
        applied: boolean;
    }>;
    apply(batchId: string, actor: string): Promise<{
        batchId: string;
        idempotent: boolean;
    }>;
    private resolveMapping;
}
