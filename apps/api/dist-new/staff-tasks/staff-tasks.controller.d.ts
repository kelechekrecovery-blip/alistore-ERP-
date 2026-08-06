import { AuthPrincipal } from '../auth/jwt.strategy';
import { CreateStaffTaskDto, ListStaffTasksDto, UpdateMyStaffTaskDto } from './staff-tasks.dto';
import { StaffTasksService } from './staff-tasks.service';
export declare class StaffTasksController {
    private readonly tasks;
    constructor(tasks: StaffTasksService);
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
    mine(user: AuthPrincipal): import(".prisma/client").Prisma.PrismaPromise<{
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
    updateMine(user: AuthPrincipal, id: string, dto: UpdateMyStaffTaskDto): Promise<{
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
    create(user: AuthPrincipal, dto: CreateStaffTaskDto): Promise<{
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
