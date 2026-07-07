import { API_BASE, postJson } from './http';

export interface UnitLookup {
  imei: string;
  status: string;
  orderId: string | null;
  product: string;
  sku: string;
  price: number;
}

/** Look up a sold device by IMEI (for the exchange flow). Throws on unknown IMEI. */
export async function fetchUnit(imei: string): Promise<UnitLookup> {
  const res = await fetch(`${API_BASE}/units/${encodeURIComponent(imei)}`, { cache: 'no-store' });
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
}): Promise<ExchangeResult> {
  return postJson('/exchanges', input);
}
