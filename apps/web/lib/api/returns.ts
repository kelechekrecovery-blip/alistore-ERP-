import { getJson, patchAuthJson, postAuthJson } from './http';

export interface ReturnRequest {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  refundId?: string | null;
  refundAmount: number;
  isFullOrder: boolean;
  items: { id: string; orderItemId: string; qty: number; refundAmount: number }[];
  order?: {
    id: string;
    total: number;
    items: { id: string; sku: string; qty: number; price: number }[];
    payments: { id: string; amount: number; method: string }[];
  };
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
  items?: { orderItemId: string; qty: number }[];
}, accessToken: string): Promise<ReturnRequest> {
  return postAuthJson('/returns', input, accessToken);
}
