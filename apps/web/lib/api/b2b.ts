import { API_BASE, getJson, patchAuthJson, postAuthJson, putAuthJson } from './http';

export type B2BQuoteStatus = 'requested' | 'reviewing' | 'quoted' | 'accepted' | 'rejected';

export interface BusinessBuyerProfile {
  id: string;
  customerId: string;
  companyName: string;
  taxId: string;
  contactName: string;
  email: string | null;
  billingAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface B2BQuoteItem {
  id: string;
  quoteId: string;
  sku: string;
  name: string;
  qty: number;
  listPrice: number;
  targetPrice: number | null;
}

export interface B2BQuote {
  id: string;
  customerId: string;
  status: B2BQuoteStatus;
  paymentIntent: 'invoice' | 'bank_transfer';
  fulfillmentType: 'delivery' | 'pickup';
  deliveryAddress: string | null;
  pickupPoint: string | null;
  comment: string | null;
  staffNote: string | null;
  listTotal: number;
  quotedTotal: number | null;
  validUntil: string | null;
  items: B2BQuoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StaffB2BQuote extends B2BQuote {
  profile: BusinessBuyerProfile | null;
}

export async function fetchBusinessProfile(accessToken: string): Promise<BusinessBuyerProfile | null> {
  const response = await fetch(`${API_BASE}/b2b/profile`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`request failed ${response.status}`);
  const body = await response.text();
  return body ? (JSON.parse(body) as BusinessBuyerProfile) : null;
}

export function saveBusinessProfile(
  input: Pick<BusinessBuyerProfile, 'companyName' | 'taxId' | 'contactName' | 'billingAddress'> & {
    email?: string;
  },
  accessToken: string,
): Promise<BusinessBuyerProfile> {
  return putAuthJson('/b2b/profile', input, accessToken);
}

export function createB2BQuote(
  input: {
    items: Array<{ sku: string; qty: number; targetPrice?: number }>;
    paymentIntent: 'invoice' | 'bank_transfer';
    fulfillmentType: 'delivery' | 'pickup';
    deliveryAddress?: string;
    pickupPoint?: string;
    comment?: string;
  },
  accessToken: string,
): Promise<B2BQuote> {
  return postAuthJson('/b2b/quotes', input, accessToken);
}

export function fetchMyB2BQuotes(accessToken: string): Promise<B2BQuote[]> {
  return getJson('/b2b/quotes/mine', accessToken);
}

export function acceptB2BQuote(id: string, accessToken: string): Promise<B2BQuote> {
  return patchAuthJson(`/b2b/quotes/${encodeURIComponent(id)}/accept`, {}, accessToken);
}

export function fetchB2BQuotes(accessToken: string): Promise<StaffB2BQuote[]> {
  return getJson('/b2b/quotes', accessToken);
}

export function updateB2BQuote(
  id: string,
  input: {
    status: 'reviewing' | 'quoted' | 'rejected';
    quotedTotal?: number;
    staffNote?: string;
    validUntil?: string;
  },
  accessToken: string,
): Promise<B2BQuote> {
  return patchAuthJson(`/b2b/quotes/${encodeURIComponent(id)}`, input, accessToken);
}
