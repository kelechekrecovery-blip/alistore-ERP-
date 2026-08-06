import { AuthPrincipal } from '../auth/jwt.strategy';
import { ReplaceSupplierOfferDto } from './supplier-offers.dto';
import { SupplierOffersService } from './supplier-offers.service';
export declare class SupplierOffersController {
    private readonly offers;
    constructor(offers: SupplierOffersService);
    get(productId: string): import(".prisma/client").Prisma.Prisma__SupplierOfferClient<({
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
    replace(user: AuthPrincipal, productId: string, dto: ReplaceSupplierOfferDto): Promise<{
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
    deactivate(user: AuthPrincipal, productId: string): Promise<{
        productId: string;
        offerId: string | null;
        active: boolean;
        idempotent: boolean;
    }>;
}
export declare class SupplyIntegrityController {
    private readonly offers;
    constructor(offers: SupplierOffersService);
    check(user: AuthPrincipal): Promise<{
        ok: boolean;
        checkedProducts: number;
        issues: Record<string, unknown>[];
    }>;
}
