import { AuditService } from '../audit/audit.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreChecklistDto, CreateStoreIncidentDto, ResolveStoreIncidentDto, StoreOperationsQueryDto, UpdateChecklistItemDto } from './store-operations.dto';
type ChecklistCommandResult = Record<string, unknown>;
export declare class StoreOperationsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    private resolveReadablePoint;
    private resolveWritablePoint;
    overview(query: StoreOperationsQueryDto, user: AuthPrincipal): Promise<{
        date: string;
        point: string | null;
        checklists: ({
            items: {
                id: string;
                code: string;
                required: boolean;
                label: string;
                checkedAt: Date | null;
                note: string | null;
                checked: boolean;
                checklistId: string;
                checkedBy: string | null;
            }[];
        } & {
            id: string;
            type: import(".prisma/client").$Enums.StoreChecklistType;
            idempotencyKey: string;
            point: string;
            status: import(".prisma/client").$Enums.StoreChecklistStatus;
            createdAt: Date;
            updatedAt: Date;
            completedAt: Date | null;
            businessDate: Date;
            startedBy: string;
            completedBy: string | null;
        })[];
        incidents: {
            id: string;
            idempotencyKey: string;
            description: string;
            point: string;
            createdBy: string;
            status: import(".prisma/client").$Enums.StoreIncidentStatus;
            createdAt: Date;
            updatedAt: Date;
            category: string;
            title: string;
            resolvedBy: string | null;
            resolvedAt: Date | null;
            resolution: string | null;
            businessDate: Date;
            severity: import(".prisma/client").$Enums.StoreIncidentSeverity;
        }[];
        summary: {
            checklists: number;
            completedChecklists: number;
            openIncidents: number;
            criticalIncidents: number;
        };
    }>;
    createChecklist(dto: CreateStoreChecklistDto, actor: string, rawKey?: string): Promise<ChecklistCommandResult>;
    updateItem(checklistId: string, code: string, dto: UpdateChecklistItemDto, actor: string, rawKey?: string): Promise<ChecklistCommandResult>;
    completeChecklist(checklistId: string, actor: string, rawKey?: string): Promise<ChecklistCommandResult>;
    createIncident(dto: CreateStoreIncidentDto, actor: string, rawKey?: string): Promise<ChecklistCommandResult>;
    resolveIncident(id: string, dto: ResolveStoreIncidentDto, actor: string, rawKey?: string): Promise<ChecklistCommandResult>;
}
export {};
