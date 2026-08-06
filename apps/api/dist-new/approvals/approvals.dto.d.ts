import { Role } from '../rbac/permissions';
export declare class DecideApprovalDto {
    status: 'approved' | 'rejected';
    approver?: string;
    approverRole?: Role;
    reason?: string;
    totpToken?: string;
}
