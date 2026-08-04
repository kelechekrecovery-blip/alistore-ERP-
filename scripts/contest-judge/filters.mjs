/**
 * Eligibility screening.
 *
 * Every rejection carries a machine-readable reason and is published in the
 * report — a participant who was dropped can see exactly why.
 */

import { normalizeText, tokenize } from './normalize.mjs';

export const DISQUALIFY = Object.freeze({
  EMPTY: 'empty',
  /** No words at all — emoji, punctuation or "+" only. */
  EMOJI_ONLY: 'emoji_only',
  DUPLICATE: 'duplicate',
  BEFORE_START: 'before_start',
  EXCLUDED: 'excluded',
  SPAM_BURST: 'spam_burst',
});

/**
 * @param {Array<{id:string,username:string,text:string,createdAt:string,likeCount:number}>} comments
 * @param {{contestStartedAt?:string, excludedUsernames?:string[], maxPerUser?:number}} options
 */
export function screenComments(comments, options = {}) {
  const { contestStartedAt, excludedUsernames = [], maxPerUser = Number.POSITIVE_INFINITY } = options;

  const startedAtMs = contestStartedAt ? Date.parse(contestStartedAt) : null;
  const excluded = new Set(excludedUsernames.map((name) => String(name).toLowerCase()));
  const seenText = new Set();
  const perUser = new Map();

  const eligible = [];
  const disqualified = [];

  for (const comment of comments) {
    const reason = screenOne(comment, { startedAtMs, excluded, seenText, perUser, maxPerUser });

    if (reason) {
      disqualified.push({ comment, reason });
      continue;
    }

    seenText.add(normalizeText(comment.text));
    perUser.set(usernameKey(comment), (perUser.get(usernameKey(comment)) ?? 0) + 1);
    eligible.push(comment);
  }

  return { eligible, disqualified };
}

function usernameKey(comment) {
  return String(comment.username ?? '').toLowerCase();
}

function screenOne(comment, ctx) {
  const { startedAtMs, excluded, seenText, perUser, maxPerUser } = ctx;
  const normalized = normalizeText(comment.text);

  if (normalized === '') return DISQUALIFY.EMPTY;
  if (tokenize(comment.text).length === 0) return DISQUALIFY.EMOJI_ONLY;
  if (excluded.has(usernameKey(comment))) return DISQUALIFY.EXCLUDED;

  if (startedAtMs !== null) {
    const postedAtMs = Date.parse(comment.createdAt);
    if (Number.isFinite(postedAtMs) && postedAtMs < startedAtMs) return DISQUALIFY.BEFORE_START;
  }

  if (seenText.has(normalized)) return DISQUALIFY.DUPLICATE;
  if ((perUser.get(usernameKey(comment)) ?? 0) >= maxPerUser) return DISQUALIFY.SPAM_BURST;

  return null;
}
