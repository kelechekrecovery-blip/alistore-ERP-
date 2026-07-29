/**
 * Independent re-computation of a published draw.
 *
 * This is the half that matters to a participant: given the numbers from the
 * announcement post, does the winner actually fall out of them? Every check
 * that fails is reported, not just the first.
 */

import { verifyCommitment } from './commit.mjs';
import { draw } from './draw.mjs';
import { entriesFingerprint } from './entries.mjs';

export function verifyDraw({
  entries,
  seed,
  beacon,
  commitment,
  winners,
  claimedWinners = [],
  claimedEntriesHash,
}) {
  const failures = [];

  if (commitment && !verifyCommitment(seed, commitment)) {
    failures.push(
      'The revealed seed does not hash to the published commitment — the seed was changed.',
    );
    return { ok: false, failures, recomputed: [] };
  }

  if (claimedEntriesHash && entriesFingerprint(entries) !== String(claimedEntriesHash).toLowerCase()) {
    failures.push('The entrant list does not match the published list hash.');
  }

  const recomputed = draw({
    entries,
    seed,
    beacon,
    winners: winners ?? claimedWinners.length,
  }).winners.map((entry) => entry.username);

  if (claimedWinners.length !== recomputed.length) {
    failures.push(
      `Winner count mismatch: published ${claimedWinners.length}, recomputed ${recomputed.length}.`,
    );
  }

  claimedWinners.forEach((username, index) => {
    const expected = recomputed[index];
    if (String(username).toLowerCase() !== String(expected ?? '').toLowerCase()) {
      failures.push(
        `Winner #${index + 1} does not match: published @${username}, recomputed @${expected ?? '—'}.`,
      );
    }
  });

  return { ok: failures.length === 0, failures, recomputed };
}
