import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
export declare const DEFAULT_EARN_RATE_BPS = 100;
export declare function loyaltyBalanceOnTx(tx: Prisma.TransactionClient, customerId: string, now?: Date): Promise<number>;
export declare function redeemLoyaltyOnTx(tx: Prisma.TransactionClient, input: {
    customerId: string;
    orderId: string;
    requested: number;
    maximum: number;
    actor: string;
}, events: AuditInput[]): Promise<number>;
export declare function loyaltyEarnAmount(paidTotal: number, earnRateBps?: number): number;
export declare function earnLoyaltyOnTx(tx: Prisma.TransactionClient, input: {
    customerId: string;
    orderId: string;
    paidTotal: number;
    paymentId?: string;
    actor: string;
    earnRateBps?: number;
}, events: AuditInput[]): Promise<number>;
export declare function reconcileRefundLoyaltyOnTx(tx: Prisma.TransactionClient, input: {
    order: {
        id: string;
        customerId: string;
        total: number;
        loyaltyRedeemed: number;
        loyaltyEarned: number;
    };
    refundPaymentId: string;
    actor: string;
}, events: AuditInput[]): Promise<void>;
