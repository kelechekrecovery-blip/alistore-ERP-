import { AuthPrincipal } from '../auth/jwt.strategy';
import { FinanceService } from './finance.service';
import { ImportBankStatementDto, ReconcileBankStatementLineDto } from './finance.dto';
export declare class BankStatementController {
    private readonly finance;
    constructor(finance: FinanceService);
    list(accountCode?: string): import(".prisma/client").Prisma.PrismaPromise<({
        lines: {
            id: string;
            occurredAt: Date;
            amount: number;
            status: import(".prisma/client").$Enums.BankStatementLineStatus;
            createdAt: Date;
            externalId: string;
            reference: string | null;
            reconciliationKey: string | null;
            matchedBy: string | null;
            matchedAt: Date | null;
            matchedEntryId: string | null;
            statementId: string;
        }[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        openingBalance: number;
        accountCode: string;
        status: import(".prisma/client").$Enums.BankStatementStatus;
        createdAt: Date;
        updatedAt: Date;
        statementNumber: string;
        periodStart: Date;
        periodEnd: Date;
        closingBalance: number;
    })[]>;
    import(user: AuthPrincipal, dto: ImportBankStatementDto): Promise<({
        lines: {
            id: string;
            occurredAt: Date;
            amount: number;
            status: import(".prisma/client").$Enums.BankStatementLineStatus;
            createdAt: Date;
            externalId: string;
            reference: string | null;
            reconciliationKey: string | null;
            matchedBy: string | null;
            matchedAt: Date | null;
            matchedEntryId: string | null;
            statementId: string;
        }[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        openingBalance: number;
        accountCode: string;
        status: import(".prisma/client").$Enums.BankStatementStatus;
        createdAt: Date;
        updatedAt: Date;
        statementNumber: string;
        periodStart: Date;
        periodEnd: Date;
        closingBalance: number;
    }) | {
        idempotent: boolean;
        lines: {
            id: string;
            occurredAt: Date;
            amount: number;
            status: import(".prisma/client").$Enums.BankStatementLineStatus;
            createdAt: Date;
            externalId: string;
            reference: string | null;
            reconciliationKey: string | null;
            matchedBy: string | null;
            matchedAt: Date | null;
            matchedEntryId: string | null;
            statementId: string;
        }[];
        id: string;
        idempotencyKey: string;
        createdBy: string;
        openingBalance: number;
        accountCode: string;
        status: import(".prisma/client").$Enums.BankStatementStatus;
        createdAt: Date;
        updatedAt: Date;
        statementNumber: string;
        periodStart: Date;
        periodEnd: Date;
        closingBalance: number;
    }>;
    reconcile(user: AuthPrincipal, id: string, dto: ReconcileBankStatementLineDto): Promise<{
        idempotent: boolean;
        statement: {
            id: string;
            idempotencyKey: string;
            createdBy: string;
            openingBalance: number;
            accountCode: string;
            status: import(".prisma/client").$Enums.BankStatementStatus;
            createdAt: Date;
            updatedAt: Date;
            statementNumber: string;
            periodStart: Date;
            periodEnd: Date;
            closingBalance: number;
        };
        id: string;
        occurredAt: Date;
        amount: number;
        status: import(".prisma/client").$Enums.BankStatementLineStatus;
        createdAt: Date;
        externalId: string;
        reference: string | null;
        reconciliationKey: string | null;
        matchedBy: string | null;
        matchedAt: Date | null;
        matchedEntryId: string | null;
        statementId: string;
    }>;
}
