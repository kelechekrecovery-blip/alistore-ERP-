import { API_BASE } from './http';

export interface GiftCardView {
  code: string;
  balance: number;
  currency: string;
  status: string;
  redeemable: boolean;
  expiresAt: string | null;
}

export async function fetchGiftCard(code: string): Promise<GiftCardView> {
  const res = await fetch(`${API_BASE}/giftcards/${encodeURIComponent(code.trim())}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`giftcard ${res.status}`);
  return (await res.json()) as GiftCardView;
}
