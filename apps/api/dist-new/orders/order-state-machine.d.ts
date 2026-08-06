import { OrderLineFulfillmentStatus, OrderStatus } from '@prisma/client';
export declare const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare function canTransition(from: OrderStatus, to: OrderStatus): boolean;
export declare function assertTransition(from: OrderStatus, to: OrderStatus): void;
export declare function deriveOrderStatusFromLineFulfillment(statuses: OrderLineFulfillmentStatus[]): Extract<OrderStatus, 'confirmed' | 'ready_for_pickup' | 'completed'>;
