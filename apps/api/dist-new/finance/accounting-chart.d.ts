import type { AccountingAccountType } from '@prisma/client';
export interface AccountingAccountSeed {
    code: string;
    name: string;
    type: AccountingAccountType;
    note?: string;
}
export declare const ACCOUNTING_ACCOUNT_SEED: readonly AccountingAccountSeed[];
