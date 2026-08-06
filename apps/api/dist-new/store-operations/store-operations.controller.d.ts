import { AuthPrincipal } from '../auth/jwt.strategy';
import { StoreOperationsService } from './store-operations.service';
import { CreateStoreChecklistDto, CreateStoreIncidentDto, ResolveStoreIncidentDto, StoreOperationsQueryDto, UpdateChecklistItemDto } from './store-operations.dto';
export declare class StoreOperationsController {
    private readonly operations;
    constructor(operations: StoreOperationsService);
    overview(user: AuthPrincipal, query: StoreOperationsQueryDto): Promise<{
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
    createChecklist(user: AuthPrincipal, key: string | undefined, dto: CreateStoreChecklistDto): Promise<{
        [x: string]: unknown;
    }>;
    updateItem(user: AuthPrincipal, id: string, code: string, key: string | undefined, dto: UpdateChecklistItemDto): Promise<{
        [x: string]: unknown;
    }>;
    completeChecklist(user: AuthPrincipal, id: string, key: string | undefined): Promise<{
        [x: string]: unknown;
    }>;
    createIncident(user: AuthPrincipal, key: string | undefined, dto: CreateStoreIncidentDto): Promise<{
        [x: string]: unknown;
    }>;
    resolveIncident(user: AuthPrincipal, id: string, key: string | undefined, dto: ResolveStoreIncidentDto): Promise<{
        [x: string]: unknown;
    }>;
}
