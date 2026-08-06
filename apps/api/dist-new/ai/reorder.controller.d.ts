import { AuthPrincipal } from '../auth/jwt.strategy';
import { ApprovalsService } from '../approvals/approvals.service';
import { ReorderService } from './reorder.service';
export declare class ReorderDraftApprovalDto {
    idempotencyKey: string;
    supplierId: string;
    location: string;
    unitCosts: Record<string, number>;
    reason?: string;
}
export declare class ReorderController {
    private readonly reorder;
    private readonly approvals;
    constructor(reorder: ReorderService, approvals: ApprovalsService);
    review(): Promise<import("./reorder.service").ReorderReport>;
    requestDraftApproval(user: AuthPrincipal, dto: ReorderDraftApprovalDto): Promise<{
        approvalId: string;
        status: "requested";
    }>;
}
