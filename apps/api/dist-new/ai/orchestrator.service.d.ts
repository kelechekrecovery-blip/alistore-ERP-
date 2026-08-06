import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { InsightsService } from './insights.service';
import { PricingService } from './pricing.service';
import { ReorderService } from './reorder.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { CreateAiRunDto } from './orchestrator.dto';
type Actor = {
    customerId: string;
    typ: string;
    role?: string;
};
export declare class AiOrchestratorService {
    private readonly prisma;
    private readonly audit;
    private readonly insights;
    private readonly pricing;
    private readonly reorder;
    private readonly reports;
    private readonly approvals;
    constructor(prisma: PrismaService, audit: AuditService, insights: InsightsService, pricing: PricingService, reorder: ReorderService, reports: ReportsService, approvals: ApprovalsService);
    run(dto: CreateAiRunDto, actor: Actor): Promise<{
        runId: string;
        status: string;
        decision: {
            approvalId: string | undefined;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            summary: string;
            runId: string;
            confidence: number | null;
            requiresApproval: boolean;
            sourceRefs: string[];
            recommendation: import("@prisma/client/runtime/library").JsonValue;
        };
        output: unknown;
    }>;
    getRun(id: string, actor: Actor): Promise<{
        decisions: {
            approvalId: string | undefined;
            approvalStatus: import(".prisma/client").$Enums.ApprovalStatus | undefined;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            summary: string;
            runId: string;
            confidence: number | null;
            requiresApproval: boolean;
            sourceRefs: string[];
            recommendation: import("@prisma/client/runtime/library").JsonValue;
        }[];
        steps: {
            id: string;
            status: string;
            createdAt: Date;
            kind: string;
            runId: string;
            toolName: string | null;
            inputHash: string | null;
            outputSummary: string | null;
        }[];
        id: string;
        status: string;
        createdAt: Date;
        completedAt: Date | null;
        model: string | null;
        errorCode: string | null;
        intent: string;
        surface: string;
        actorType: string;
        actorId: string;
        startedAt: Date;
    }>;
    private executeReadTool;
    private supportTriage;
}
export {};
