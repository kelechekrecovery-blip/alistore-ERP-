import { buildInsights, Insight } from './insight';

/** Aggregates handed to a provider — everything comes from the Event Ledger tables. */
export interface InsightContext {
  marginPct: number;
  grossMargin: number;
  avgCheck: number;
  paidOrders: number;
  topProduct: { name: string; revenue: number } | null;
  topSeller: { staffId: string; revenue: number } | null;
  net: number;
  refunds: number;
  pendingApprovals: number;
  risks: { kind: string; severity: string; detail: string }[];
  reorderUrgent?: { count: number; names: string[] };
  overstock?: { count: number; topName: string | null };
}

/**
 * The AI-layer port (Phase 11). Owner insights are produced behind this interface so
 * the source can be swapped — a keyless rule engine today, a hosted LLM once a provider
 * key is configured — without changing callers. Keys live server-side only.
 */
export interface InsightProvider {
  readonly source: string;
  generate(ctx: InsightContext): Promise<Insight[]>;
}

/** Keyless deterministic provider — always available, no external calls. */
export class RuleInsightProvider implements InsightProvider {
  readonly source = 'rules';
  async generate(ctx: InsightContext): Promise<Insight[]> {
    return buildInsights(ctx);
  }
}

const TONES = new Set<Insight['tone']>(['positive', 'warning', 'info']);

/** JSON Schema for the structured-output insights path (Claude). */
export const INSIGHT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tone: { type: 'string', enum: ['positive', 'warning', 'info'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['tone', 'title', 'detail'],
      },
    },
  },
  required: ['insights'],
};

/** Coerce a structured-output reply `{insights:[...]}` into validated Insight[] (or throw). */
export function coerceInsights(parsed: unknown): Insight[] {
  const list = parsed && typeof parsed === 'object' ? (parsed as { insights?: unknown }).insights : undefined;
  if (!Array.isArray(list)) throw new Error('structured insights missing "insights" array');
  const out: Insight[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { tone?: unknown; title?: unknown; detail?: unknown };
    if (typeof item.title !== 'string' || typeof item.detail !== 'string') continue;
    const tone = typeof item.tone === 'string' && TONES.has(item.tone as Insight['tone']) ? (item.tone as Insight['tone']) : 'info';
    out.push({ tone, title: item.title.slice(0, 120), detail: item.detail.slice(0, 300) });
    if (out.length >= 8) break;
  }
  if (out.length === 0) throw new Error('no valid insights in structured reply');
  return out;
}

/** System prompt for the agentic assistant mode — it pulls signals via tools itself. */
export const ASSISTANT_SYSTEM = [
  'Ты — AI-ассистент владельца магазина электроники в Кыргызстане (валюта — сом).',
  'У тебя есть инструменты для получения свежих цифр из Event Ledger (KPI, риски, цены, закупки).',
  'Вызывай нужные инструменты, затем дай краткие деловые инсайты.',
  'Приоритет: маржа, дефицит/затоварка склада, критичные риски, возвраты, лучшие товары/продавцы.',
  'Итог верни СТРОГО как JSON-массив объектов {"tone","title","detail"}, tone ∈ {"positive","warning","info"},',
  'до 6 элементов, без markdown и текста вне JSON. title — до 8 слов, detail — одно предложение с конкретным действием.',
].join(' ');

export const ASSISTANT_TASK =
  'Проанализируй текущее состояние магазина и верни главные инсайты для владельца. Используй инструменты для получения актуальных данных.';
