/**
 * Text normalisation shared by the filtering and scoring stages.
 *
 * Comments on @alistore_kg arrive in Kyrgyz and Russian, so every routine here
 * is unicode-aware: Kyrgyz-specific letters (ң ө ү) must survive tokenisation.
 */

const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Zero-width joiner, variation selector-16 and skin-tone modifiers. */
const IGNORABLE_RE = new RegExp('[\\u200D\\uFE0F\\u{1F3FB}-\\u{1F3FF}]', 'u');

/** NFKC-fold, collapse whitespace and lowercase. */
export function normalizeText(raw) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** Drop pictographic characters, leaving the words behind. */
export function stripEmoji(raw) {
  return Array.from(String(raw ?? '').normalize('NFKC'))
    .filter((char) => !EMOJI_RE.test(char) && !IGNORABLE_RE.test(char))
    .join('');
}

/** Word tokens, lowercased, punctuation and emoji removed. */
export function tokenize(raw) {
  return normalizeText(stripEmoji(raw)).match(TOKEN_RE) ?? [];
}

/**
 * Share of visible characters that are emoji, 0..1.
 * A comment of pure 🔥 scores 1 and is disqualified as wordless.
 */
export function emojiRatio(raw) {
  const visible = Array.from(String(raw ?? '').normalize('NFKC')).filter(
    (char) => !/\s/u.test(char) && !IGNORABLE_RE.test(char),
  );
  if (visible.length === 0) return 0;

  const emoji = visible.filter((char) => EMOJI_RE.test(char)).length;
  return emoji / visible.length;
}
