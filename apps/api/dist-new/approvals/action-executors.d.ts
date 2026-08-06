import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
export type ActionExecutor = (tx: Prisma.TransactionClient, payload: Record<string, unknown>, approver: string, approvalId: string, events: AuditInput[]) => Promise<void>;
export type ActionRejectionExecutor = (tx: Prisma.TransactionClient, payload: Record<string, unknown>, approver: string, approvalId: string, reason: string | null, events: AuditInput[]) => Promise<void>;
export declare const ACTION_EXECUTORS: Record<string, ActionExecutor>;
export declare const ACTION_REJECTION_EXECUTORS: Record<string, ActionRejectionExecutor>;
