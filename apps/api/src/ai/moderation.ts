import type { LlmMessage } from './llm/llm-client';

export interface ModerationResult {
  /** Whether the text is safe to publish as-is. */
  allowed: boolean;
  /** Machine categories that fired, e.g. "profanity", "spam", "pii", "hate". */
  categories: string[];
  /** Short human-readable reason (RU). Empty when allowed. */
  reason: string;
  /** Provenance — "rules", "anthropic:...", etc. */
  source: string;
}

/** Keyless stop-word list — a coarse safety net; the LLM classifier is the real check. */
const BANNED: { category: string; terms: string[] }[] = [
  { category: 'profanity', terms: ['бляд', 'сука', 'хуй', 'пизд', 'ебан', 'мудак', 'fuck', 'shit', 'bitch'] },
  { category: 'spam', terms: ['casino', 'porn', 'viagra', 'заработок', 'crypto pump', 'http://', 'https://'] },
];

/**
 * Rule-based moderation (keyless). Flags obvious profanity/spam by substring match. This
 * is deliberately conservative and coarse — it exists so the endpoint works with no key;
 * the Claude classifier replaces it behind the same call when a key is set.
 */
export function moderateByRules(text: string): ModerationResult {
  const hay = text.toLowerCase();
  const categories = BANNED.filter((b) => b.terms.some((t) => hay.includes(t))).map((b) => b.category);
  return categories.length === 0
    ? { allowed: true, categories: [], reason: '', source: 'rules' }
    : { allowed: false, categories, reason: `Обнаружено: ${categories.join(', ')}`, source: 'rules' };
}

export const MODERATION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    allowed: { type: 'boolean' },
    categories: {
      type: 'array',
      items: { type: 'string', enum: ['profanity', 'hate', 'harassment', 'spam', 'pii', 'sexual', 'violence', 'other'] },
    },
    reason: { type: 'string' },
  },
  required: ['allowed', 'categories', 'reason'],
};

export const MODERATION_SYSTEM = [
  'Ты — модератор пользовательского контента магазина (отзывы, тексты витрины) на русском и английском.',
  'Определи, безопасно ли публиковать текст. Блокируй: мат/оскорбления, разжигание ненависти, домогательства,',
  'спам/реклама/ссылки, персональные данные (телефоны, адреса, номера карт), сексуальный или жестокий контент.',
  'Обычная критика товара/сервиса — разрешена. Верни allowed, categories и краткий reason (пусто, если allowed=true).',
].join(' ');

export function buildModerationMessages(text: string): LlmMessage[] {
  return [{ role: 'user', content: `Текст для модерации:\n"""${text.slice(0, 4000)}"""` }];
}

/** Coerce an LLM moderation reply into a validated result, or return `null`. */
export function coerceModeration(parsed: unknown, source: string): ModerationResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as { allowed?: unknown; categories?: unknown; reason?: unknown };
  if (typeof raw.allowed !== 'boolean') return null;
  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter((v): v is string => typeof v === 'string').slice(0, 8)
    : [];
  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 300) : '';
  return { allowed: raw.allowed, categories, reason, source };
}
