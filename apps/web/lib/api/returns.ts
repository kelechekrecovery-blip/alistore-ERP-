import { getJson, patchAuthJson, postAuthJson } from './http';

export interface ReturnRequest {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  refundId?: string | null;
  restockLocation?: string | null;
  restockedAt?: string | null;
  createdAt: string;
}

export function fetchStaffReturns(accessToken: string): Promise<ReturnRequest[]> {
  return getJson('/returns', accessToken);
}

export function transitionReturn(
  id: string,
  status: 'under_review' | 'approved' | 'rejected' | 'processing' | 'reconciled',
  accessToken: string,
  location?: string,
): Promise<ReturnRequest> {
  return patchAuthJson(`/returns/${encodeURIComponent(id)}`, { status, location }, accessToken);
}

export function openReturnRequest(input: {
  orderId: string;
  reason: string;
  requester?: string;
}, accessToken: string): Promise<ReturnRequest> {
  return postAuthJson('/returns', input, accessToken);
}
