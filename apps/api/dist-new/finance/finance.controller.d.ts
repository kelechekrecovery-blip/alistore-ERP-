import { Response } from 'express';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { AccountableAdvanceQueryDto, ArAgingQueryDto, CloseAccountableAdvanceDto, CloseAccountingPeriodDto, CloseFinanceSettlementDto, CreateAccountableAdvanceDto, CreateCashIncassationDto, CreateCurrencyRateDto, CreateExpenseDto, CreateFinanceSettlementDto, CreateFixedAssetDto, CreateManualAdjustmentDto, CreateOpeningBalanceDto, CurrencyRateQueryDto, DepreciateFixedAssetDto, FinanceAccountingQueryDto, FinancePeriodQueryDto, FinanceSettlementQueryDto, FxExposureQueryDto, PayExpenseDto, RejectExpenseDto, ResolveFinanceSettlementDto, ReverseAccountingEntryDto, SetFinanceBudgetDto, SettleAccountableAdvanceDto, SettleTaxPeriodDto, SupplierAgingQueryDto } from './finance.dto';
import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly finance;
    constructor(finance: FinanceService);
    list(status?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
        } | null;
        exchangeRate: {
            id: string;
            currency: string;
            source: string;
            rateMicros: number;
            effectiveAt: Date;
            baseCurrency: string;
        } | null;
    } & {
        id: string;
        idempotencyKey: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number;
        exchangeRateMicros: number;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        amount: number;
        status: import(".prisma/client").$Enums.ExpenseStatus;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        supplierId: string | null;
        taxBaseAmount: number;
        approvedBy: string | null;
        approvedAt: Date | null;
        requestedBy: string;
        rejectedAt: Date | null;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        exchangeRateId: string | null;
        taxMode: import(".prisma/client").$Enums.ExpenseTaxMode;
        incurredAt: Date;
        rejectedBy: string | null;
        rejectionNote: string | null;
    })[]>;
    create(user: AuthPrincipal, dto: CreateExpenseDto): Promise<{
        supplier: {
            id: string;
            name: string;
        } | null;
        exchangeRate: {
            id: string;
            currency: string;
            source: string;
            rateMicros: number;
            effectiveAt: Date;
            baseCurrency: string;
        } | null;
    } & {
        id: string;
        idempotencyKey: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number;
        exchangeRateMicros: number;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        amount: number;
        status: import(".prisma/client").$Enums.ExpenseStatus;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        supplierId: string | null;
        taxBaseAmount: number;
        approvedBy: string | null;
        approvedAt: Date | null;
        requestedBy: string;
        rejectedAt: Date | null;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        exchangeRateId: string | null;
        taxMode: import(".prisma/client").$Enums.ExpenseTaxMode;
        incurredAt: Date;
        rejectedBy: string | null;
        rejectionNote: string | null;
    }>;
    approve(user: AuthPrincipal, id: string): Promise<{
        supplier: {
            id: string;
            name: string;
        } | null;
        exchangeRate: {
            id: string;
            currency: string;
            source: string;
            rateMicros: number;
            effectiveAt: Date;
            baseCurrency: string;
        } | null;
    } & {
        id: string;
        idempotencyKey: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number;
        exchangeRateMicros: number;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        amount: number;
        status: import(".prisma/client").$Enums.ExpenseStatus;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        supplierId: string | null;
        taxBaseAmount: number;
        approvedBy: string | null;
        approvedAt: Date | null;
        requestedBy: string;
        rejectedAt: Date | null;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        exchangeRateId: string | null;
        taxMode: import(".prisma/client").$Enums.ExpenseTaxMode;
        incurredAt: Date;
        rejectedBy: string | null;
        rejectionNote: string | null;
    }>;
    reject(user: AuthPrincipal, id: string, dto: RejectExpenseDto): Promise<{
        supplier: {
            id: string;
            name: string;
        } | null;
        exchangeRate: {
            id: string;
            currency: string;
            source: string;
            rateMicros: number;
            effectiveAt: Date;
            baseCurrency: string;
        } | null;
    } & {
        id: string;
        idempotencyKey: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number;
        exchangeRateMicros: number;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        amount: number;
        status: import(".prisma/client").$Enums.ExpenseStatus;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        supplierId: string | null;
        taxBaseAmount: number;
        approvedBy: string | null;
        approvedAt: Date | null;
        requestedBy: string;
        rejectedAt: Date | null;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        exchangeRateId: string | null;
        taxMode: import(".prisma/client").$Enums.ExpenseTaxMode;
        incurredAt: Date;
        rejectedBy: string | null;
        rejectionNote: string | null;
    }>;
    pay(user: AuthPrincipal, id: string, dto: PayExpenseDto): Promise<{
        accountingEntryId: string | null;
        idempotent: boolean;
        supplier: {
            id: string;
            name: string;
        } | null;
        exchangeRate: {
            id: string;
            currency: string;
            source: string;
            rateMicros: number;
            effectiveAt: Date;
            baseCurrency: string;
        } | null;
        id: string;
        idempotencyKey: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number;
        exchangeRateMicros: number;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        amount: number;
        status: import(".prisma/client").$Enums.ExpenseStatus;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        supplierId: string | null;
        taxBaseAmount: number;
        approvedBy: string | null;
        approvedAt: Date | null;
        requestedBy: string;
        rejectedAt: Date | null;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        exchangeRateId: string | null;
        taxMode: import(".prisma/client").$Enums.ExpenseTaxMode;
        incurredAt: Date;
        rejectedBy: string | null;
        rejectionNote: string | null;
    }>;
}
export declare class FinancePlanningController {
    private readonly finance;
    constructor(finance: FinanceService);
    accounts(): import(".prisma/client").Prisma.PrismaPromise<{
        type: import(".prisma/client").$Enums.AccountingAccountType;
        name: string;
        code: string;
        createdAt: Date;
        system: boolean;
        active: boolean;
    }[]>;
    currencyRates(query: CurrencyRateQueryDto): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        idempotencyKey: string;
        currency: string;
        createdBy: string;
        createdAt: Date;
        source: string;
        rateMicros: number;
        effectiveAt: Date;
        baseCurrency: string;
    }[]>;
    fxExposure(query: FxExposureQueryDto): Promise<{
        asOf: Date;
        baseCurrency: string;
        reportType: string;
        rows: {
            id: string;
            description: string;
            status: import(".prisma/client").$Enums.ExpenseStatus;
            point: string | null;
            supplier: {
                id: string;
                name: string;
            } | null;
            incurredAt: Date;
            currency: string;
            documentAmount: number;
            originalRateMicros: number;
            originalBaseAmount: number;
            currentRate: {
                id: string;
                rateMicros: number;
                effectiveAt: Date;
                source: string;
            } | null;
            currentBaseAmount: number | null;
            valuationDelta: number | null;
            valuationStatus: "ready" | "missing_rate" | "overflow";
        }[];
        totals: {
            documentAmount: number;
            originalBaseAmount: number;
            currentBaseAmount: number;
            valuationDelta: number;
            openDocuments: number;
            missingRateDocuments: number;
            overflowDocuments: number;
            currency: string;
        }[];
        coverage: {
            complete: boolean;
            statuses: ("approved" | "submitted")[];
            limit: number;
            truncated: boolean;
            note: string;
        };
    }>;
    createCurrencyRate(user: AuthPrincipal, dto: CreateCurrencyRateDto): Promise<{
        idempotent: boolean;
        id: string;
        currency: string;
        baseCurrency: string;
        rateMicros: number;
        effectiveAt: Date;
        source: string;
    }>;
    collectableShifts(point?: string): Promise<{
        id: string;
        point: string;
        closedAt: Date | null;
        closeCash: number;
        deposited: number;
        available: number;
    }[]>;
    cashIncassations(point?: string): import(".prisma/client").Prisma.PrismaPromise<({
        shift: {
            id: string;
            point: string;
            closedAt: Date | null;
            staffId: string;
            closeCash: number | null;
        };
        accountingEntry: {
            id: string;
            sourceType: string;
            sourceRef: string;
            occurredAt: Date;
        } | null;
    } & {
        id: string;
        idempotencyKey: string;
        point: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.CashIncassationStatus;
        shiftId: string;
        reference: string | null;
        destinationCode: string;
        depositedBy: string;
        depositedAt: Date;
        reconciledAt: Date | null;
    })[]>;
    cashIncassation(user: AuthPrincipal, shiftId: string, idempotencyKey: string | undefined, dto: CreateCashIncassationDto): Promise<{
        idempotent: boolean;
        accountingEntry: {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        } | null;
        id: string;
        idempotencyKey: string;
        point: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.CashIncassationStatus;
        shiftId: string;
        reference: string | null;
        destinationCode: string;
        depositedBy: string;
        depositedAt: Date;
        reconciledAt: Date | null;
    }>;
    periods(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: import(".prisma/client").$Enums.AccountingPeriodStatus;
        createdAt: Date;
        period: string;
        lastCloseIdempotencyKey: string | null;
        closedBy: string | null;
        closedAt: Date | null;
        updatedAt: Date;
    }[]>;
    periodReadiness(period: string): Promise<{
        period: string;
        from: Date;
        to: Date;
        ready: boolean;
        blockers: {
            code: string;
            message: string;
        }[];
        counts: {
            openSettlements: number;
            openCashShifts: number;
            openRefunds: number;
            openSupplierInvoices: number;
            openBankStatements: number;
            openPayrollRuns: number;
            openAdvances: number;
            openForeignExpenses: number;
        };
    }>;
    openingBalances(): import(".prisma/client").Prisma.PrismaPromise<({
        lines: {
            id: string;
            credit: number;
            debit: number;
            accountCode: string;
            memo: string | null;
            openingBalanceId: string;
        }[];
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
    } & {
        id: string;
        idempotencyKey: string;
        description: string;
        createdBy: string;
        accountingEntryId: string;
        createdAt: Date;
        period: string;
        documentNumber: string;
    })[]>;
    openingBalance(user: AuthPrincipal, dto: CreateOpeningBalanceDto): Promise<{
        idempotent: boolean;
        lines: {
            id: string;
            credit: number;
            debit: number;
            accountCode: string;
            memo: string | null;
            openingBalanceId: string;
        }[];
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
        id: string;
        idempotencyKey: string;
        description: string;
        createdBy: string;
        accountingEntryId: string;
        createdAt: Date;
        period: string;
        documentNumber: string;
    }>;
    fixedAssets(): import(".prisma/client").Prisma.PrismaPromise<({
        acquisitionAccountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
        depreciationEntries: ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            postedAt: Date;
            accountingEntryId: string;
            amount: number;
            period: string;
            fixedAssetId: string;
            openingAccumulated: number;
            closingAccumulated: number;
            postedBy: string;
        })[];
    } & {
        id: string;
        name: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.FixedAssetStatus;
        createdAt: Date;
        updatedAt: Date;
        acquisitionCost: number;
        category: string;
        externalRef: string | null;
        fundingAccountCode: string;
        assetNumber: string;
        serialNumber: string | null;
        usefulLifeMonths: number;
        acquiredAt: Date;
        inServiceAt: Date;
        accumulatedDepreciation: number;
        acquisitionAccountingEntryId: string;
    })[]>;
    createFixedAsset(user: AuthPrincipal, dto: CreateFixedAssetDto): Promise<{
        idempotent: boolean;
        acquisitionAccountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
        depreciationEntries: {
            id: string;
            idempotencyKey: string;
            postedAt: Date;
            accountingEntryId: string;
            amount: number;
            period: string;
            fixedAssetId: string;
            openingAccumulated: number;
            closingAccumulated: number;
            postedBy: string;
        }[];
        id: string;
        name: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.FixedAssetStatus;
        createdAt: Date;
        updatedAt: Date;
        acquisitionCost: number;
        category: string;
        externalRef: string | null;
        fundingAccountCode: string;
        assetNumber: string;
        serialNumber: string | null;
        usefulLifeMonths: number;
        acquiredAt: Date;
        inServiceAt: Date;
        accumulatedDepreciation: number;
        acquisitionAccountingEntryId: string;
    }>;
    depreciateFixedAsset(user: AuthPrincipal, id: string, dto: DepreciateFixedAssetDto): Promise<{
        idempotent: boolean;
        fixedAsset: {
            id: string;
            name: string;
            idempotencyKey: string;
            createdBy: string;
            status: import(".prisma/client").$Enums.FixedAssetStatus;
            createdAt: Date;
            updatedAt: Date;
            acquisitionCost: number;
            category: string;
            externalRef: string | null;
            fundingAccountCode: string;
            assetNumber: string;
            serialNumber: string | null;
            usefulLifeMonths: number;
            acquiredAt: Date;
            inServiceAt: Date;
            accumulatedDepreciation: number;
            acquisitionAccountingEntryId: string;
        };
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
        id: string;
        idempotencyKey: string;
        postedAt: Date;
        accountingEntryId: string;
        amount: number;
        period: string;
        fixedAssetId: string;
        openingAccumulated: number;
        closingAccumulated: number;
        postedBy: string;
    }>;
    accountableAdvances(query: AccountableAdvanceQueryDto): Promise<({
        returns: ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            returnedAt: Date;
            returnedBy: string;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
        })[];
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
        staff: {
            id: string;
            point: string;
            username: string;
            role: import(".prisma/client").$Enums.Role;
        };
        settlements: ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            description: string;
            accountingEntryId: string;
            amount: number;
            settledBy: string;
            settledAt: Date;
            advanceId: string;
            expenseAccountCode: string;
        })[];
        reimbursements: ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
            reimbursedAt: Date;
            reimbursedBy: string;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        point: string;
        accountingEntryId: string;
        amount: number;
        status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
        createdAt: Date;
        updatedAt: Date;
        purpose: string;
        staffId: string;
        settledAmount: number;
        dueAt: Date | null;
        issuedBy: string;
        issuedAt: Date;
        paymentReference: string;
        fundingAccountCode: string;
        returnedAmount: number;
        reimbursedAmount: number;
    } & {
        balance: number;
    })[]>;
    createAccountableAdvance(user: AuthPrincipal, dto: CreateAccountableAdvanceDto): Promise<{
        returns: {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            returnedAt: Date;
            returnedBy: string;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
        }[];
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        };
        staff: {
            id: string;
            point: string;
            createdAt: Date;
            active: boolean;
            username: string;
            role: import(".prisma/client").$Enums.Role;
            passwordHash: string;
            totpSecret: string | null;
            totpEnabled: boolean;
            totpLastToken: string | null;
        };
        settlements: {
            id: string;
            idempotencyKey: string;
            description: string;
            accountingEntryId: string;
            amount: number;
            settledBy: string;
            settledAt: Date;
            advanceId: string;
            expenseAccountCode: string;
        }[];
        reimbursements: {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
            reimbursedAt: Date;
            reimbursedBy: string;
        }[];
    } & {
        id: string;
        idempotencyKey: string;
        point: string;
        accountingEntryId: string;
        amount: number;
        status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
        createdAt: Date;
        updatedAt: Date;
        purpose: string;
        staffId: string;
        settledAmount: number;
        dueAt: Date | null;
        issuedBy: string;
        issuedAt: Date;
        paymentReference: string;
        fundingAccountCode: string;
        returnedAmount: number;
        reimbursedAmount: number;
    } & {
        idempotent: boolean;
        balance: number;
    }>;
    settleAccountableAdvance(user: AuthPrincipal, id: string, dto: SettleAccountableAdvanceDto): Promise<{
        advance: {
            amount: number;
            settledAmount: number;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        };
        settlement: {
            fundingAccountCode?: string | undefined;
            paymentReference?: string | undefined;
            expenseAccountCode?: string | undefined;
            description?: string | undefined;
            settledBy?: string | undefined;
            settledAt?: Date | undefined;
            id: string;
            advanceId: string;
            idempotencyKey: string;
            amount: number;
            accountingEntryId: string;
            accountingEntry: unknown;
        };
        idempotent: boolean;
    }>;
    returnAccountableAdvance(user: AuthPrincipal, id: string, dto: CloseAccountableAdvanceDto): Promise<{
        [x: string]: boolean | ({
            amount: number;
            settledAmount: number;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            advance: {
                returns: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    returnedAt: Date;
                    returnedBy: string;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                }[];
                accountingEntry: {
                    lines: {
                        id: string;
                        credit: number;
                        debit: number;
                        entryId: string;
                        accountCode: string;
                        memo: string | null;
                    }[];
                } & {
                    id: string;
                    idempotencyKey: string;
                    sourceType: string;
                    sourceRef: string;
                    description: string;
                    point: string | null;
                    currency: string;
                    documentAmount: number | null;
                    exchangeRateMicros: number;
                    baseAmount: number | null;
                    taxCode: string;
                    taxRateBps: number;
                    taxAmount: number;
                    occurredAt: Date;
                    postedAt: Date;
                    createdBy: string;
                    reversalOfId: string | null;
                };
                staff: {
                    id: string;
                    point: string;
                    createdAt: Date;
                    active: boolean;
                    username: string;
                    role: import(".prisma/client").$Enums.Role;
                    passwordHash: string;
                    totpSecret: string | null;
                    totpEnabled: boolean;
                    totpLastToken: string | null;
                };
                settlements: {
                    id: string;
                    idempotencyKey: string;
                    description: string;
                    accountingEntryId: string;
                    amount: number;
                    settledBy: string;
                    settledAt: Date;
                    advanceId: string;
                    expenseAccountCode: string;
                }[];
                reimbursements: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                    reimbursedAt: Date;
                    reimbursedBy: string;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                point: string;
                accountingEntryId: string;
                amount: number;
                status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
                createdAt: Date;
                updatedAt: Date;
                purpose: string;
                staffId: string;
                settledAmount: number;
                dueAt: Date | null;
                issuedBy: string;
                issuedAt: Date;
                paymentReference: string;
                fundingAccountCode: string;
                returnedAmount: number;
                reimbursedAmount: number;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            returnedAt: Date;
            returnedBy: string;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            advance: {
                returns: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    returnedAt: Date;
                    returnedBy: string;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                }[];
                accountingEntry: {
                    lines: {
                        id: string;
                        credit: number;
                        debit: number;
                        entryId: string;
                        accountCode: string;
                        memo: string | null;
                    }[];
                } & {
                    id: string;
                    idempotencyKey: string;
                    sourceType: string;
                    sourceRef: string;
                    description: string;
                    point: string | null;
                    currency: string;
                    documentAmount: number | null;
                    exchangeRateMicros: number;
                    baseAmount: number | null;
                    taxCode: string;
                    taxRateBps: number;
                    taxAmount: number;
                    occurredAt: Date;
                    postedAt: Date;
                    createdBy: string;
                    reversalOfId: string | null;
                };
                staff: {
                    id: string;
                    point: string;
                    createdAt: Date;
                    active: boolean;
                    username: string;
                    role: import(".prisma/client").$Enums.Role;
                    passwordHash: string;
                    totpSecret: string | null;
                    totpEnabled: boolean;
                    totpLastToken: string | null;
                };
                settlements: {
                    id: string;
                    idempotencyKey: string;
                    description: string;
                    accountingEntryId: string;
                    amount: number;
                    settledBy: string;
                    settledAt: Date;
                    advanceId: string;
                    expenseAccountCode: string;
                }[];
                reimbursements: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                    reimbursedAt: Date;
                    reimbursedBy: string;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                point: string;
                accountingEntryId: string;
                amount: number;
                status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
                createdAt: Date;
                updatedAt: Date;
                purpose: string;
                staffId: string;
                settledAmount: number;
                dueAt: Date | null;
                issuedBy: string;
                issuedAt: Date;
                paymentReference: string;
                fundingAccountCode: string;
                returnedAmount: number;
                reimbursedAmount: number;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
            reimbursedAt: Date;
            reimbursedBy: string;
        });
        advance: {
            amount: number;
            settledAmount: number;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        };
        idempotent: boolean;
    } | {
        [x: string]: boolean | ({
            returns: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                returnedAt: Date;
                returnedBy: string;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
            }[];
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            staff: {
                id: string;
                point: string;
                createdAt: Date;
                active: boolean;
                username: string;
                role: import(".prisma/client").$Enums.Role;
                passwordHash: string;
                totpSecret: string | null;
                totpEnabled: boolean;
                totpLastToken: string | null;
            };
            settlements: {
                id: string;
                idempotencyKey: string;
                description: string;
                accountingEntryId: string;
                amount: number;
                settledBy: string;
                settledAt: Date;
                advanceId: string;
                expenseAccountCode: string;
            }[];
            reimbursements: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
                reimbursedAt: Date;
                reimbursedBy: string;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            accountingEntryId: string;
            amount: number;
            status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
            createdAt: Date;
            updatedAt: Date;
            purpose: string;
            staffId: string;
            settledAmount: number;
            dueAt: Date | null;
            issuedBy: string;
            issuedAt: Date;
            paymentReference: string;
            fundingAccountCode: string;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            returnedAt: Date;
            returnedBy: string;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
            reimbursedAt: Date;
            reimbursedBy: string;
        });
        advance: {
            returns: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                returnedAt: Date;
                returnedBy: string;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
            }[];
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            staff: {
                id: string;
                point: string;
                createdAt: Date;
                active: boolean;
                username: string;
                role: import(".prisma/client").$Enums.Role;
                passwordHash: string;
                totpSecret: string | null;
                totpEnabled: boolean;
                totpLastToken: string | null;
            };
            settlements: {
                id: string;
                idempotencyKey: string;
                description: string;
                accountingEntryId: string;
                amount: number;
                settledBy: string;
                settledAt: Date;
                advanceId: string;
                expenseAccountCode: string;
            }[];
            reimbursements: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
                reimbursedAt: Date;
                reimbursedBy: string;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            accountingEntryId: string;
            amount: number;
            status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
            createdAt: Date;
            updatedAt: Date;
            purpose: string;
            staffId: string;
            settledAmount: number;
            dueAt: Date | null;
            issuedBy: string;
            issuedAt: Date;
            paymentReference: string;
            fundingAccountCode: string;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        };
        idempotent: boolean;
    }>;
    reimburseAccountableAdvance(user: AuthPrincipal, id: string, dto: CloseAccountableAdvanceDto): Promise<{
        [x: string]: boolean | ({
            amount: number;
            settledAmount: number;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            advance: {
                returns: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    returnedAt: Date;
                    returnedBy: string;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                }[];
                accountingEntry: {
                    lines: {
                        id: string;
                        credit: number;
                        debit: number;
                        entryId: string;
                        accountCode: string;
                        memo: string | null;
                    }[];
                } & {
                    id: string;
                    idempotencyKey: string;
                    sourceType: string;
                    sourceRef: string;
                    description: string;
                    point: string | null;
                    currency: string;
                    documentAmount: number | null;
                    exchangeRateMicros: number;
                    baseAmount: number | null;
                    taxCode: string;
                    taxRateBps: number;
                    taxAmount: number;
                    occurredAt: Date;
                    postedAt: Date;
                    createdBy: string;
                    reversalOfId: string | null;
                };
                staff: {
                    id: string;
                    point: string;
                    createdAt: Date;
                    active: boolean;
                    username: string;
                    role: import(".prisma/client").$Enums.Role;
                    passwordHash: string;
                    totpSecret: string | null;
                    totpEnabled: boolean;
                    totpLastToken: string | null;
                };
                settlements: {
                    id: string;
                    idempotencyKey: string;
                    description: string;
                    accountingEntryId: string;
                    amount: number;
                    settledBy: string;
                    settledAt: Date;
                    advanceId: string;
                    expenseAccountCode: string;
                }[];
                reimbursements: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                    reimbursedAt: Date;
                    reimbursedBy: string;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                point: string;
                accountingEntryId: string;
                amount: number;
                status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
                createdAt: Date;
                updatedAt: Date;
                purpose: string;
                staffId: string;
                settledAmount: number;
                dueAt: Date | null;
                issuedBy: string;
                issuedAt: Date;
                paymentReference: string;
                fundingAccountCode: string;
                returnedAmount: number;
                reimbursedAmount: number;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            returnedAt: Date;
            returnedBy: string;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            advance: {
                returns: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    returnedAt: Date;
                    returnedBy: string;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                }[];
                accountingEntry: {
                    lines: {
                        id: string;
                        credit: number;
                        debit: number;
                        entryId: string;
                        accountCode: string;
                        memo: string | null;
                    }[];
                } & {
                    id: string;
                    idempotencyKey: string;
                    sourceType: string;
                    sourceRef: string;
                    description: string;
                    point: string | null;
                    currency: string;
                    documentAmount: number | null;
                    exchangeRateMicros: number;
                    baseAmount: number | null;
                    taxCode: string;
                    taxRateBps: number;
                    taxAmount: number;
                    occurredAt: Date;
                    postedAt: Date;
                    createdBy: string;
                    reversalOfId: string | null;
                };
                staff: {
                    id: string;
                    point: string;
                    createdAt: Date;
                    active: boolean;
                    username: string;
                    role: import(".prisma/client").$Enums.Role;
                    passwordHash: string;
                    totpSecret: string | null;
                    totpEnabled: boolean;
                    totpLastToken: string | null;
                };
                settlements: {
                    id: string;
                    idempotencyKey: string;
                    description: string;
                    accountingEntryId: string;
                    amount: number;
                    settledBy: string;
                    settledAt: Date;
                    advanceId: string;
                    expenseAccountCode: string;
                }[];
                reimbursements: {
                    id: string;
                    idempotencyKey: string;
                    accountingEntryId: string;
                    amount: number;
                    paymentReference: string;
                    advanceId: string;
                    fundingAccountCode: string;
                    reimbursedAt: Date;
                    reimbursedBy: string;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                point: string;
                accountingEntryId: string;
                amount: number;
                status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
                createdAt: Date;
                updatedAt: Date;
                purpose: string;
                staffId: string;
                settledAmount: number;
                dueAt: Date | null;
                issuedBy: string;
                issuedAt: Date;
                paymentReference: string;
                fundingAccountCode: string;
                returnedAmount: number;
                reimbursedAmount: number;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
            reimbursedAt: Date;
            reimbursedBy: string;
        });
        advance: {
            amount: number;
            settledAmount: number;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        };
        idempotent: boolean;
    } | {
        [x: string]: boolean | ({
            returns: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                returnedAt: Date;
                returnedBy: string;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
            }[];
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            staff: {
                id: string;
                point: string;
                createdAt: Date;
                active: boolean;
                username: string;
                role: import(".prisma/client").$Enums.Role;
                passwordHash: string;
                totpSecret: string | null;
                totpEnabled: boolean;
                totpLastToken: string | null;
            };
            settlements: {
                id: string;
                idempotencyKey: string;
                description: string;
                accountingEntryId: string;
                amount: number;
                settledBy: string;
                settledAt: Date;
                advanceId: string;
                expenseAccountCode: string;
            }[];
            reimbursements: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
                reimbursedAt: Date;
                reimbursedBy: string;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            accountingEntryId: string;
            amount: number;
            status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
            createdAt: Date;
            updatedAt: Date;
            purpose: string;
            staffId: string;
            settledAmount: number;
            dueAt: Date | null;
            issuedBy: string;
            issuedAt: Date;
            paymentReference: string;
            fundingAccountCode: string;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            returnedAt: Date;
            returnedBy: string;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
        }) | ({
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            paymentReference: string;
            advanceId: string;
            fundingAccountCode: string;
            reimbursedAt: Date;
            reimbursedBy: string;
        });
        advance: {
            returns: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                returnedAt: Date;
                returnedBy: string;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
            }[];
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            };
            staff: {
                id: string;
                point: string;
                createdAt: Date;
                active: boolean;
                username: string;
                role: import(".prisma/client").$Enums.Role;
                passwordHash: string;
                totpSecret: string | null;
                totpEnabled: boolean;
                totpLastToken: string | null;
            };
            settlements: {
                id: string;
                idempotencyKey: string;
                description: string;
                accountingEntryId: string;
                amount: number;
                settledBy: string;
                settledAt: Date;
                advanceId: string;
                expenseAccountCode: string;
            }[];
            reimbursements: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                paymentReference: string;
                advanceId: string;
                fundingAccountCode: string;
                reimbursedAt: Date;
                reimbursedBy: string;
            }[];
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            accountingEntryId: string;
            amount: number;
            status: import(".prisma/client").$Enums.AccountableAdvanceStatus;
            createdAt: Date;
            updatedAt: Date;
            purpose: string;
            staffId: string;
            settledAmount: number;
            dueAt: Date | null;
            issuedBy: string;
            issuedAt: Date;
            paymentReference: string;
            fundingAccountCode: string;
            returnedAmount: number;
            reimbursedAmount: number;
        } & {
            balance: number;
        };
        idempotent: boolean;
    }>;
    closePeriod(user: AuthPrincipal, period: string, dto: CloseAccountingPeriodDto): Promise<{
        idempotent: boolean;
        id: string;
        status: import(".prisma/client").$Enums.AccountingPeriodStatus;
        createdAt: Date;
        period: string;
        lastCloseIdempotencyKey: string | null;
        closedBy: string | null;
        closedAt: Date | null;
        updatedAt: Date;
    }>;
    taxPeriod(period: string, point?: string): Promise<{
        period: string;
        point: string | null;
        from: Date;
        to: Date;
        status: import(".prisma/client").$Enums.AccountingPeriodStatus;
        outputTax: number;
        inputTax: number;
        outputNet: number;
        inputNet: number;
        offsetAmount: number;
        payableAmount: number;
        recoverableAmount: number;
        settlement: ({
            accountingEntry: {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            } | null;
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            createdBy: string;
            accountingEntryId: string | null;
            createdAt: Date;
            period: string;
            outputTax: number;
            inputTax: number;
            offsetAmount: number;
            payableAmount: number;
            recoverableAmount: number;
        }) | null;
    }>;
    settleTaxPeriod(user: AuthPrincipal, period: string, dto: SettleTaxPeriodDto): Promise<{
        settlement: {
            accountingEntry: {
                id: string;
                idempotencyKey: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                point: string | null;
                currency: string;
                documentAmount: number | null;
                exchangeRateMicros: number;
                baseAmount: number | null;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                reversalOfId: string | null;
            } | null;
        } & {
            id: string;
            idempotencyKey: string;
            point: string;
            createdBy: string;
            accountingEntryId: string | null;
            createdAt: Date;
            period: string;
            outputTax: number;
            inputTax: number;
            offsetAmount: number;
            payableAmount: number;
            recoverableAmount: number;
        };
        idempotent: boolean;
        period: string;
        point: string | null;
        from: Date;
        to: Date;
        status: import(".prisma/client").$Enums.AccountingPeriodStatus;
        outputTax: number;
        inputTax: number;
        outputNet: number;
        inputNet: number;
        offsetAmount: number;
        payableAmount: number;
        recoverableAmount: number;
    }>;
    apAging(query: SupplierAgingQueryDto): Promise<{
        asOf: Date;
        rows: {
            id: string;
            invoiceNumber: string;
            supplier: {
                id: string;
                name: string;
            };
            purchaseOrder: {
                number: string;
                id: string;
            };
            amount: number;
            paidAmount: number;
            creditApplied: number;
            advanceApplied: number;
            creditReceivable: number;
            outstanding: number;
            dueDate: Date;
            ageDays: number;
            bucket: string;
            status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
            accountingEntry: {
                id: string;
                sourceType: string;
                sourceRef: string;
            } | null;
            payments: {
                id: string;
                accountingEntryId: string;
                amount: number;
                paidAt: Date;
                paymentAccountCode: string;
                paymentReference: string;
            }[];
            creditNotes: {
                id: string;
                accountingEntryId: string | null;
                amount: number;
                noteNumber: string;
                appliedAt: Date | null;
            }[];
            advanceAllocations: {
                id: string;
                accountingEntryId: string;
                amount: number;
                appliedAt: Date;
                advance: {
                    id: string;
                    paymentReference: string;
                };
            }[];
        }[];
        totals: {
            [k: string]: number;
        };
        totalOutstanding: number;
        totalCreditReceivable: number;
        totalCreditApplied: number;
        totalAdvanceApplied: number;
        supplierCount: number;
        truncated: boolean;
    }>;
    arAging(query: ArAgingQueryDto): Promise<{
        asOf: Date;
        rows: {
            id: string;
            customer: {
                id: string;
                name: string;
            };
            order: {
                id: string;
                status: import(".prisma/client").$Enums.OrderStatus;
                createdAt: Date;
                channel: string;
                total: number;
            } | {
                id: string;
                channel: string;
                total: number;
                status: "unknown";
                createdAt: Date;
            };
            principal: number;
            balance: number;
            outstanding: number;
            currentBalance: number;
            paidAmount: number;
            installments: number;
            dueDate: Date;
            ageDays: number;
            bucket: string;
            status: string;
            accountingEntry: {
                id: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                documentAmount: number | null;
                taxAmount: number;
                occurredAt: Date;
                postedAt: Date;
                createdBy: string;
                lines: {
                    credit: number;
                    debit: number;
                    accountCode: string;
                    memo: string | null;
                }[];
            } | null;
            payments: {
                id: string;
                point: string | null;
                txnId: string | null;
                orderId: string | null;
                amount: number;
                status: import(".prisma/client").$Enums.PaymentStatus;
                receivedBy: string | null;
                createdAt: Date;
                accountingEntry: {
                    id: string;
                    sourceType: string;
                    sourceRef: string;
                    description: string;
                    occurredAt: Date;
                    postedAt: Date;
                    lines: {
                        credit: number;
                        debit: number;
                        accountCode: string;
                        memo: string | null;
                    }[];
                } | null;
            }[];
        }[];
        totals: {
            [k: string]: number;
        };
        totalPrincipal: number;
        totalPaid: number;
        totalOutstanding: number;
        customerCount: number;
    }>;
    arAgingDocument(id: string, query: ArAgingQueryDto): Promise<{
        id: string;
        customer: {
            id: string;
            name: string;
        };
        order: {
            id: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            createdAt: Date;
            channel: string;
            total: number;
        } | {
            id: string;
            channel: string;
            total: number;
            status: "unknown";
            createdAt: Date;
        };
        principal: number;
        balance: number;
        outstanding: number;
        currentBalance: number;
        paidAmount: number;
        installments: number;
        dueDate: Date;
        ageDays: number;
        bucket: string;
        status: string;
        accountingEntry: {
            id: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            documentAmount: number | null;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            lines: {
                credit: number;
                debit: number;
                accountCode: string;
                memo: string | null;
            }[];
        } | null;
        payments: {
            id: string;
            point: string | null;
            txnId: string | null;
            orderId: string | null;
            amount: number;
            status: import(".prisma/client").$Enums.PaymentStatus;
            receivedBy: string | null;
            createdAt: Date;
            accountingEntry: {
                id: string;
                sourceType: string;
                sourceRef: string;
                description: string;
                occurredAt: Date;
                postedAt: Date;
                lines: {
                    credit: number;
                    debit: number;
                    accountCode: string;
                    memo: string | null;
                }[];
            } | null;
        }[];
        asOf: Date;
    }>;
    journal(query: FinanceAccountingQueryDto): Promise<({
        lines: ({
            account: {
                type: import(".prisma/client").$Enums.AccountingAccountType;
                name: string;
                code: string;
                createdAt: Date;
                system: boolean;
                active: boolean;
            };
        } & {
            id: string;
            credit: number;
            debit: number;
            entryId: string;
            accountCode: string;
            memo: string | null;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        sourceType: string;
        sourceRef: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number | null;
        exchangeRateMicros: number;
        baseAmount: number | null;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        occurredAt: Date;
        postedAt: Date;
        createdBy: string;
        reversalOfId: string | null;
    })[]>;
    manualAdjustments(status?: string): Promise<{
        id: string;
        approvalId: string;
        action: string;
        requester: string;
        approver: string | null;
        status: import(".prisma/client").$Enums.ApprovalStatus;
        reason: string;
        idempotencyKey: string | null;
        sourceRef: string | null;
        createdAt: Date;
        snapshot: {} | null;
        accountingEntry: ({
            lines: ({
                account: {
                    type: import(".prisma/client").$Enums.AccountingAccountType;
                    name: string;
                    code: string;
                    createdAt: Date;
                    system: boolean;
                    active: boolean;
                };
            } & {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            })[];
        } & {
            id: string;
            idempotencyKey: string;
            sourceType: string;
            sourceRef: string;
            description: string;
            point: string | null;
            currency: string;
            documentAmount: number | null;
            exchangeRateMicros: number;
            baseAmount: number | null;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            occurredAt: Date;
            postedAt: Date;
            createdBy: string;
            reversalOfId: string | null;
        }) | null;
    }[]>;
    manualAdjustment(user: AuthPrincipal, dto: CreateManualAdjustmentDto): Promise<{
        approvalId: string;
        status: import(".prisma/client").$Enums.ApprovalStatus;
        idempotent: boolean;
        snapshot: unknown;
    }>;
    journalExport(query: FinanceAccountingQueryDto, response: Response): Promise<Response<any, Record<string, any>>>;
    reverseJournal(user: AuthPrincipal, id: string, dto: ReverseAccountingEntryDto): Promise<{
        idempotent: boolean;
        lines: {
            id: string;
            credit: number;
            debit: number;
            entryId: string;
            accountCode: string;
            memo: string | null;
        }[];
        id: string;
        idempotencyKey: string;
        sourceType: string;
        sourceRef: string;
        description: string;
        point: string | null;
        currency: string;
        documentAmount: number | null;
        exchangeRateMicros: number;
        baseAmount: number | null;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        occurredAt: Date;
        postedAt: Date;
        createdBy: string;
        reversalOfId: string | null;
    }>;
    trialBalance(query: FinanceAccountingQueryDto): Promise<{
        from: Date;
        to: Date;
        point: string | null;
        totalDebit: number;
        totalCredit: number;
        balanced: boolean;
        coverage: {
            complete: boolean;
            sourceTypes: string[];
            note: string;
        };
        rows: {
            code: string;
            name: string;
            type: import(".prisma/client").$Enums.AccountingAccountType;
            debit: number;
            credit: number;
            balance: number;
        }[];
    }>;
    statements(query: FinanceAccountingQueryDto): Promise<{
        from: Date;
        to: Date;
        point: string | null;
        source: string;
        entries: number;
        balanced: boolean;
        journal: {
            debit: number;
            credit: number;
        };
        profitAndLoss: {
            revenue: number;
            expenses: number;
            netProfit: number;
            rows: {
                balance: number;
                debit: number;
                credit: number;
                name: string;
                type: import(".prisma/client").$Enums.AccountingAccountType;
                code: string;
            }[];
        };
        balanceSheet: {
            assets: number;
            liabilities: number;
            equity: number;
            currentPeriodProfit: number;
            liabilitiesAndEquity: number;
            balanced: boolean;
            rows: {
                balance: number;
                debit: number;
                credit: number;
                name: string;
                type: import(".prisma/client").$Enums.AccountingAccountType;
                code: string;
            }[];
        };
        cashFlow: {
            cashMovement: number;
            rows: {
                balance: number;
                debit: number;
                credit: number;
                name: string;
                type: import(".prisma/client").$Enums.AccountingAccountType;
                code: string;
            }[];
        };
    }>;
    budgets(query: FinancePeriodQueryDto): Promise<{
        point: string | null;
        createdAt: string;
        updatedAt: string;
        id: string;
        period: string;
        category: string;
        amount: number;
        version: number;
        createdBy: string;
        updatedBy: string;
    }[]>;
    setBudget(user: AuthPrincipal, dto: SetFinanceBudgetDto): Promise<{
        idempotent: boolean;
    }>;
    planFact(query: FinancePeriodQueryDto): Promise<{
        period: string;
        point: string | null;
        plan: number;
        actual: number;
        variance: number;
        usagePct: number | null;
        rows: {
            category: "payroll" | "rent" | "logistics" | "marketing" | "utilities" | "procurement" | "other";
            plan: number;
            actual: number;
            variance: number;
            usagePct: number | null;
        }[];
    }>;
    settlementSources(query: FinanceSettlementQueryDto): Promise<{
        sourceType: "refund" | "courier_cod" | "provider_payment" | "pos_shift";
        sourceRef: string;
        label: string;
        expectedAmount: number;
        suggestedActualAmount: number;
        point: string | null;
        occurredAt: Date;
    }[]>;
    settlements(): import(".prisma/client").Prisma.PrismaPromise<({
        lines: {
            id: string;
            sourceType: import(".prisma/client").$Enums.FinanceSettlementSourceType;
            sourceRef: string;
            status: import(".prisma/client").$Enums.FinanceSettlementLineStatus;
            createdAt: Date;
            updatedAt: Date;
            reason: string | null;
            label: string;
            runId: string;
            resolvedBy: string | null;
            resolvedAt: Date | null;
            resolutionReason: string | null;
            actualAmount: number;
            adjustmentAmount: number;
            reconciledAt: Date | null;
            variance: number;
            expectedAmount: number;
        }[];
    } & {
        id: string;
        point: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.FinanceSettlementStatus;
        createdAt: Date;
        closedBy: string | null;
        closedAt: Date | null;
        updatedAt: Date;
        note: string | null;
        periodStart: Date;
        periodEnd: Date;
        expectedTotal: number;
        actualTotal: number;
        adjustmentTotal: number;
        variance: number;
    })[]>;
    createSettlement(user: AuthPrincipal, dto: CreateFinanceSettlementDto): Promise<{
        idempotent: boolean;
    }>;
    resolveSettlement(user: AuthPrincipal, id: string, dto: ResolveFinanceSettlementDto): Promise<{
        idempotent: boolean;
    }>;
    closeSettlement(user: AuthPrincipal, id: string, dto: CloseFinanceSettlementDto): Promise<{
        idempotent: boolean;
    }>;
}
