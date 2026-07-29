/**
 * Prize allocation across the shortlist.
 *
 * Tiers are consumed in order, so the main prize goes to whoever heads the
 * queue and the runners-up get the secondary gifts. Never awards more prizes
 * than there are shortlisted people.
 */

/**
 * @param {Array<{rank:number,id:string,username:string,total:number}>} shortlist
 * @param {Array<{prize:string,count:number}>} tiers
 * @param {{winnerUsername?:string}} options - `winnerUsername` moves one
 *        shortlisted entrant to the head of the queue, for when the human
 *        judge picked someone other than the top-scoring comment. The choice is
 *        still confined to the shortlist and is recorded in the report.
 */
export function allocatePrizes(shortlist, tiers, options = {}) {
  const queue = orderQueue(shortlist, options.winnerUsername);
  const awards = [];

  let index = 0;
  for (const tier of tiers) {
    for (let taken = 0; taken < tier.count && index < queue.length; taken += 1) {
      const entrant = queue[index];
      awards.push({
        prize: tier.prize,
        username: entrant.username,
        commentId: entrant.id,
        rank: entrant.rank,
        total: entrant.total,
      });
      index += 1;
    }
  }

  return awards;
}

function orderQueue(shortlist, winnerUsername) {
  const ordered = [...shortlist].sort((a, b) => a.rank - b.rank);
  if (!winnerUsername) return ordered;

  const wanted = String(winnerUsername).toLowerCase();
  const winnerIndex = ordered.findIndex((c) => String(c.username).toLowerCase() === wanted);

  if (winnerIndex === -1) {
    throw new Error(`"${winnerUsername}" is not on the shortlist and cannot take the main prize.`);
  }

  return [ordered[winnerIndex], ...ordered.filter((_, i) => i !== winnerIndex)];
}
