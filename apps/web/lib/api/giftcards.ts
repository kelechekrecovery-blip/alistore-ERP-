import { API_BASE, postAuthJson } from './http';

export interface GiftCardView {
  code: string;
  balance: number;
  currency: string;
  status: string;
  redeemable: boolean;
  expiresAt: string | null;
}

/** The issue endpoint returns the full card, including id and initial balance. */
export interface IssuedGiftCard extends GiftCardView {
  id: string;
  initialBalance: number;
  customerId: string | null;
}

export async function fetchGiftCard(code: string): Promise<GiftCardView> {
  const res = await fetch(`${API_BASE}/giftcards/${encodeURIComponent(code.trim())}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`giftcard ${res.status}`);
  return (await res.json()) as GiftCardView;
}

/**
 * Issue a gift card / store-credit balance (staff: giftcards,issue).
 *
 * Ключ идемпотентности обязателен: выпуск карты создаёт деньги, и повтор без
 * ключа сервер не отличит от второй карты. Ключ должен быть СТАБИЛЬНЫМ для
 * одной попытки — свежий `randomUUID()` на каждый вызов не защитил бы от
 * двойного клика, ради которого всё и делается.
 */
export function issueGiftCard(input: {
  amount: number;
  code?: string;
  customerId?: string;
  note?: string;
  expiresAt?: string;
}, accessToken: string, idempotencyKey: string): Promise<IssuedGiftCard> {
  return postAuthJson('/giftcards', input, accessToken, {
    'Idempotency-Key': idempotencyKey,
  });
}
