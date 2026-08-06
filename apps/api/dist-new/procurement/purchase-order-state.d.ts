import { PurchaseOrderStatus } from '@prisma/client';
export declare function assertCanSend(status: PurchaseOrderStatus): void;
export declare function assertCanReceive(status: PurchaseOrderStatus): void;
export declare function assertCanCancel(status: PurchaseOrderStatus): void;
