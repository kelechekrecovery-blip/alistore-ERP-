import { API_BASE } from './api/http';
import { loadAttribution } from './attribution';

/**
 * First-party storefront funnel client.
 *
 * Posts anonymous funnel events (product view, add-to-cart, checkout start) to
 * our own API — not an external tracker — so campaign ROI is measured against
 * real conversions. Three rules keep it from ever hurting the storefront:
 *  - fire-and-forget: a failed or slow beacon must not block render or throw;
 *  - Do-Not-Track / Global Privacy Control is honoured — no beacon at all;
 *  - the session id is a random, anonymous, client-only value; no PII is sent.
 */

const SESSION_KEY = 'alistore.analytics.session.v1';

export type FunnelEvent = 'product_view' | 'add_to_cart' | 'checkout_started';

interface TrackOptions {
  productId?: string;
  props?: Record<string, unknown>;
}

/** True when we must not emit telemetry: SSR, or the visitor opted out. */
function optedOut(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  const dnt = navigator.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  const gpc = (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl;
  return dnt === '1' || dnt === 'yes' || gpc === true;
}

/** Stable anonymous session id, created lazily in localStorage. */
function sessionId(): string {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, id);
  return id;
}

export function track(type: FunnelEvent, options: TrackOptions = {}): void {
  if (optedOut()) return;
  // Телеметрия не имеет права ронять то, из чего её позвали. `sessionId()` и
  // `loadAttribution()` оба читают и пишут localStorage, а он бросает целиком
  // при заблокированном хранилище (Safari private, запрет сторонних данных).
  // Раньше это исключение поднималось прямо в обработчик «В корзину»:
  // покупатель не мог положить товар из-за счётчика.
  let body: string;
  try {
    body = JSON.stringify({
      type,
      sessionId: sessionId(),
      productId: options.productId,
      // Last-touch campaign source, so the funnel can be attributed to the campaign
      // that drove this session. Absent → the server records it as «(direct)».
      source: loadAttribution()?.last.source,
      props: options.props,
    });
  } catch {
    return;
  }
  // keepalive lets the beacon survive a navigation (e.g. add-to-cart → cart);
  // the catch swallows everything — telemetry never surfaces to the user.
  void fetch(`${API_BASE}/analytics/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
