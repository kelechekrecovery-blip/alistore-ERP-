import { PromotionDiscountType } from '@prisma/client';
export declare class PromotionQuoteItemDto {
    sku: string;
    qty: number;
}
export declare class PromotionQuoteDto {
    code: string;
    items: PromotionQuoteItemDto[];
}
export declare class CreatePromotionDto {
    code: string;
    name: string;
    description?: string;
    discountType: PromotionDiscountType;
    discountValue: number;
    maxDiscount?: number;
    minimumSubtotal?: number;
    eligibleProductIds?: string[];
    eligibleCategories?: string[];
    startsAt?: string;
    endsAt?: string;
    totalLimit?: number;
    perCustomerLimit?: number;
}
export declare class UpdatePromotionDto {
    code?: string;
    name?: string;
    description?: string;
    discountType?: PromotionDiscountType;
    discountValue?: number;
    maxDiscount?: number;
    minimumSubtotal?: number;
    eligibleProductIds?: string[];
    eligibleCategories?: string[];
    startsAt?: string;
    endsAt?: string;
    totalLimit?: number;
    perCustomerLimit?: number;
}
