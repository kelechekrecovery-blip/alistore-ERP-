import { postJson } from './api/http';

export interface AttributionTouch {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landing?: string;
}

export interface StoredAttribution {
  journeyId: string;
  first: AttributionTouch;
  last: AttributionTouch;
  firstCapturedAt: string;
  lastCapturedAt: string;
}

const STORAGE_KEY = 'alistore.marketing-attribution.v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function captureAttribution(location: Pick<Location, 'search' | 'pathname'>): StoredAttribution | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  const source = clean(params.get('utm_source'), 80);
  const campaign = clean(params.get('utm_campaign'), 120);
  if (!source && !campaign) return loadAttribution();
  const touch: AttributionTouch = {
    source: source ?? 'campaign',
    medium: clean(params.get('utm_medium'), 80),
    campaign,
    content: clean(params.get('utm_content'), 120),
    term: clean(params.get('utm_term'), 120),
    landing: clean(`${location.pathname}${location.search}`, 500),
  };
  const now = new Date().toISOString();
  const existing = loadAttribution();
  const stored: StoredAttribution = {
    journeyId: existing?.journeyId ?? crypto.randomUUID(),
    first: existing?.first ?? touch,
    last: touch,
    firstCapturedAt: existing?.firstCapturedAt ?? now,
    lastCapturedAt: now,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

export function loadAttribution(): StoredAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredAttribution | null;
    if (!parsed?.first?.source || !parsed.last?.source) return null;
    if (Date.now() - new Date(parsed.lastCapturedAt).getTime() > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!parsed.journeyId) {
      parsed.journeyId = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    // Сюда попадают два разных отказа, и различать их обязательно.
    // Битый JSON — чиним, удалив запись. Но если бросил сам localStorage
    // (Safari в приватном режиме, заблокированное хранилище), то `removeItem`
    // бросит снова — уже из catch, то есть наружу. А наружу нельзя: track()
    // зовётся из обработчика «В корзину», и падение там роняет добавление
    // товара из-за телеметрии. Атрибуция не стоит корзины.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (storageError) {
      // Хранилище недоступно целиком — чистить нечего и незачем. В debug
      // оставляем след для диагностики Safari private mode, но telemetry не
      // должна ломать пользовательское действие.
      if (process.env.NODE_ENV !== 'production') console.debug('[attribution] storage unavailable', storageError);
    }
    return null;
  }
}

export function recordCampaignFunnel(
  trackingCode: string,
  journeyId: string,
  stage: 'click' | 'visit',
) {
  return postJson<{ accepted: boolean; recorded: boolean }>('/campaigns/funnel', {
    trackingCode,
    journeyId,
    stage,
  });
}

function clean(value: string | null, max: number): string | undefined {
  const normalized = value?.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return normalized || undefined;
}
