import { Prisma } from '@prisma/client';
export declare function sellerRevenueWhere(range?: {
    from?: Date;
    to?: Date;
    point?: string;
}): Prisma.PaymentWhereInput;
export interface SellerRevenuePayment {
    amount: number;
    receivedBy: string | null;
    shift: {
        staffId: string;
    } | null;
}
export declare function normalizeSellerActor(value: string): string;
export declare function soldBy(payment: SellerRevenuePayment): string | null;
export declare function sellerRevenueRows(payments: SellerRevenuePayment[]): {
    staffId: string;
    amount: number;
}[];
