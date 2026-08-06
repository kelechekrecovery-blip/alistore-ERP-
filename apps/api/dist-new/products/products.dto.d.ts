export declare class ProductListQueryDto {
    q?: string;
    includeArchived?: boolean;
    limit: number;
    offset: number;
}
export declare class ProductBundleComponentDto {
    sku: string;
    qty: number;
}
export declare class CreateProductSupplierOfferDto {
    supplierId: string;
    supplierSku?: string;
    unitCost: number;
    availableQty: number;
    leadDays: number;
    validForHours?: number;
}
export declare class CreateProductDto {
    sku: string;
    barcode?: string;
    variantGroup?: string;
    name: string;
    price: number;
    cost: number;
    category: string;
    taxCode?: string;
    taxRateBps?: number;
    trackingMode?: 'serialized' | 'quantity';
    supplyMode?: 'own_stock' | 'to_order';
    supplyLeadDays?: number;
    supplierOffer?: CreateProductSupplierOfferDto;
    attrs?: Record<string, unknown>;
    bundleComponents?: ProductBundleComponentDto[];
}
export declare class UpdateProductDto {
    barcode?: string;
    variantGroup?: string;
    name?: string;
    cost?: number;
    category?: string;
    taxCode?: string;
    taxRateBps?: number;
    trackingMode?: 'serialized' | 'quantity';
    supplyMode?: 'own_stock' | 'to_order';
    supplyLeadDays?: number;
    supplierId?: string;
    attrs?: Record<string, unknown>;
    bundleComponents?: ProductBundleComponentDto[];
}
export declare class ChangePriceDto {
    price: number;
    reason: string;
    requester?: string;
}
export declare class DeleteProductDto {
    reason: string;
    requester?: string;
}
export declare class CreateProductReviewDto {
    rating: number;
    text?: string;
    orderId?: string;
}
export declare const PRODUCT_REVIEW_STATUSES: readonly ["pending", "approved", "rejected"];
export declare class ProductReviewModerationQueryDto {
    status?: (typeof PRODUCT_REVIEW_STATUSES)[number];
}
export declare class ModerateProductReviewDto {
    action: 'approve' | 'reject';
    reason?: string;
}
