import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { ExchangeDto } from './exchanges.dto';
import { UnitsService } from '../units/units.service';
export declare class ExchangesService {
    private readonly prisma;
    private readonly audit;
    private readonly units;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, units: UnitsService, outbox?: OutboxService | undefined);
    request(dto: ExchangeDto, actor: string, idempotencyKey: string): Promise<{
        exchangeRequestId: string;
        approvalId: string;
        status: string;
        oldImei: string;
        newImei: string;
        creditAmount: number;
        surchargeAmount: number;
        evidenceRequired: boolean;
        expiresAt: string;
        idempotent: boolean;
    }>;
    executeApprovedOnTx(tx: Prisma.TransactionClient, exchangeRequestId: string, approver: string, approvalId: string): Promise<{
        result: {
            exchangeOrderId: string;
            returnId: string;
            surcharge: number;
            oldImei: string;
            newImei: string;
            idempotent: boolean;
        };
        events: AuditInput[];
    }>;
    rejectApprovedOnTx(tx: Prisma.TransactionClient, exchangeRequestId: string, approvalId: string, actor: string, reason: string | null, events: AuditInput[]): Promise<void>;
    sweepExpired(now?: Date): Promise<{
        expired: number;
    }>;
    expireIfPastDeadlineOnTx(tx: Prisma.TransactionClient, exchangeRequestId: string, approvalId: string, now: Date, events: AuditInput[]): Promise<boolean>;
    private executeOnTx;
    private prepareSnapshotOnTx;
    private assertRequestReplay;
    private requestResult;
    private replayExchange;
    private validateProviderSurchargeReferenceOnTx;
    private resolveCashShiftOnTx;
}
