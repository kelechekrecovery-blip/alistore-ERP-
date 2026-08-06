import { ProductsService } from './products.service';
import { ChangePriceDto, CreateProductDto, CreateProductReviewDto, DeleteProductDto, ModerateProductReviewDto, ProductListQueryDto, ProductReviewModerationQueryDto, UpdateProductDto } from './products.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class ProductsController {
    private readonly products;
    constructor(products: ProductsService);
    moderationQueue(query: ProductReviewModerationQueryDto): Promise<{
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
    moderateReview(user: AuthPrincipal, reviewId: string, dto: ModerateProductReviewDto): Promise<{
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
            attrs: import("@prisma/client/runtime/library").JsonValue;
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
    create(user: AuthPrincipal, dto: CreateProductDto): Promise<{
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
        attrs: import("@prisma/client/runtime/library").JsonValue;
        bundleComponents: {
            productId: string;
            sku: string;
            name: string;
            qty: number;
        }[];
        archived: boolean;
        availableUnits: number;
    }>;
    get(id: string): Promise<{
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
    reviews(id: string): Promise<{
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
    createReview(user: AuthPrincipal, id: string, dto: CreateProductReviewDto): Promise<{
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
    update(user: AuthPrincipal, id: string, dto: UpdateProductDto): Promise<{
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
        attrs: import("@prisma/client/runtime/library").JsonValue;
        bundleComponents: {
            productId: string;
            sku: string;
            name: string;
            qty: number;
        }[];
        archived: boolean;
        availableUnits: number;
    }>;
    changePrice(user: AuthPrincipal, id: string, dto: ChangePriceDto): Promise<{
        approvalId: string;
        status: "requested";
    } | {
        applied: true;
        productId: string;
        price: number;
    }>;
    remove(user: AuthPrincipal, id: string, dto: DeleteProductDto): Promise<{
        approvalId: string;
        status: "requested";
    }>;
}
