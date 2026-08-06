import { PaymentMethod } from '@prisma/client';
export declare class ExchangeDto {
    originalOrderId: string;
    oldImei: string;
    newProductId: string;
    method: PaymentMethod;
    shiftId?: string;
    externalReference?: string;
}
