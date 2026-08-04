import { Injectable } from '@nestjs/common';
import { StaffTaskStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateStaffTaskDto, ListStaffTasksDto } from './staff-tasks.dto';

/** Доска читается целиком; предел держит запрос ограниченным на любой базе. */
const BOARD_LIMIT = 200;

const SELF_TRANSITIONS: Record<StaffTaskStatus, StaffTaskStatus[]> = {
  open: ['in_progress', 'completed'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class StaffTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  mine(staffId: string) {
    return this.prisma.staffTask.findMany({
      where: { assigneeId: staffId, status: { not: 'cancelled' } },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Доска команды: задачи всех исполнителей. `mine()` для этого не годится —
   * он жёстко фильтрует по assigneeId и не отдаёт имя исполнителя, так что
   * экран мог показать только UUID или выдуманного сотрудника.
   */
  list(dto: ListStaffTasksDto) {
    return this.prisma.staffTask.findMany({
      where: {
        ...(dto.assigneeId ? { assigneeId: dto.assigneeId } : {}),
        // Без явного фильтра отменённые не показываем — как и в mine().
        status: dto.status?.length ? { in: dto.status } : { not: 'cancelled' },
      },
      include: { assignee: { select: { id: true, username: true, role: true } } },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: BOARD_LIMIT,
    });
  }

  async create(dto: CreateStaffTaskDto, actor: string) {
    const assignee = await this.prisma.staffUser.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee?.active) throw new ValidationError('task_assignee_inactive', 'Сотрудник не найден или отключён');
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
        type: EventType.StaffTaskCreated, actor,
        payload: { taskId: task.id, assigneeId: task.assigneeId, priority: task.priority },
        refs: [task.id, task.assigneeId],
      }] };
    });
  }

  async updateMine(id: string, to: StaffTaskStatus, staffId: string) {
    return this.audit.transaction(async (tx) => {
      const task = await tx.staffTask.findUnique({ where: { id } });
      if (!task) throw new ValidationError('staff_task_not_found', `Задача ${id} не найдена`);
      if (task.assigneeId !== staffId) throw new ForbiddenError('staff_task_owner_mismatch', 'Нельзя изменить чужую задачу');
      if (!SELF_TRANSITIONS[task.status].includes(to)) {
        throw new ConflictError('staff_task_illegal_transition', `${task.status} → ${to} запрещён`);
      }
      const updated = await tx.staffTask.update({ where: { id }, data: {
        status: to, completedAt: to === 'completed' ? new Date() : null,
      } });
      return { result: updated, events: [{
        type: EventType.StaffTaskUpdated, actor: staffId,
        payload: { taskId: id, from: task.status, to }, refs: [id, staffId],
      }] };
    });
  }
}
