import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { OutboxService } from '../outbox/outbox.service';
import { SettingsService } from '../settings/settings.service';
import { CreateDebtDto, DebtPaymentDto } from './debts.dto';
export declare const DEBT_LIMIT = 50000;
export declare class DebtsService {
    private readonly prisma;
    private readonly audit;
    private readonly approvals;
    private readonly outbox;
    private readonly settings;
    constructor(prisma: PrismaService, audit: AuditService, approvals: ApprovalsService, outbox: OutboxService, settings: SettingsService);
    private resolveCashShiftOnTx;
    get(id: string): Prisma.Prisma__DebtPlanClient<{
        id: string;
        idempotencyKey: string | null;
        accountingEntryId: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.DebtStatus;
        createdAt: Date;
        balance: number;
        customerId: string;
        principal: number;
        installments: number;
        dueDate: Date;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    list(filter: {
        customerId?: string;
        status?: string;
    }): Prisma.PrismaPromise<{
        id: string;
        idempotencyKey: string | null;
        accountingEntryId: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.DebtStatus;
        createdAt: Date;
        balance: number;
        customerId: string;
        principal: number;
        installments: number;
        dueDate: Date;
    }[]>;
    create(dto: CreateDebtDto, actor: string): Promise<{
        id: string;
        idempotencyKey: string | null;
        accountingEntryId: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.DebtStatus;
        createdAt: Date;
        balance: number;
        customerId: string;
        principal: number;
        installments: number;
        dueDate: Date;
    } | {
        approvalId: string;
        status: "requested";
    }>;
    pay(id: string, dto: DebtPaymentDto, actor: string): Promise<{
        debt: {
            id: string;
            idempotencyKey: string | null;
            accountingEntryId: string | null;
            orderId: string;
            status: import(".prisma/client").$Enums.DebtStatus;
            createdAt: Date;
            balance: number;
            customerId: string;
            principal: number;
            installments: number;
            dueDate: Date;
        };
        paymentId: string;
        settled: boolean;
        idempotent: boolean;
    }>;
    enqueueReminders(options?: {
        now?: Date;
        dueSoonDays?: number;
        limit?: number;
    }, actor?: string): Promise<{
        considered: number;
        queued: number;
    }>;
}
