/**
 * The judging contract.
 *
 * This object IS the published rulebook. Its SHA-256 fingerprint goes into the
 * contest post BEFORE judging starts, so that participants can verify after the
 * fact that the weights were not retuned once the comments were visible.
 * Changing anything here changes the fingerprint — that is the whole point.
 */

import { createHash } from 'node:crypto';

export const DEFAULT_CRITERIA = Object.freeze({
  version: '2026-07-25.1',

  /** Must sum to 100 — `total` is then directly readable as a percentage. */
  weights: Object.freeze({
    substance: 30,
    originality: 30,
    language: 15,
    relevance: 15,
    peer: 10,
  }),

  /** Word count at which a comment counts as fully developed. */
  substance: Object.freeze({ idealTokens: 12 }),

  /** Emoji share at which the language score bottoms out. */
  language: Object.freeze({ maxEmojiRatio: 0.5 }),

  /** Number of distinct brand/product terms that earns a full relevance score. */
  relevance: Object.freeze({ saturationMatches: 2 }),

  /** Likes on the comment itself at which peer validation saturates. */
  peer: Object.freeze({ saturationLikes: 20 }),

  brandTerms: Object.freeze([
    'alistore', 'алистор', 'алистore', 'алисторе',
    'iphone', 'айфон', 'macbook', 'макбук',
    'дукон', 'дүкөн', 'магазин', 'телефон', 'ноутбук',
    'рассрочка', 'кредит', 'бишкек', 'жалал', 'абад', 'манас',
    'тейлөө', 'сервис', 'гарантия', 'кепилдик',
  ]),
});

/** Deterministic serialisation: key order must not change the fingerprint. */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 of the rulebook — publish this before judging. */
export function criteriaFingerprint(criteria) {
  return createHash('sha256').update(stableStringify(criteria)).digest('hex');
}
