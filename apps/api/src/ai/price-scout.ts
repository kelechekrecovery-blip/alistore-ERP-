import { ChatMessage, openRouterChat, OpenRouterOptions } from './openrouter-provider';

export interface MarketListing {
  title?: string;
  source?: string;
  condition?: string;
  price: number;
}

export interface PriceScoutInput {
  sku?: string;
  name: string;
  category?: string;
  basePrice: number;
  observedListings?: MarketListing[];
}

export interface PriceScoutResult {
  source: string;
  marketLow: number;
  marketMedian: number;
  marketHigh: number;
  recommendedPrice: number;
  confidence: number;
  signals: string[];
  notes: string[];
}

function round100(n: number): number {
  return Math.max(0, Math.round(n / 100) * 100);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function filteredListingPrices(input: PriceScoutInput): number[] {
  const raw = (input.observedListings ?? [])
    .map((l) => l.price)
    .filter((price) => Number.isFinite(price) && price > 0);
  if (raw.length === 0) return [];
  const min = input.basePrice * 0.45;
  const max = input.basePrice * 1.65;
  const filtered = raw.filter((price) => price >= min && price <= max);
  return (filtered.length > 0 ? filtered : raw).sort((a, b) => a - b);
}

/**
 * Keyless market scout. It never scrapes; it turns manually collected listings plus
 * the catalog anchor into a conservative resale recommendation. A provider can later
 * collect live market listings behind the same port.
 */
export function scoutPriceByRules(input: PriceScoutInput): PriceScoutResult {
  const prices = filteredListingPrices(input);
  const signals: string[] = [`catalog_anchor:${input.basePrice}`];
  let marketLow: number;
  let marketMedian: number;
  let marketHigh: number;
  let confidence: number;

  if (prices.length > 0) {
    marketLow = percentile(prices, 0.25);
    marketMedian = percentile(prices, 0.5);
    marketHigh = percentile(prices, 0.75);
    confidence = prices.length >= 5 ? 0.78 : prices.length >= 3 ? 0.68 : 0.55;
    signals.push(`manual_listings:${prices.length}`);
  } else {
    marketLow = input.basePrice * 0.82;
    marketMedian = input.basePrice * 0.92;
    marketHigh = input.basePrice * 1.02;
    confidence = 0.42;
    signals.push('no_external_listings');
  }

  const recommendedPrice = round100(Math.min(marketHigh, Math.max(marketLow, marketMedian * 0.98)));
  const notes = [
    prices.length > 0
      ? 'Рекомендация основана на ручных listing-ценах и каталожном якоре.'
      : 'Нет внешних listing-цен; используйте как внутренний ориентир до подключения market scout.',
  ];
  if (recommendedPrice < input.basePrice * 0.75) notes.push('Рынок заметно ниже каталога; проверьте комплектацию/состояние.');
  if (recommendedPrice > input.basePrice * 1.1) notes.push('Рынок выше каталога; проверьте дефицит и актуальность базовой цены.');

  return {
    source: 'rules',
    marketLow: round100(marketLow),
    marketMedian: round100(marketMedian),
    marketHigh: round100(marketHigh),
    recommendedPrice,
    confidence,
    signals,
    notes,
  };
}

export function buildPriceScoutMessages(input: PriceScoutInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Ты — market scout AliStore для электроники в Кыргызстане.',
        'Оцени рыночный коридор цены по переданным данным, не придумывай источники.',
        'Верни СТРОГО JSON-объект {"marketLow","marketMedian","marketHigh","recommendedPrice","confidence","signals","notes"}.',
        'Все цены в сомах, confidence 0..1.',
      ].join(' '),
    },
    { role: 'user', content: JSON.stringify(input) },
  ];
}

export function parsePriceScoutResponse(content: string): Omit<PriceScoutResult, 'source'> {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in price scout response');
  const raw = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
  const nums = ['marketLow', 'marketMedian', 'marketHigh', 'recommendedPrice'] as const;
  for (const key of nums) {
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) throw new Error(`invalid ${key}`);
  }
  const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
  return {
    marketLow: round100(raw.marketLow as number),
    marketMedian: round100(raw.marketMedian as number),
    marketHigh: round100(raw.marketHigh as number),
    recommendedPrice: round100(raw.recommendedPrice as number),
    confidence: Math.round(confidence * 100) / 100,
    signals: Array.isArray(raw.signals) ? raw.signals.filter((v): v is string => typeof v === 'string').slice(0, 12) : [],
    notes: Array.isArray(raw.notes) ? raw.notes.filter((v): v is string => typeof v === 'string').slice(0, 8) : [],
  };
}

export class OpenRouterPriceScoutProvider {
  readonly source: string;

  constructor(private readonly opts: OpenRouterOptions) {
    this.source = `openrouter:${opts.model ?? 'openai/gpt-4o-mini'}`;
  }

  async scout(input: PriceScoutInput): Promise<PriceScoutResult> {
    const content = await openRouterChat(buildPriceScoutMessages(input), this.opts);
    return { source: this.source, ...parsePriceScoutResponse(content) };
  }
}
