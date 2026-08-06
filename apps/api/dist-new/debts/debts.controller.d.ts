import { DebtsService } from './debts.service';
import { CreateDebtDto, DebtPaymentDto } from './debts.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class DebtsController {
    private readonly debts;
    constructor(debts: DebtsService);
    create(user: AuthPrincipal, dto: CreateDebtDto): Promise<{
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
    list(customerId?: string, status?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    pay(user: AuthPrincipal, id: string, dto: DebtPaymentDto): Promise<{
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
}
