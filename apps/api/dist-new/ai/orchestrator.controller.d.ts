import { AuthPrincipal } from '../auth/jwt.strategy';
import { CreateAiRunDto } from './orchestrator.dto';
import { AiOrchestratorService } from './orchestrator.service';
export declare class AiOrchestratorController {
    private readonly orchestrator;
    constructor(orchestrator: AiOrchestratorService);
    run(dto: CreateAiRunDto, user: AuthPrincipal): Promise<{
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
    get(id: string, user: AuthPrincipal): Promise<{
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
}
