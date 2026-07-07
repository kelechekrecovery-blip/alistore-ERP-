import { postAuthJson } from './http';

export interface ReturnRequest {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export function openReturnRequest(input: {
  orderId: string;
  reason: string;
  requester?: string;
}, accessToken: string): Promise<ReturnRequest> {
  return postAuthJson('/returns', input, accessToken);
}
