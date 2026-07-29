/**
 * Orchestration: screen → score → rank → shortlist, plus the human decision step.
 *
 * The service ranks; a person decides. `finalizeWinner` is the only way to name
 * a winner, and it refuses anyone the scoring did not put on the shortlist. That
 * boundary is deliberate: the contest was announced as "лучший комментарий", so
 * judgement is allowed — awarding regardless of what was written is not.
 */

import { createHash } from 'node:crypto';

import { DEFAULT_CRITERIA, criteriaFingerprint } from './criteria.mjs';
import { buildCorpus, scoreComment } from './scoring.mjs';
import { screenComments } from './filters.mjs';

const DEFAULT_SHORTLIST_SIZE = 20;
const MIN_JUSTIFICATION_CHARS = 20;

export function judge({ comments, criteria = DEFAULT_CRITERIA, options = {} }) {
  const shortlistSize = options.shortlistSize ?? DEFAULT_SHORTLIST_SIZE;

  const { eligible, disqualified } = screenComments(comments, options);
  const corpus = buildCorpus(eligible);

  const scored = eligible
    .map((comment) => ({ ...comment, ...scoreComment(comment, corpus, criteria) }))
    .sort(byScoreThenId)
    .map((comment, index) => ({ ...comment, rank: index + 1 }));

  return {
    shortlist: scored.slice(0, shortlistSize),
    scored,
    disqualified,
    criteria,
    fingerprint: {
      criteria: criteriaFingerprint(criteria),
      input: inputFingerprint(comments),
    },
    stats: {
      total: comments.length,
      eligible: eligible.length,
      disqualified: disqualified.length,
      shortlisted: Math.min(shortlistSize, scored.length),
    },
  };
}

/** Highest score first; ties broken by comment id so the order never drifts. */
function byScoreThenId(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * SHA-256 over the exact comment set that was judged. Publish it alongside the
 * criteria fingerprint: together they prove the input was not trimmed and the
 * rules were not retuned after the fact.
 */
function inputFingerprint(comments) {
  const canonical = [...comments]
    .map((c) => [c.id, c.username, c.text, c.createdAt, c.likeCount ?? 0].join(''))
    .sort()
    .join('');

  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Record the human choice of winner.
 *
 * @throws if the username is not on the shortlist, or the justification is
 *         missing — the reasoning is published, so it has to exist.
 */
export function finalizeWinner({ result, username, justification, decidedBy }) {
  const wanted = String(username ?? '').toLowerCase();
  const entry = result.shortlist.find((c) => String(c.username).toLowerCase() === wanted);

  if (!entry) {
    throw new Error(
      `"${username}" is not on the shortlist. Only ranked entrants can win; ` +
        're-run the judging if the comment set changed.',
    );
  }

  const reason = String(justification ?? '').trim();
  if (reason.length < MIN_JUSTIFICATION_CHARS) {
    throw new Error(
      `A published justification of at least ${MIN_JUSTIFICATION_CHARS} characters is required.`,
    );
  }

  const decider = String(decidedBy ?? '').trim();
  if (decider === '') {
    throw new Error('decidedBy is required — the decision must be attributable to a person.');
  }

  return {
    username: entry.username,
    commentId: entry.id,
    rank: entry.rank,
    total: entry.total,
    justification: reason,
    decidedBy: decider,
    fingerprint: result.fingerprint,
  };
}
