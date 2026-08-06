import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
type Tx = Prisma.TransactionClient;
export declare function applyCampaignRefundOnTx(tx: Tx, input: {
    orderId: string;
    refundPaymentId: string;
    returnId: string | null;
    amount: number;
    actor: string;
}, events: AuditInput[]): Promise<{
    revenue: number;
    restoredCost: number;
    grossProfitReduction: number;
} | null>;
export {};
