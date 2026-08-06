import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/jwt.strategy';
export interface BusinessProductView {
    id: string;
    sku: string;
    name: string;
    price: number;
    category: string;
    archived: boolean;
}
export declare class BusinessProductsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    private actorOf;
    private scopeOf;
    list(principal: AuthPrincipal): Promise<BusinessProductView[]>;
    updatePrice(principal: AuthPrincipal, productId: string, price: number): Promise<{
        id: string;
        name: string;
        sku: string;
        price: number;
        category: string;
        archived: boolean;
    }>;
}
