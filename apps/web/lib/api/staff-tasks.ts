import { getJson, patchAuthJson } from './http';

export interface StaffTask {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigneeId: string;
  dueAt: string | null;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function fetchMyStaffTasks(accessToken: string): Promise<StaffTask[]> {
  return getJson('/staff-tasks/mine', accessToken);
}

export function updateMyStaffTask(
  id: string,
  status: 'in_progress' | 'completed',
  accessToken: string,
): Promise<StaffTask> {
  return patchAuthJson(`/staff-tasks/mine/${encodeURIComponent(id)}`, { status }, accessToken);
}

/** Элемент доски команды: сервер отдаёт исполнителя раскрытым, а не UUID. */
export interface StaffTaskWithAssignee extends StaffTask {
  assignee: { id: string; username: string; role: string } | null;
}

/**
 * Доска задач всех сотрудников. Требует права staff_tasks:manage — оно есть
 * только у admin и owner, потому что доска показывает чужие задачи и имена.
 */
export function fetchStaffTaskBoard(
  params: { status?: StaffTask['status'][]; assigneeId?: string },
  accessToken: string,
): Promise<StaffTaskWithAssignee[]> {
  const query = new URLSearchParams();
  if (params.status?.length) query.set('status', params.status.join(','));
  if (params.assigneeId) query.set('assigneeId', params.assigneeId);
  const suffix = query.toString();
  return getJson(`/staff-tasks${suffix ? `?${suffix}` : ''}`, accessToken);
}
