import { StaffTaskStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateStaffTaskDto, ListStaffTasksDto } from './staff-tasks.dto';
export declare class StaffTasksService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox;
    constructor(prisma: PrismaService, audit: AuditService, outbox: OutboxService);
    mine(staffId: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        description: string | null;
        status: import(".prisma/client").$Enums.StaffTaskStatus;
        createdAt: Date;
        updatedAt: Date;
        priority: import(".prisma/client").$Enums.StaffTaskPriority;
        title: string;
        completedAt: Date | null;
        dueAt: Date | null;
        assigneeId: string;
        createdById: string;
        relatedType: string | null;
        relatedId: string | null;
    }[]>;
    list(dto: ListStaffTasksDto): import(".prisma/client").Prisma.PrismaPromise<({
        assignee: {
            id: string;
            username: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        description: string | null;
        status: import(".prisma/client").$Enums.StaffTaskStatus;
        createdAt: Date;
        updatedAt: Date;
        priority: import(".prisma/client").$Enums.StaffTaskPriority;
        title: string;
        completedAt: Date | null;
        dueAt: Date | null;
        assigneeId: string;
        createdById: string;
        relatedType: string | null;
        relatedId: string | null;
    })[]>;
    create(dto: CreateStaffTaskDto, actor: string): Promise<{
        id: string;
        description: string | null;
        status: import(".prisma/client").$Enums.StaffTaskStatus;
        createdAt: Date;
        updatedAt: Date;
        priority: import(".prisma/client").$Enums.StaffTaskPriority;
        title: string;
        completedAt: Date | null;
        dueAt: Date | null;
        assigneeId: string;
        createdById: string;
        relatedType: string | null;
        relatedId: string | null;
    }>;
    updateMine(id: string, to: StaffTaskStatus, staffId: string): Promise<{
        id: string;
        description: string | null;
        status: import(".prisma/client").$Enums.StaffTaskStatus;
        createdAt: Date;
        updatedAt: Date;
        priority: import(".prisma/client").$Enums.StaffTaskPriority;
        title: string;
        completedAt: Date | null;
        dueAt: Date | null;
        assigneeId: string;
        createdById: string;
        relatedType: string | null;
        relatedId: string | null;
    }>;
}
