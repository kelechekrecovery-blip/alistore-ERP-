import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ModerationService } from '../ai/moderation.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { CreateProductDto, CreateProductReviewDto, ModerateProductReviewDto, ProductListQueryDto, UpdateProductDto } from './products.dto';
export declare class ProductsService {
    private readonly prisma;
    private readonly audit;
    private readonly approvals;
    private readonly moderation?;
    constructor(prisma: PrismaService, audit: AuditService, approvals: ApprovalsService, moderation?: ModerationService | undefined);
    get(id: string): Prisma.Prisma__ProductClient<{
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
        attrs: Prisma.JsonValue;
        archived: boolean;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    list(query: ProductListQueryDto): Promise<{
        total: number;
        limit: number;
        offset: number;
        items: {
            id: string;
            sku: string;
            barcode: string | null;
            variantGroup: string | null;
            name: string;
            price: number;
            cost: number;
            category: string;
            taxCode: string;
            taxRateBps: number;
            trackingMode: import(".prisma/client").$Enums.StockTrackingMode;
            supplyMode: import(".prisma/client").$Enums.SupplyMode;
            supplyLeadDays: number | null;
            supplierId: string | null;
            attrs: Prisma.JsonValue;
            bundleComponents: {
                productId: string;
                sku: string;
                name: string;
                qty: number;
            }[];
            archived: boolean;
            availableUnits: number;
        }[];
    }>;
    create(dto: CreateProductDto, requester: string): Promise<{
        id: string;
        sku: string;
        barcode: string | null;
        variantGroup: string | null;
        name: string;
        price: number;
        cost: number;
        category: string;
        taxCode: string;
        taxRateBps: number;
        trackingMode: import(".prisma/client").$Enums.StockTrackingMode;
        supplyMode: import(".prisma/client").$Enums.SupplyMode;
        supplyLeadDays: number | null;
        supplierId: string | null;
        attrs: Prisma.JsonValue;
        bundleComponents: {
            productId: string;
            sku: string;
            name: string;
            qty: number;
        }[];
        archived: boolean;
        availableUnits: number;
    }>;
    update(productId: string, dto: UpdateProductDto, requester: string): Promise<{
        id: string;
        sku: string;
        barcode: string | null;
        variantGroup: string | null;
        name: string;
        price: number;
        cost: number;
        category: string;
        taxCode: string;
        taxRateBps: number;
        trackingMode: import(".prisma/client").$Enums.StockTrackingMode;
        supplyMode: import(".prisma/client").$Enums.SupplyMode;
        supplyLeadDays: number | null;
        supplierId: string | null;
        attrs: Prisma.JsonValue;
        bundleComponents: {
            productId: string;
            sku: string;
            name: string;
            qty: number;
        }[];
        archived: boolean;
        availableUnits: number;
    }>;
    reviews(productId: string): Promise<{
        productId: string;
        sku: string;
        count: number;
        avgRating: number | null;
        items: {
            id: string;
            rating: number;
            text: string | null;
            customerName: string;
            createdAt: Date;
        }[];
    }>;
    createReview(productId: string, user: AuthPrincipal, dto: CreateProductReviewDto): Promise<{
        id: string;
        orderId: string;
        status: string;
        createdAt: Date;
        productId: string;
        sku: string;
        customerId: string;
        text: string | null;
        customerName: string;
        rating: number;
        moderatedBy: string | null;
        moderatedAt: Date | null;
        moderationReason: string | null;
    }>;
    reviewModerationQueue(status: 'pending' | 'approved' | 'rejected'): Promise<{
        status: "pending" | "approved" | "rejected";
        items: {
            productName: string;
            id: string;
            orderId: string;
            status: string;
            createdAt: Date;
            productId: string;
            sku: string;
            customerId: string;
            text: string | null;
            customerName: string;
            rating: number;
            moderatedBy: string | null;
            moderatedAt: Date | null;
            moderationReason: string | null;
        }[];
    }>;
    moderateReview(reviewId: string, dto: ModerateProductReviewDto, actor: string): Promise<{
        id: string;
        orderId: string;
        status: string;
        createdAt: Date;
        productId: string;
        sku: string;
        customerId: string;
        text: string | null;
        customerName: string;
        rating: number;
        moderatedBy: string | null;
        moderatedAt: Date | null;
        moderationReason: string | null;
    }>;
    changePrice(productId: string, newPrice: number, reason: string, requester: string): Promise<{
        approvalId: string;
        status: "requested";
    } | {
        applied: true;
        productId: string;
        price: number;
    }>;
    archive(productId: string, reason: string, requester: string): Promise<{
        approvalId: string;
        status: "requested";
    }>;
    private maskPhone;
    private toAdminProduct;
    private stockCountInclude;
    private availableUnits;
    private directAvailability;
    private resolveBundleComponents;
    private optionalValue;
}
