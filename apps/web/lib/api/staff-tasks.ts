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
