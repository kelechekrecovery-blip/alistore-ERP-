import type { PrismaClient } from '@prisma/client';
export interface ReferenceDataResult {
    accountsCreated: number;
    accountsTotal: number;
}
type ReferenceDataClient = Pick<PrismaClient, 'accountingAccount'>;
export declare function ensureReferenceData(prisma: ReferenceDataClient): Promise<ReferenceDataResult>;
export {};
