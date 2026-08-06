import { WarrantyStatus } from '@prisma/client';
export declare const WARRANTY_TRANSITIONS: Record<WarrantyStatus, WarrantyStatus[]>;
export declare function assertWarrantyTransition(from: WarrantyStatus, to: WarrantyStatus): void;
