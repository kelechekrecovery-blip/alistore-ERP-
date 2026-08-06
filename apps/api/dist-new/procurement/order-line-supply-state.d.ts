import { OrderLineSupplyStatus } from '@prisma/client';
export declare const ALLOWED_TRANSITIONS: Record<OrderLineSupplyStatus, OrderLineSupplyStatus[]>;
export declare function canTransition(from: OrderLineSupplyStatus, to: OrderLineSupplyStatus): boolean;
export declare function assertTransition(from: OrderLineSupplyStatus, to: OrderLineSupplyStatus): void;
export declare function isSupplyFulfilled(status: OrderLineSupplyStatus): boolean;
