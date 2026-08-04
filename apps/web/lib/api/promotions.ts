import { getJson, postAuthJson, postJson } from './http';

export type PromotionStatus = 'draft' | 'active' | 'paused';
export type PromotionEffectiveStatus = PromotionStatus | 'scheduled' | 'expired';
export type PromotionDiscountType = 'fixed' | 'percent';

export interface PromotionView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: PromotionStatus;
  effectiveStatus: PromotionEffectiveStatus;
  discountType: PromotionDiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minimumSubtotal: number;
  eligibleProductIds: string[];
  eligibleCategories: string[];
  startsAt: string | null;
  endsAt: string | null;
  totalLimit: number | null;
  perCustomerLimit: number | null;
  redemptionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionInput {
  code: string;
  name: string;
  description?: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  maxDiscount?: number;
  minimumSubtotal?: number;
  eligibleProductIds?: string[];
  eligibleCategories?: string[];
  startsAt?: string;
  endsAt?: string;
  totalLimit?: number;
  perCustomerLimit?: number;
}

export interface PromotionQuote {
  id: string;
  code: string;
  name: string;
  subtotal: number;
  eligibleSubtotal: number;
  discount: number;
  customerLimitVerified: boolean;
  validUntil: string | null;
}

export function quotePromotion(code: string, items: Array<{ sku: string; qty: number }>, accessToken?: string) {
  const body = { code, items };
  return accessToken
    ? postAuthJson<PromotionQuote>('/promotions/quote', body, accessToken)
    : postJson<PromotionQuote>('/promotions/quote', body);
}

export function fetchPromotions(accessToken: string) { return getJson<PromotionView[]>('/promotions', accessToken); }
export function createPromotion(input: PromotionInput, accessToken: string) { return postAuthJson<PromotionView>('/promotions', input, accessToken); }
export function updatePromotion(id: string, input: Partial<PromotionInput>, accessToken: string) { return postAuthJson<PromotionView>(`/promotions/${id}/update`, input, accessToken); }
export function activatePromotion(id: string, accessToken: string) { return postAuthJson<PromotionView>(`/promotions/${id}/activate`, {}, accessToken); }
export function pausePromotion(id: string, accessToken: string) { return postAuthJson<PromotionView>(`/promotions/${id}/pause`, {}, accessToken); }
