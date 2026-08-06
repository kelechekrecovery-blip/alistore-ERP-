"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffTasksService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const outbox_service_1 = require("../outbox/outbox.service");
const BOARD_LIMIT = 200;
const SELF_TRANSITIONS = {
    open: ['in_progress', 'completed'],
    in_progress: ['completed'],
    completed: [],
    cancelled: [],
};
let StaffTasksService = class StaffTasksService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    mine(staffId) {
        return this.prisma.staffTask.findMany({
            where: { assigneeId: staffId, status: { not: 'cancelled' } },
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        });
    }
    list(dto) {
        return this.prisma.staffTask.findMany({
            where: {
                ...(dto.assigneeId ? { assigneeId: dto.assigneeId } : {}),
                status: dto.status?.length ? { in: dto.status } : { not: 'cancelled' },
            },
            include: { assignee: { select: { id: true, username: true, role: true } } },
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
            take: BOARD_LIMIT,
        });
    }
    async create(dto, actor) {
        const assignee = await this.prisma.staffUser.findUnique({ where: { id: dto.assigneeId } });
        if (!assignee?.active)
            throw new errors_1.ValidationError('task_assignee_inactive', 'Сотрудник не найден или отключён');
        return this.audit.transaction(async (tx) => {
            const task = await tx.staffTask.create({ data: {
                    title: dto.title.trim(), description: dto.description?.trim() || undefined,
                    assigneeId: assignee.id, createdById: actor, priority: dto.priority,
                    dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
                    relatedType: dto.relatedType?.trim() || undefined, relatedId: dto.relatedId?.trim() || undefined,
                } });
            await this.outbox.enqueueOnTx(tx, {
                channel: 'push',
                recipient: task.assigneeId,
                template: 'staff_task_created',
                payload: {
                    title: 'Новая задача AliStore',
                    body: task.title,
                    taskId: task.id,
                    deepLink: `alistore-staff://tasks/${task.id}`,
                },
            });
            return { result: task, events: [{
                        type: event_types_1.EventType.StaffTaskCreated, actor,
                        payload: { taskId: task.id, assigneeId: task.assigneeId, priority: task.priority },
                        refs: [task.id, task.assigneeId],
                    }] };
        });
    }
    async updateMine(id, to, staffId) {
        return this.audit.transaction(async (tx) => {
            const task = await tx.staffTask.findUnique({ where: { id } });
            if (!task)
                throw new errors_1.ValidationError('staff_task_not_found', `Задача ${id} не найдена`);
            if (task.assigneeId !== staffId)
                throw new errors_1.ForbiddenError('staff_task_owner_mismatch', 'Нельзя изменить чужую задачу');
            if (!SELF_TRANSITIONS[task.status].includes(to)) {
                throw new errors_1.ConflictError('staff_task_illegal_transition', `${task.status} → ${to} запрещён`);
            }
            const updated = await tx.staffTask.update({ where: { id }, data: {
                    status: to, completedAt: to === 'completed' ? new Date() : null,
                } });
            return { result: updated, events: [{
                        type: event_types_1.EventType.StaffTaskUpdated, actor: staffId,
                        payload: { taskId: id, from: task.status, to }, refs: [id, staffId],
                    }] };
        });
    }
};
exports.StaffTasksService = StaffTasksService;
exports.StaffTasksService = StaffTasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], StaffTasksService);
//# sourceMappingURL=staff-tasks.service.js.map