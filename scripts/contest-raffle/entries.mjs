/**
 * Turning raw comments into a ticket list.
 *
 * Screening reuses the judging pipeline's filters, so "who is eligible" means
 * exactly the same thing in both services — one rulebook, not two.
 */

import { createHash } from 'node:crypto';

import { screenComments } from '../contest-judge/filters.mjs';

const DEFAULT_MAX_TICKETS = 10;

/**
 * @param {{ticketsPerComment?:boolean, maxTicketsPerUser?:number}} options
 *        By default every participant gets exactly one ticket regardless of how
 *        many times they commented — the usual, and the hardest to game.
 *        `ticketsPerComment` turns comments into tickets, always capped.
 */
export function buildEntries(comments, options = {}) {
  const { ticketsPerComment = false, maxTicketsPerUser = DEFAULT_MAX_TICKETS } = options;

  const { eligible, disqualified } = screenComments(comments, options);
  const grouped = new Map();

  for (const comment of eligible) {
    const key = String(comment.username).toLowerCase();
    const prior = grouped.get(key);

    grouped.set(
      key,
      prior
        ? { username: prior.username, commentIds: [...prior.commentIds, comment.id] }
        : { username: comment.username, commentIds: [comment.id] },
    );
  }

  const entries = [...grouped.values()].map((group) => ({
    username: group.username,
    commentIds: group.commentIds,
    tickets: ticketsPerComment
      ? Math.min(group.commentIds.length, maxTicketsPerUser)
      : 1,
  }));

  return { entries, excluded: disqualified };
}

/**
 * Hash of the ticket list. Published with the result so nobody can claim
 * afterwards that a different set of people was in the hat.
 */
export function entriesFingerprint(entries) {
  const canonical = [...entries]
    .map((entry) => `${String(entry.username).toLowerCase()}:${entry.tickets}`)
    .sort()
    .join('|');

  return createHash('sha256').update(canonical).digest('hex');
}
