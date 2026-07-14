import { deleteAuthJson, getJson, patchAuthJson, postAuthJson } from './http';

export interface AdminProduct {
  id: string;
  sku: string;
  barcode: string | null;
  variantGroup: string | null;
  name: string;
  price: number;
  cost: number;
  category: string;
  trackingMode: 'serialized' | 'quantity';
  attrs: Record<string, unknown> | null;
  bundleComponents: Array<{ productId: string; sku: string; name: string; qty: number }>;
  archived: boolean;
  availableUnits: number;
}

export interface AdminProductList {
  total: number;
  limit: number;
  offset: number;
  items: AdminProduct[];
}

export interface ProductFormInput {
  sku: string;
  barcode?: string;
  variantGroup?: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  trackingMode?: 'serialized' | 'quantity';
  attrs?: Record<string, unknown>;
  bundleComponents?: Array<{ sku: string; qty: number }>;
}

export interface ProductUpdateInput {
  barcode?: string;
  variantGroup?: string;
  name?: string;
  cost?: number;
  category?: string;
  trackingMode?: 'serialized' | 'quantity';
  attrs?: Record<string, unknown>;
  bundleComponents?: Array<{ sku: string; qty: number }>;
}

export interface ApprovalRequestResult {
  approvalId: string;
  status?: string;
}

export function fetchAdminProducts(
  input: { q?: string; includeArchived?: boolean; limit?: number; offset?: number },
  accessToken: string,
): Promise<AdminProductList> {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.includeArchived) params.set('includeArchived', 'true');
  params.set('limit', String(input.limit ?? 50));
  params.set('offset', String(input.offset ?? 0));
  return getJson(`/products?${params.toString()}`, accessToken);
}

export function createAdminProduct(
  input: ProductFormInput,
  accessToken: string,
): Promise<AdminProduct> {
  return postAuthJson('/products', input, accessToken);
}

export function updateAdminProduct(
  id: string,
  input: ProductUpdateInput,
  accessToken: string,
): Promise<AdminProduct> {
  return patchAuthJson(`/products/${encodeURIComponent(id)}`, input, accessToken);
}

export function requestProductPriceChange(
  id: string,
  input: { price: number; reason: string },
  accessToken: string,
): Promise<ApprovalRequestResult | { applied: true; productId: string; price: number }> {
  return patchAuthJson(`/products/${encodeURIComponent(id)}/price`, input, accessToken);
}

export function requestProductArchive(
  id: string,
  input: { reason: string },
  accessToken: string,
): Promise<ApprovalRequestResult> {
  return deleteAuthJson(`/products/${encodeURIComponent(id)}`, input, accessToken);
}
