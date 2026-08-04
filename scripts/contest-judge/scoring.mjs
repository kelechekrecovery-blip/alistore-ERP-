/**
 * Deterministic scoring of a single comment against the published criteria.
 *
 * No randomness, no clock, no network: the same corpus and the same rulebook
 * always produce the same number, which is what makes the result auditable.
 */

import { emojiRatio, tokenize } from './normalize.mjs';

/** Document frequency over the eligible pool, used for the originality score. */
export function buildCorpus(comments) {
  const docFreq = new Map();

  for (const comment of comments) {
    for (const token of new Set(tokenize(comment.text))) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
  }

  return { docFreq, total: comments.length };
}

export function scoreComment(comment, corpus, criteria) {
  const tokens = tokenize(comment.text);

  const breakdown = {
    substance: substanceScore(tokens, criteria),
    originality: originalityScore(tokens, corpus),
    language: languageScore(comment.text, criteria),
    relevance: relevanceScore(tokens, criteria),
    peer: peerScore(comment.likeCount, criteria),
  };

  const total = Object.entries(criteria.weights).reduce(
    (sum, [key, weight]) => sum + weight * (breakdown[key] ?? 0),
    0,
  );

  return { total: round(total), breakdown: mapValues(breakdown, round) };
}

/** Longer, developed comments beat one-word entries — saturating, not unbounded. */
function substanceScore(tokens, criteria) {
  return Math.min(1, tokens.length / criteria.substance.idealTokens);
}

/**
 * Mean inverse document frequency of the comment's distinct words, normalised
 * to 0..1. Copy-pasted herd wording ("катышам", "+") scores near zero; a
 * personal, specific sentence scores high.
 */
function originalityScore(tokens, corpus) {
  const distinct = [...new Set(tokens)];
  if (distinct.length === 0 || corpus.total === 0) return 0;

  const ceiling = Math.log((corpus.total + 1) / 0.5);
  if (ceiling === 0) return 0;

  const meanIdf =
    distinct.reduce((sum, token) => {
      const df = corpus.docFreq.get(token) ?? 0;
      return sum + Math.log((corpus.total + 1) / (df + 0.5));
    }, 0) / distinct.length;

  return clamp01(meanIdf / ceiling);
}

/** Penalises emoji-padded entries that carry little written effort. */
function languageScore(text, criteria) {
  const ratio = emojiRatio(text);
  return clamp01(1 - ratio / criteria.language.maxEmojiRatio);
}

/** Rewards comments that actually talk about the shop or its products. */
function relevanceScore(tokens, criteria) {
  const brandTerms = new Set(criteria.brandTerms);
  const matched = new Set(tokens.filter((token) => brandTerms.has(token)));
  return Math.min(1, matched.size / criteria.relevance.saturationMatches);
}

/** Likes from other participants, as a weak corroborating signal. */
function peerScore(likeCount, criteria) {
  return clamp01(Number(likeCount ?? 0) / criteria.peer.saturationLikes);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value) {
  return Math.round(value * 1e4) / 1e4;
}

function mapValues(object, fn) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value)]));
}
