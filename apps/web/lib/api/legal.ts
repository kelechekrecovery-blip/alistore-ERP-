import { API_BASE } from './http';

export interface PublicOffer {
  text: string;
  published: boolean;
}

/**
 * Текст публичной оферты, который владелец вставил в ERP.
 *
 * Упавший запрос трактуем как «не опубликована», а не как ошибку страницы:
 * юридический документ, которого не видно, — это не повод показать покупателю
 * пятисотку, но и не повод выдать заготовку за действующий договор. Оба случая
 * приводят к одному честному экрану «документ готовится».
 */
export async function fetchPublicOffer(): Promise<PublicOffer> {
  try {
    const res = await fetch(`${API_BASE}/legal/offer`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`legal/offer responded ${res.status}`);
    return (await res.json()) as PublicOffer;
  } catch (error) {
    console.error('[legal] offer fetch failed', error);
    return { text: '', published: false };
  }
}
