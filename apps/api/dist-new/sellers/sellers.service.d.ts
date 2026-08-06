import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
export declare class SellersService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        slug: string;
    }[]>;
    assertOwns(sellerId: string, productId: string): Promise<{
        id: string;
        name: string;
        taxCode: string;
        taxRateBps: number;
        updatedAt: Date;
        sku: string;
        barcode: string | null;
        variantGroup: string | null;
        price: number;
        cost: number;
        category: string;
        trackingMode: import(".prisma/client").$Enums.StockTrackingMode;
        supplyMode: import(".prisma/client").$Enums.SupplyMode;
        supplyLeadDays: number | null;
        sellerId: string | null;
        supplierId: string | null;
        attrs: import("@prisma/client/runtime/library").JsonValue;
        archived: boolean;
    }>;
}
