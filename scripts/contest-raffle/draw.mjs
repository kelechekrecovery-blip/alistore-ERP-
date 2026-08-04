/**
 * The draw itself.
 *
 * There is deliberately no way to nominate a winner here. In a judged contest
 * ("лучший комментарий") the organiser's discretion is part of the announced
 * rules; in a raffle it is simply fraud, so this module exposes no override and
 * every input that affects the outcome is published.
 *
 * Outcome = f(seed, ticket list, public beacon). All three are disclosed, so
 * anyone can recompute it — see verify.mjs.
 */

import { createHash } from 'node:crypto';

import { createCommitment, verifyCommitment } from './commit.mjs';
import { createDrbg } from './rng.mjs';
import { entriesFingerprint } from './entries.mjs';

/**
 * @param {object} args
 * @param {Array<{username:string,tickets:number,commentIds?:string[]}>} args.entries
 * @param {string} args.seed      revealed after entries close
 * @param {string} args.beacon    public value nobody controlled at commit time
 *                                (a stated future Bitcoin block hash, a drand
 *                                round, tomorrow's lottery numbers) — this is
 *                                what stops the organiser grinding seeds
 * @param {number} args.winners   how many places to draw
 * @param {string} [args.commitment] if given, the seed must open it
 */
export function draw({ entries, seed, beacon, winners = 1, commitment }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('No eligible entrants to draw from.');
  }
  if (commitment && !verifyCommitment(seed, commitment)) {
    throw new Error('The seed does not open the published commitment — refusing to draw.');
  }

  const entriesHash = entriesFingerprint(entries);
  const material = `${String(seed).toLowerCase()}:${entriesHash}:${String(beacon)}`;

  const tickets = expandTickets(entries);
  const shuffled = shuffle(tickets, createDrbg(material));
  const places = Math.min(winners, entries.length);

  const picked = [];
  const seen = new Set();

  for (const username of shuffled) {
    const key = username.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    picked.push(username);
    if (picked.length === places) break;
  }

  return {
    winners: picked.map((username, index) => ({ rank: index + 1, username })),
    seed,
    beacon,
    commitment: commitment ?? createCommitment(seed),
    fingerprint: {
      entries: entriesHash,
      material: createHash('sha256').update(material).digest('hex'),
    },
    stats: { entrants: entries.length, tickets: tickets.length, places },
  };
}

/**
 * Sorted before expansion on purpose: the order the comments happened to arrive
 * in must not be able to change who wins.
 */
function expandTickets(entries) {
  const ordered = [...entries].sort((a, b) =>
    String(a.username).toLowerCase().localeCompare(String(b.username).toLowerCase()),
  );

  return ordered.flatMap((entry) =>
    Array.from({ length: Math.max(0, entry.tickets) }, () => entry.username),
  );
}

/** Fisher-Yates, driven entirely by the seeded DRBG. */
function shuffle(items, rng) {
  const out = [...items];

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.nextBelow(i + 1);
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }

  return out;
}
