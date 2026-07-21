import { getJson, patchAuthJson } from './http';

export interface CustomerNotification {
  id: string;
  template: string;
  title: string;
  detail: string;
  symbol: string;
  route: string;
  referenceId: string | null;
  createdAt: string;
  readAt: string | null;
}

export function fetchMyNotifications(accessToken: string, limit = 50): Promise<CustomerNotification[]> {
  return getJson<CustomerNotification[]>(`/notifications/mine?limit=${Math.min(Math.max(limit, 1), 100)}`, accessToken);
}

export function markNotificationRead(id: string, accessToken: string): Promise<CustomerNotification> {
  return patchAuthJson<CustomerNotification>(`/notifications/${encodeURIComponent(id)}/read`, {}, accessToken);
}
