import { StaffTaskPriority, StaffTaskStatus } from '@prisma/client';
export declare class CreateStaffTaskDto {
    title: string;
    description?: string;
    assigneeId: string;
    priority?: StaffTaskPriority;
    dueAt?: string;
    relatedType?: string;
    relatedId?: string;
}
export declare class UpdateMyStaffTaskDto {
    status: StaffTaskStatus;
}
export declare class ListStaffTasksDto {
    status?: StaffTaskStatus[];
    assigneeId?: string;
}
