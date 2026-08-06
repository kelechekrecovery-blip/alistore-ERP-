import { GiftCard, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { IssueGiftCardDto } from './giftcards.dto';
export interface GiftCardView {
    id: string;
    code: string;
    initialBalance: number;
    balance: number;
    currency: string;
    status: string;
    customerId: string | null;
    expiresAt: Date | null;
    redeemable: boolean;
}
export declare class GiftcardsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    issue(dto: IssueGiftCardDto, actor: string, idempotencyKey?: string): Promise<GiftCardView>;
    getByCode(code: string): Promise<GiftCardView>;
    redeemOnTx(tx: Prisma.TransactionClient, codeInput: string, orderId: string, amount: number, actor: string, events: AuditInput[]): Promise<GiftCard>;
    private raiseRedeemError;
    private view;
    private generateCode;
}
export declare function normalizeCode(code: string): string;
