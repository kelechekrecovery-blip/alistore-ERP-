import { SupplierPriceImportService } from './supplier-price-import.service';
import { CreateSupplierPriceImportDto } from './supplier-price-import.dto';
import { SupplierPriceImportMapping } from './supplier-price-import.types';
import { AuthPrincipal } from '../../auth/jwt.strategy';
export declare class SupplierPriceImportController {
    private readonly imports;
    constructor(imports: SupplierPriceImportService);
    stage(user: AuthPrincipal, dto: CreateSupplierPriceImportDto, file?: Express.Multer.File): Promise<{
        batchId: string;
        supplierId: string;
        mapping: SupplierPriceImportMapping;
        rows: import("./supplier-price-import.types").SupplierPriceImportRow[];
        summary: import("./supplier-price-import.types").SupplierPriceImportSummary;
    }>;
    get(id: string): Promise<{
        batchId: string;
        supplierId: string;
        mapping: SupplierPriceImportMapping;
        rows: import("./supplier-price-import.types").SupplierPriceImportRow[];
        summary: import("./supplier-price-import.types").SupplierPriceImportSummary;
        applied: boolean;
    }>;
    apply(user: AuthPrincipal, id: string): Promise<{
        batchId: string;
        idempotent: boolean;
    }>;
    private parseMapping;
}
