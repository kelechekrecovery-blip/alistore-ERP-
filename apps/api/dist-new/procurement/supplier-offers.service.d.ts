import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceSupplierOfferDto } from './supplier-offers.dto';
export declare class SupplierOffersService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    getActive(productId: string): import(".prisma/client").Prisma.Prisma__SupplierOfferClient<({
        supplier: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        currency: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        unitCost: number;
        productId: string;
        supplierId: string;
        updatedBy: string;
        availableQty: number;
        supplierSku: string | null;
        leadDays: number;
        checkedAt: Date;
        validUntil: Date;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    replace(productId: string, dto: ReplaceSupplierOfferDto, actor: string): Promise<{
        marginBps: number;
        minimumMarginBps: number;
        requiresApproval: boolean;
        id: string;
        currency: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        unitCost: number;
        productId: string;
        supplierId: string;
        updatedBy: string;
        availableQty: number;
        supplierSku: string | null;
        leadDays: number;
        checkedAt: Date;
        validUntil: Date;
    }>;
    deactivate(productId: string, actor: string): Promise<{
        productId: string;
        offerId: string | null;
        active: boolean;
        idempotent: boolean;
    }>;
    integrity(actor: string): Promise<{
        ok: boolean;
        checkedProducts: number;
        issues: Record<string, unknown>[];
    }>;
}
