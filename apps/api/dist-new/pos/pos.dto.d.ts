import { PaymentMethod } from '@prisma/client';
export declare class PosLineDto {
    productId: string;
    sku: string;
    price: number;
    qty: number;
    imei?: string;
}
export declare class PosCustomerLookupDto {
    phone: string;
    point: string;
    clientSaleId: string;
}
export declare class PosPaymentDto {
    method: PaymentMethod;
    amount: number;
}
export declare class PosSaleDto {
    staffId: string;
    point: string;
    method?: PaymentMethod;
    payments?: PosPaymentDto[];
    discountPct?: number;
    approvalId?: string;
    reason?: string;
    customerBinding?: string;
    clientSaleId?: string;
    lines: PosLineDto[];
}
