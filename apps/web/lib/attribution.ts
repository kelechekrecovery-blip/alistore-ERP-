export interface AttributionTouch {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landing?: string;
}

export interface StoredAttribution {
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
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function clean(value: string | null, max: number): string | undefined {
  const normalized = value?.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return normalized || undefined;
}
