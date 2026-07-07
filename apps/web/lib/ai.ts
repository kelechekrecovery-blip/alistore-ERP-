import { API_BASE } from './api';

export interface Valuation {
  basePrice: number;
  resale: number;
  buyback: number;
  retainedPct: number;
  factors: { age: number; grade: number; defect: number };
  notes: string[];
}

/** Used-device valuation (Phase 11, keyless depreciation rules). */
export async function assessUsed(input: {
  sku?: string;
  basePrice?: number;
  grade: string;
  ageMonths: number;
  defects: string[];
}): Promise<Valuation> {
  const res = await fetch(`${API_BASE}/ai/assess`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `assess ${res.status}`);
  }
  return (await res.json()) as Valuation;
}
