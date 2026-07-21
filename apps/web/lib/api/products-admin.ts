import { API_BASE, ApiError, deleteAuthJson, getJson, patchAuthJson, postAuthJson } from './http';

export interface AdminProduct {
  id: string;
  sku: string;
  barcode: string | null;
  variantGroup: string | null;
  name: string;
  price: number;
  cost: number;
  category: string;
  taxCode: string;
  taxRateBps: number;
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
  taxCode?: string;
  taxRateBps?: number;
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
  taxCode?: string;
  taxRateBps?: number;
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

export interface ImportProductsResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; sku: string; message: string }[];
}

/**
 * Массовый импорт товаров из Excel. Эндпоинт существовал, но не был доступен из
 * интерфейса — 200 позиций приходилось вбивать формой по одной. Multipart
 * `file`, права products:create (admin/owner).
 */
export async function importProductsExcel(file: File, accessToken: string): Promise<ImportProductsResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/import/products`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    let message = `Импорт не удался (${res.status})`;
    try {
      const payload = (await res.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // не-JSON тело (прокси-ошибка) оставляет текст по умолчанию
    }
    if (res.status === 403) message = 'Импорт доступен только владельцу и администратору';
    if (res.status === 401) message = 'Сессия истекла — войдите снова';
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as ImportProductsResult;
}
