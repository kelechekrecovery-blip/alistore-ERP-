export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000/api';

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: string;
  attrs: Record<string, unknown> | null;
  availableUnits: number;
}

export interface CatalogResponse {
  source: string;
  warning?: string;
  total: number;
  limit: number;
  offset: number;
  items: CatalogProduct[];
}

export interface CatalogQuery {
  q?: string;
  category?: string;
  stockOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Fetch the storefront catalog from the API. Never throws to the render tree —
 * on failure it returns an empty result so the page degrades gracefully.
 */
export async function fetchCatalog(
  query: CatalogQuery = {},
): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.stockOnly) params.set('stockOnly', 'true');
  params.set('limit', String(query.limit ?? 24));
  params.set('offset', String(query.offset ?? 0));

  try {
    const res = await fetch(`${API_BASE}/catalog/products?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`catalog responded ${res.status}`);
    return (await res.json()) as CatalogResponse;
  } catch {
    return { source: 'unavailable', total: 0, limit: 0, offset: 0, items: [] };
  }
}

/**
 * Fetch a single product by id. The catalog has no by-id endpoint yet, so we pull
 * a page and match locally — fine for the MVP catalog size; swap for a dedicated
 * endpoint when the catalog grows.
 */
export async function fetchProduct(id: string): Promise<CatalogProduct | null> {
  const catalog = await fetchCatalog({ limit: 100 });
  return catalog.items.find((p) => p.id === id) ?? null;
}

export interface OrderLine {
  sku: string;
  qty: number;
  price: number;
}

export interface CreatedOrder {
  id: string;
  status: string;
  total: number;
}

/** Find-or-create a customer by phone (guest checkout). Throws on API error. */
export async function createCustomer(input: {
  phone: string;
  name?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`customers responded ${res.status}`);
  return (await res.json()) as { id: string };
}

/** Create an order from the storefront cart. Throws on API error. */
export async function createOrder(input: {
  customerId: string;
  channel: string;
  total: number;
  items: OrderLine[];
}): Promise<CreatedOrder> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`orders responded ${res.status}`);
  return (await res.json()) as CreatedOrder;
}

// ---------- auth (phone + OTP) ----------

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
}

export interface AuthUser {
  customerId: string;
  phone: string;
  typ: string;
}

export interface MyOrder {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  items: { sku: string; qty: number; price: number }[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { message?: string }).message ?? `request failed ${res.status}`);
  }
  return (await res.json()) as T;
}

export function authRequestOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/otp/request', { phone });
}

export function authVerifyOtp(phone: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/otp/verify', { phone, code });
}

export function authRefresh(refreshToken: string): Promise<AuthTokens> {
  return postJson('/auth/refresh', { refreshToken });
}

export async function authLogout(refreshToken: string): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

async function getJson<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  return (await res.json()) as T;
}

export function authMe(accessToken: string): Promise<AuthUser> {
  return getJson('/auth/me', accessToken);
}

export function fetchMyOrders(accessToken: string): Promise<MyOrder[]> {
  return getJson('/orders/mine', accessToken);
}

export interface MyDevice {
  imei: string;
  product: string;
  status: string;
  warrantyUntil: string | null;
  daysLeft: number | null;
  warranty: { id: string; status: string; sla: string } | null;
}

export function fetchMyDevices(accessToken: string): Promise<MyDevice[]> {
  return getJson('/customers/me/devices', accessToken);
}

// ---------- POS ----------

export interface PosLine {
  productId: string;
  sku: string;
  price: number;
  qty: number;
}

export interface PosSaleResult {
  orderId: string;
  receiptNo: string;
  total: number;
  status: string;
  shiftId: string;
  imeis: string[];
}

export function posSale(input: {
  staffId: string;
  point: string;
  method: string;
  discountPct?: number;
  lines: PosLine[];
}): Promise<PosSaleResult> {
  return postJson('/pos/sale', input);
}

// ---------- warehouse / fulfillment ----------

export interface QueueOrder {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  customer?: { phone: string; name: string };
  items: { sku: string; qty: number; price: number; imei?: string | null }[];
}

export async function fetchOrdersByStatus(status: string): Promise<QueueOrder[]> {
  const res = await fetch(`${API_BASE}/orders?status=${encodeURIComponent(status)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`orders queue ${res.status}`);
  return (await res.json()) as QueueOrder[];
}

export function fulfillOrder(id: string): Promise<{ order?: { status: string }; assigned: string[] }> {
  return postJson(`/orders/${id}/fulfill`, {});
}

export function transitionOrder(id: string, to: string): Promise<{ status: string }> {
  return postJson(`/orders/${id}/transition`, { to });
}

export interface TransferResult { imei: string; from: string; to: string; movementId: string }
export function transferUnit(imei: string, to: string, reason?: string): Promise<TransferResult> {
  return postJson('/inventory/transfer', { imei, to, reason });
}

export interface CountResult { productId: string; location: string; expected: number; counted: number; diff: number }
export function inventoryCount(productId: string, location: string, counted: number): Promise<CountResult> {
  return postJson('/inventory/count', { productId, location, counted });
}

export interface OrderDetail {
  id: string;
  channel: string;
  status: string;
  total: number;
  createdAt: string;
  items: { sku: string; qty: number; price: number; imei?: string | null }[];
  payments: { amount: number; method: string; status: string }[];
}

export async function fetchOrder(id: string): Promise<OrderDetail | null> {
  const res = await fetch(`${API_BASE}/orders/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`order ${res.status}`);
  return (await res.json()) as OrderDetail;
}

// ---------- approvals (Approval Inbox) ----------

export interface Approval {
  id: string;
  action: string;
  requester: string;
  approver?: string | null;
  status: string;
  reason: string;
  evidence?: { payload?: { paymentId?: string; amount?: number } | null } | null;
  createdAt: string;
}

export async function fetchApprovals(status: string): Promise<Approval[]> {
  const res = await fetch(`${API_BASE}/approvals?status=${encodeURIComponent(status)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`approvals ${res.status}`);
  return (await res.json()) as Approval[];
}

export async function decideApproval(
  id: string,
  status: 'approved' | 'rejected',
  approver: string,
  approverRole = 'owner',
  reason?: string,
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/approvals/${id}/decide`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, approver, approverRole, reason }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { message?: string }).message ?? `decide ${res.status}`);
  }
  return (await res.json()) as { status: string };
}
