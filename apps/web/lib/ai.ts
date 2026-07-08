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

export interface PricingReview {
  sku: string;
  name: string;
  category: string;
  inStock: number;
  soldUnits: number;
  current: number;
  suggested: number;
  deltaPct: number;
  action: 'raise' | 'hold' | 'discount';
  reason: string;
}

export interface PricingReport {
  source: 'rules';
  generatedForCount: number;
  actionable: number;
  reviews: PricingReview[];
}

/** Dynamic-pricing review (Phase 11): stock-vs-demand recommendations, keyless. */
export async function fetchPricing(): Promise<PricingReport> {
  const res = await fetch(`${API_BASE}/ai/pricing`);
  if (!res.ok) throw new Error(`pricing ${res.status}`);
  return (await res.json()) as PricingReport;
}

export interface ReorderReview {
  sku: string;
  name: string;
  category: string;
  inStock: number;
  reserved: number;
  soldUnits: number;
  needsReorder: boolean;
  urgency: 'high' | 'medium' | 'low' | 'none';
  suggestedQty: number;
  reason: string;
}

export interface ReorderReport {
  source: 'rules';
  generatedForCount: number;
  needsReorder: number;
  reviews: ReorderReview[];
}

/** Restock review (Phase 11): understock mirror of pricing, keyless. */
export async function fetchReorder(): Promise<ReorderReport> {
  const res = await fetch(`${API_BASE}/ai/reorder`);
  if (!res.ok) throw new Error(`reorder ${res.status}`);
  return (await res.json()) as ReorderReport;
}

export interface CategorySuggestion {
  category: string;
  confidence: number; // 0–1
  matched: string[];
  alternatives: { category: string; score: number }[];
}

/** Product auto-categorization (Phase 11): keyword rules, keyless. */
export async function suggestCategory(input: {
  name: string;
  attrs?: Record<string, unknown>;
}): Promise<CategorySuggestion> {
  const res = await fetch(`${API_BASE}/ai/categorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `categorize ${res.status}`);
  }
  return (await res.json()) as CategorySuggestion;
}

export interface ProductDescription {
  description: string;
  source: string; // 'template' | 'openrouter:<model>'
  highlights: string[];
}

/** Product card description (Phase 11): keyless template, LLM when a key is set. */
export async function generateDescription(input: {
  name: string;
  category?: string;
  attrs?: Record<string, unknown>;
}): Promise<ProductDescription> {
  const res = await fetch(`${API_BASE}/ai/describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `describe ${res.status}`);
  }
  return (await res.json()) as ProductDescription;
}
