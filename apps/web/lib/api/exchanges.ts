import { API_BASE, postAuthJson } from './http';

export interface UnitLookup {
  imei: string;
  status: string;
  orderId: string | null;
  product: string;
  sku: string;
  price: number;
}

/** Look up a sold device by IMEI (for the exchange flow). Throws on unknown IMEI. */
export async function fetchUnit(imei: string, accessToken: string): Promise<UnitLookup> {
  const res = await fetch(`${API_BASE}/units/${encodeURIComponent(imei)}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `unit ${res.status}`);
  }
  return (await res.json()) as UnitLookup;
}

export interface ExchangeResult {
  exchangeOrderId: string;
  returnId: string;
  surcharge: number;
  oldImei: string;
  newImei: string;
}

export function exchangeDevice(input: {
  originalOrderId: string;
  oldImei: string;
  newProductId: string;
  method: string;
  requester?: string;
}, accessToken: string): Promise<ExchangeResult> {
  return postAuthJson('/exchanges', input, accessToken);
}
