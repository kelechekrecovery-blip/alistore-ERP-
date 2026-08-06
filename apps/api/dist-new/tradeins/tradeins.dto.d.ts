import { Grade } from '@prisma/client';
export declare class CreateTradeInDto {
    customerId?: string;
    model: string;
    imei?: string;
    grade: Grade;
    price?: number;
    sellerPassport: string;
}
export declare class TradeInViewDto {
    id: string;
    customerId: string;
    model: string;
    imei: string | null;
    grade: Grade;
    price: number;
    contractId: string | null;
    sellerPassportMasked: string;
}
