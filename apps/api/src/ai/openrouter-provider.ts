import { Insight } from './insight';
import { InsightContext, InsightProvider } from './insight-provider';

/** Chat message shape sent to the OpenRouter (OpenAI-compatible) completions API. */
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const TONES = new Set(['positive', 'warning', 'info']);

/**
 * Build the prompt for the LLM from the same ledger-backed aggregates the rule engine
 * uses. Pure — no network — so prompt shape is unit-testable. The model is told to
 * answer with a strict JSON array so the response is machine-parseable.
 */
export function buildInsightMessages(ctx: InsightContext): ChatMessage[] {
  const system = [
    'Ты — AI-ассистент владельца магазина электроники в Кыргызстане (валюта — сом).',
    'На основе ТОЛЬКО предоставленных цифр из Event Ledger дай краткие деловые инсайты.',
    'Отвечай на русском. Верни СТРОГО JSON-массив объектов {"tone","title","detail"},',
    'где tone ∈ {"positive","warning","info"}, до 6 элементов, без markdown и текста вне JSON.',
    'Приоритет: маржа, дефицит/затоварка склада, критичные риски, возвраты, лучшие товары/продавцы.',
    'title — короткий (до 8 слов), detail — одно предложение с конкретным действием.',
  ].join(' ');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Цифры (JSON):\n${JSON.stringify(ctx)}` },
  ];
}

/**
 * Parse the model's reply into validated insights. Tolerant of prose around the JSON
 * (extracts the first [...] block) but strict on shape — unknown tones fall back to
 * "info", malformed items are dropped. Throws when nothing usable is found so the
 * caller can fall back to the rule engine.
 */
export function parseInsightsResponse(content: string): Insight[] {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON array in LLM response');

  const parsed: unknown = JSON.parse(content.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('LLM response is not an array');

  const out: Insight[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { tone?: unknown; title?: unknown; detail?: unknown };
    if (typeof item.title !== 'string' || typeof item.detail !== 'string') continue;
    const tone = typeof item.tone === 'string' && TONES.has(item.tone) ? (item.tone as Insight['tone']) : 'info';
    out.push({ tone, title: item.title.slice(0, 120), detail: item.detail.slice(0, 300) });
    if (out.length >= 8) break;
  }
  if (out.length === 0) throw new Error('no valid insights in LLM response');
  return out;
}

export interface OpenRouterOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Low-level OpenRouter chat call — one key, any model. Returns the assistant text or
 * throws (non-200 / no content / timeout / network). Shared by every LLM-backed
 * provider so the transport lives in one place. Key stays server-side.
 */
export async function openRouterChat(messages: ChatMessage[], cfg: OpenRouterOptions): Promise<string> {
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        'X-Title': 'AliStore ERP',
      },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 800 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('openrouter response has no content');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * LLM-backed owner-insight provider (Phase 11) via OpenRouter — one key, any model.
 * Selected only when a server-side key is present; on ANY failure (network, non-200,
 * unparseable) it throws so InsightsService falls back to the deterministic rules.
 * The key lives server-side only and is never logged or sent to the client.
 */
export class OpenRouterInsightProvider implements InsightProvider {
  readonly source: string;
  private readonly model: string;
  private readonly opts: OpenRouterOptions;

  constructor(opts: OpenRouterOptions) {
    this.opts = opts;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.source = `openrouter:${this.model}`;
  }

  async generate(ctx: InsightContext): Promise<Insight[]> {
    const content = await openRouterChat(buildInsightMessages(ctx), this.opts);
    return parseInsightsResponse(content);
  }
}
