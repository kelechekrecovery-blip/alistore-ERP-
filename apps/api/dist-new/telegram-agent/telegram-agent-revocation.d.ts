import { Prisma } from '@prisma/client';
type TelegramAgentSubject = {
    staffId: string;
    customerId?: never;
} | {
    customerId: string;
    staffId?: never;
};
export declare function revokeTelegramAgentAccessOnTx(tx: Prisma.TransactionClient, subject: TelegramAgentSubject, reason: string, deleteIdentity?: boolean): Promise<void>;
export {};
