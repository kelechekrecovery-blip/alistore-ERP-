import { API_BASE, ApiError } from './http';

export interface Approval {
  id: string;
  action: string;
  requester: string;
  approver?: string | null;
  status: string;
  reason: string;
  evidence?: { payload?: {
    paymentId?: string;
    amount?: number;
    oldImei?: string;
    newImei?: string;
    creditAmount?: number;
    surchargeAmount?: number;
    method?: string;
    shiftId?: string | null;
    externalReference?: string | null;
  } | null } | null;
  exchangeRequest?: { id: string; status: string } | null;
  createdAt: string;
}

export async function fetchApprovals(status: string, accessToken: string): Promise<Approval[]> {
  const res = await fetch(`${API_BASE}/approvals?status=${encodeURIComponent(status)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  // Статус нужен вызывающему: экран согласований выкидывал сотрудника из
  // системы на любой ошибке, потому что отличить «нет доступа» от «сервер
  // споткнулся» по строке `approvals 500` невозможно.
  if (!res.ok) throw new ApiError(res.status, `approvals ${res.status}`);
  return (await res.json()) as Approval[];
}

export async function decideApproval(
  id: string,
  status: 'approved' | 'rejected',
  accessToken: string,
  reason?: string,
  totpToken?: string,
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/approvals/${id}/decide`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ status, reason, totpToken }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `decide ${res.status}`);
  }
  return (await res.json()) as { status: string };
}
