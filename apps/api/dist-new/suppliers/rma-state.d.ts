import { RmaStatus } from '@prisma/client';
export declare const RMA_RESOLUTIONS: RmaStatus[];
export declare const RMA_OPEN_STATUSES: RmaStatus[];
export declare function assertRmaTransition(from: RmaStatus, to: RmaStatus): void;
