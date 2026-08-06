import { API_BASE, ApiError } from './http';

export interface BusinessSession {
  accessToken: string;
  seller: { id: string; name: string };
  username: string;
}

export interface BusinessProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: string;
  archived: boolean;
}

/**
 * Ключ сессии партнёра намеренно свой.
 *
 * Кабинет — отдельное приложение, а не вкладка ERP. Общий ключ хранения означал
 * бы, что вход в одно приложение подсовывает токен другому: партнёр и сотрудник
 * AliStore на одной машине затирали бы сессии друг друга.
 */
const SESSION_KEY = 'alistore.business.session.v1';

export function loadBusinessSession(): BusinessSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as BusinessSession) : null;
  } catch {
    // Битый JSON — не повод показывать пустой экран без объяснения: считаем,
    // что сессии нет, и человек просто входит заново.
    return null;
  }
}

export function saveBusinessSession(session: BusinessSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearBusinessSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

async function parseError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const payload = (await res.json()) as { message?: string };
    if (payload.message) message = payload.message;
    // fixtures-allowed: внутренний catch лишь оставляет текст по умолчанию
  } catch {
    // Не-JSON ответ (страница прокси) оставляет текст по умолчанию.
  }
  throw new ApiError(res.status, message);
}

export async function businessLogin(username: string, password: string): Promise<BusinessSession> {
  const res = await fetch(`${API_BASE}/business/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) await parseError(res, 'Не удалось войти');
  return (await res.json()) as BusinessSession;
}

export async function fetchBusinessProducts(token: string): Promise<BusinessProduct[]> {
  const res = await fetch(`${API_BASE}/business/products`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) await parseError(res, 'Не удалось загрузить ассортимент');
  return (await res.json()) as BusinessProduct[];
}

export async function updateBusinessPrice(
  token: string,
  productId: string,
  price: number,
): Promise<BusinessProduct> {
  const res = await fetch(`${API_BASE}/business/products/${encodeURIComponent(productId)}/price`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ price }),
  });
  if (!res.ok) await parseError(res, 'Цена не сохранена');
  return (await res.json()) as BusinessProduct;
}
