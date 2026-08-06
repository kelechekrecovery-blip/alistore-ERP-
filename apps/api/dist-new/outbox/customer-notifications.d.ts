import { Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { OutboxChannel } from './outbox.types';
export interface CustomerNoticeInput {
    customerId: string;
    template: string;
    payload?: Record<string, unknown>;
    channel?: OutboxChannel;
    transactional?: boolean;
    dedupKey?: string;
}
export type SupplyCustomerTemplate = 'supply_deposit_received' | 'supply_po_sent' | 'supply_supplier_confirmed' | 'supply_late' | 'supply_received' | 'supply_ready' | 'supply_balance_due' | 'supply_cancellation_requested' | 'supply_cancellation_owner_review' | 'supply_refund_queued' | 'supply_refund_completed' | 'supply_refund_failed' | 'order_no_show_reminder';
export interface SupplyCustomerNoticeInput {
    customerId: string;
    template: SupplyCustomerTemplate;
    eventKey: string;
    payload: {
        orderId: string;
        amount?: number;
        expectedAt?: string;
        reminderDay?: 1 | 3 | 7 | 13;
        refundId?: string;
    };
    channel?: OutboxChannel;
}
export declare function enqueueConsentedCustomerNotice(tx: Prisma.TransactionClient, outbox: OutboxService, input: CustomerNoticeInput): Promise<boolean>;
export declare function enqueueSupplyCustomerNotice(tx: Prisma.TransactionClient, outbox: OutboxService, input: SupplyCustomerNoticeInput): Promise<boolean>;
export interface StaffNoticeInput {
    template: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    dedupKey?: string;
}
export declare function enqueueStaffNotice(tx: Prisma.TransactionClient, outbox: OutboxService, input: StaffNoticeInput): Promise<number>;
export declare function customerNotificationProjection(input: CustomerNoticeInput): {
    title: string;
    detail: string;
    symbol: string;
    route: string;
    referenceId: string | undefined;
};
export declare function redactCustomerNotificationPayload(payload: Record<string, unknown>): Record<string, unknown>;
