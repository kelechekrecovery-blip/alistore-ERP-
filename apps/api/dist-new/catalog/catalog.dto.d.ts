import { Prisma } from '@prisma/client';
export declare class CatalogSearchQueryDto {
    q?: string;
    category?: string;
    stockOnly?: boolean;
    sort?: 'name' | 'price_asc' | 'price_desc' | 'stock_desc';
    limit: number;
    offset: number;
}
export declare class InstallmentStepDto {
    months: number;
    monthlySom: number;
    providers: string[];
}
export declare class InstallmentOfferDto {
    id: string;
    label: string;
    months: number;
    monthlySom: number;
    totalSom: number;
}
export declare class InstallmentProviderDto {
    id: string;
    label: string;
    qrUrl: string;
}
export declare class SellerRefDto {
    id: string;
    name: string;
}
export declare class CatalogProductDto {
    sellerId?: string | null;
    seller?: SellerRefDto;
    installment?: InstallmentOfferDto | null;
    installmentSteps?: InstallmentStepDto[];
    installmentProviders?: InstallmentProviderDto[];
    bonusPoints?: number;
    id: string;
    sku: string;
    barcode: string | null;
    variantGroup: string | null;
    name: string;
    price: number;
    category: string;
    trackingMode: 'serialized' | 'quantity';
    supplyMode: 'own_stock' | 'to_order';
    supplyLeadDays: number | null;
    orderable: boolean;
    availabilityKind: 'in_stock' | 'to_order' | 'unavailable';
    leadTimeDays: number | null;
    estimatedDeliveryDate: string | null;
    attrs: Prisma.JsonValue;
    bundleComponents: Array<{
        productId: string;
        sku: string;
        name: string;
        qty: number;
    }>;
    availableUnits: number;
    reviewCount: number;
    avgRating: number | null;
    updatedAt: string;
}
export declare class CatalogProductDetailDto {
    product: CatalogProductDto;
    variants: CatalogProductDto[];
    related: CatalogProductDto[];
}
export declare class CatalogSearchResponseDto {
    source: 'postgres' | 'meilisearch' | 'postgres_fallback';
    warning?: string;
    total: number;
    limit: number;
    offset: number;
    items: CatalogProductDto[];
}
export declare class CatalogReindexResponseDto {
    source: 'meilisearch';
    index: string;
    indexed: number;
    taskUid?: number | string;
}
export declare class CatalogDeltaQueryDto {
    since?: string;
    limit: number;
}
export declare class CatalogDeltaResponseDto {
    cursor: string;
    since?: string;
    changed: CatalogProductDto[];
    removed: string[];
    totalChanged: number;
    totalRemoved: number;
    truncated: boolean;
}
