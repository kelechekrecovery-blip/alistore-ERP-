declare const PAYMENT_INTENTS: readonly ["invoice", "bank_transfer"];
declare const FULFILLMENT_TYPES: readonly ["delivery", "pickup"];
declare const STAFF_STATUSES: readonly ["reviewing", "quoted", "rejected"];
declare const QUOTE_STATUSES: readonly ["requested", "reviewing", "quoted", "rejected", "accepted"];
export declare class UpsertBusinessProfileDto {
    companyName: string;
    taxId: string;
    contactName: string;
    email?: string;
    billingAddress: string;
}
export declare class B2BQuoteItemDto {
    sku: string;
    qty: number;
    targetPrice?: number;
}
export declare class CreateB2BQuoteDto {
    items: B2BQuoteItemDto[];
    paymentIntent: (typeof PAYMENT_INTENTS)[number];
    fulfillmentType: (typeof FULFILLMENT_TYPES)[number];
    deliveryAddress?: string;
    pickupPoint?: string;
    comment?: string;
}
export declare class UpdateB2BQuoteDto {
    status: (typeof STAFF_STATUSES)[number];
    quotedTotal?: number;
    staffNote?: string;
    validUntil?: string;
}
export declare class ListB2BQuotesQueryDto {
    status?: (typeof QUOTE_STATUSES)[number];
}
export {};
