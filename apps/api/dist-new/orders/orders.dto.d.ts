import { OrderStatus } from '@prisma/client';
import { OrderAttributionDto } from '../campaigns/attribution.dto';
declare const CHANNELS: readonly ["web", "app", "mobile", "staff_mobile", "pos", "telegram"];
declare const FULFILLMENT_TYPES: readonly ["pickup", "courier", "express", "store"];
declare const PAYMENT_MODES: readonly ["prepaid", "cod"];
export declare class OrderItemDto {
    sku: string;
    qty: number;
    price: number;
    imei?: string;
}
export declare class CreateOrderDto {
    customerId: string;
    channel: (typeof CHANNELS)[number];
    fulfillmentType?: (typeof FULFILLMENT_TYPES)[number];
    paymentMode?: (typeof PAYMENT_MODES)[number];
    storePointId?: string;
    pickupPoint?: string;
    deliveryAddress?: string;
    deliverySlot?: string;
    deliveryZoneId?: string;
    deliverySlotId?: string;
    total: number;
    promoCode?: string;
    attribution?: OrderAttributionDto;
    loyaltyPoints?: number;
    piiConsent?: boolean;
    items: OrderItemDto[];
}
declare const CreateMyOrderDto_base: import("@nestjs/common").Type<Omit<CreateOrderDto, "customerId">>;
export declare class CreateMyOrderDto extends CreateMyOrderDto_base {
}
export declare class TransitionDto {
    to: OrderStatus;
}
export {};
