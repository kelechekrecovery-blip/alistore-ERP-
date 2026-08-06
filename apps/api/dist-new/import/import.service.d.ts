import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ImportResult, ImportRowError, ParsedProductRow } from './import.types';
export declare class ImportService {
    private readonly prisma;
    private readonly audit?;
    constructor(prisma: PrismaService, audit?: AuditService | undefined);
    parseProducts(buffer: Buffer): Promise<{
        rows: ParsedProductRow[];
        errors: ImportRowError[];
    }>;
    importProducts(buffer: Buffer, actor?: string): Promise<ImportResult>;
    private str;
    private num;
}
