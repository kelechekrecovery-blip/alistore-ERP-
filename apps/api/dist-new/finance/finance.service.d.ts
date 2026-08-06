import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCurrencyRateDto, CreateExpenseDto, CreateFinanceSettlementDto, FinanceAccountingQueryDto, FinanceSettlementQueryDto, PayExpenseDto, ResolveFinanceSettlementDto, CloseAccountingPeriodDto, SupplierAgingQueryDto, ReverseAccountingEntryDto, ImportBankStatementDto, ReconcileBankStatementLineDto, SetFinanceBudgetDto, CreateCashIncassationDto, CurrencyRateQueryDto, SETTLEMENT_SOURCE_TYPES, SettleTaxPeriodDto, CreateFixedAssetDto, CreateManualAdjustmentDto, DepreciateFixedAssetDto, CreateOpeningBalanceDto, AccountableAdvanceQueryDto, ArAgingQueryDto, CreateAccountableAdvanceDto, SettleAccountableAdvanceDto, CloseAccountableAdvanceDto, FxExposureQueryDto } from './finance.dto';
export declare class FinanceService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(status?: string): Prisma.PrismaPromise<({
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
    listAccountingAccounts(): Prisma.PrismaPromise<{
        type: import(".prisma/client").$Enums.AccountingAccountType;
        name: string;
        code: string;
        createdAt: Date;
        system: boolean;
        active: boolean;
    }[]>;
    listAccountingPeriods(): Prisma.PrismaPromise<{
        id: string;
        status: import(".prisma/client").$Enums.AccountingPeriodStatus;
        createdAt: Date;
        period: string;
        lastCloseIdempotencyKey: string | null;
        closedBy: string | null;
        closedAt: Date | null;
        updatedAt: Date;
    }[]>;
    accountingPeriodReadiness(rawPeriod: string): Promise<{
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
    listOpeningBalances(): Prisma.PrismaPromise<({
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
    listFixedAssets(): Prisma.PrismaPromise<({
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
    listAccountableAdvances(query: AccountableAdvanceQueryDto): Promise<({
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
    createAccountableAdvance(dto: CreateAccountableAdvanceDto, actor: string): Promise<{
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
    settleAccountableAdvance(id: string, dto: SettleAccountableAdvanceDto, actor: string): Promise<{
        advance: AccountableAdvanceBalanceShape & {
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
    returnAccountableAdvance(id: string, dto: CloseAccountableAdvanceDto, actor: string): Promise<{
        [x: string]: boolean | (AccountableAdvanceBalanceShape & {
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
        advance: AccountableAdvanceBalanceShape & {
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
    reimburseAccountableAdvance(id: string, dto: CloseAccountableAdvanceDto, actor: string): Promise<{
        [x: string]: boolean | (AccountableAdvanceBalanceShape & {
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
        advance: AccountableAdvanceBalanceShape & {
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
    private closeAccountableAdvance;
    createFixedAsset(dto: CreateFixedAssetDto, actor: string): Promise<{
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
    depreciateFixedAsset(id: string, dto: DepreciateFixedAssetDto, actor: string): Promise<{
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
    createOpeningBalance(dto: CreateOpeningBalanceDto, actor: string): Promise<{
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
    listCurrencyRates(query: CurrencyRateQueryDto): Prisma.PrismaPromise<{
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
    createCurrencyRate(dto: CreateCurrencyRateDto, actor: string): Promise<{
        idempotent: boolean;
        id: string;
        currency: string;
        baseCurrency: string;
        rateMicros: number;
        effectiveAt: Date;
        source: string;
    }>;
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
    listBankStatements(accountCode?: string): Prisma.PrismaPromise<({
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
    listCashIncassations(point?: string): Prisma.PrismaPromise<({
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
    collectableShifts(point?: string): Promise<{
        id: string;
        point: string;
        closedAt: Date | null;
        closeCash: number;
        deposited: number;
        available: number;
    }[]>;
    createCashIncassation(shiftId: string, dto: CreateCashIncassationDto, actor: string, idempotencyKey: string): Promise<{
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
    importBankStatement(dto: ImportBankStatementDto, actor: string): Promise<({
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
    reconcileBankStatementLine(id: string, dto: ReconcileBankStatementLineDto, actor: string): Promise<{
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
    closeAccountingPeriod(rawPeriod: string, dto: CloseAccountingPeriodDto, actor: string): Promise<{
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
    taxPeriod(rawPeriod: string, rawPoint?: string): Promise<{
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
    settleTaxPeriod(rawPeriod: string, dto: SettleTaxPeriodDto, actor: string): Promise<{
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
    accountingJournal(query: FinanceAccountingQueryDto): Promise<({
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
    supplierAging(query: SupplierAgingQueryDto): Promise<{
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
    customerAging(query: ArAgingQueryDto): Promise<{
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
    customerDebtDrilldown(id: string, query: ArAgingQueryDto): Promise<{
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
    accountingJournalExport(query: FinanceAccountingQueryDto): Promise<string>;
    listManualAdjustments(status?: string): Promise<{
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
    createManualAdjustment(dto: CreateManualAdjustmentDto, actor: string): Promise<{
        approvalId: string;
        status: import(".prisma/client").$Enums.ApprovalStatus;
        idempotent: boolean;
        snapshot: unknown;
    }>;
    reverseAccountingEntry(id: string, dto: ReverseAccountingEntryDto, actor: string): Promise<{
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
    financialStatements(query: FinanceAccountingQueryDto): Promise<{
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
    listBudgets(period: string, point?: string): Promise<{
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
    setBudget(dto: SetFinanceBudgetDto, actor: string): Promise<{
        idempotent: boolean;
    }>;
    planFact(period: string, point?: string): Promise<{
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
    listSettlements(): Prisma.PrismaPromise<({
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
    settlementSources(query: FinanceSettlementQueryDto): Promise<SettlementSource[]>;
    createSettlement(dto: CreateFinanceSettlementDto, actor: string): Promise<{
        idempotent: boolean;
    }>;
    resolveSettlement(runId: string, dto: ResolveFinanceSettlementDto, actor: string): Promise<{
        idempotent: boolean;
    }>;
    closeSettlement(runId: string, idempotencyKey: string, actor: string): Promise<{
        idempotent: boolean;
    }>;
    create(dto: CreateExpenseDto, actor: string): Promise<{
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
    approve(id: string, actor: string): Promise<{
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
    reject(id: string, note: string, actor: string): Promise<{
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
    pay(id: string, dto: PayExpenseDto, actor: string): Promise<{
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
    private transitionSubmitted;
}
type SettlementSourceType = (typeof SETTLEMENT_SOURCE_TYPES)[number];
type SettlementSource = {
    sourceType: SettlementSourceType;
    sourceRef: string;
    label: string;
    expectedAmount: number;
    suggestedActualAmount: number;
    point: string | null;
    occurredAt: Date;
};
type AccountableAdvanceBalanceShape = {
    amount: number;
    settledAmount: number;
    returnedAmount: number;
    reimbursedAmount: number;
};
export {};
