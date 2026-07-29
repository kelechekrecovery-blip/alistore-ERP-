/**
 * Winners and the reserve list.
 *
 * Reserves come from the same shuffle, in order — so if a winner turns out to
 * be ineligible or never replies, the replacement was already determined by the
 * original draw and is not a fresh, unverifiable decision.
 */

export function splitPlaces(drawn, winnerCount) {
  const count = Math.max(0, Number(winnerCount) || 0);

  return {
    winners: drawn.slice(0, count),
    reserves: drawn.slice(count).map((entry, index) => ({ ...entry, reserveRank: index + 1 })),
  };
}
