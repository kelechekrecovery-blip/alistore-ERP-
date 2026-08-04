import assert from 'node:assert/strict';
import test from 'node:test';

import { createCommitment, generateSeed, verifyCommitment } from '../contest-raffle/commit.mjs';
import { createDrbg } from '../contest-raffle/rng.mjs';
import { buildEntries, entriesFingerprint } from '../contest-raffle/entries.mjs';
import { draw } from '../contest-raffle/draw.mjs';
import { verifyDraw } from '../contest-raffle/verify.mjs';
import { renderMarkdown } from '../contest-raffle/report.mjs';

const START = '2026-07-21T00:00:00+06:00';
const SEED = 'a'.repeat(64);
const BEACON = '0000000000000000000123abc';

function comment(overrides = {}) {
  return {
    id: overrides.id ?? 'c1',
    username: overrides.username ?? 'user_one',
    text: overrides.text ?? 'Катышам, ийгилик каалайм',
    createdAt: overrides.createdAt ?? '2026-07-21T10:00:00+06:00',
    likeCount: overrides.likeCount ?? 0,
  };
}

function pool(size, prefix = 'u') {
  return Array.from({ length: size }, (_, i) =>
    comment({ id: `c${i}`, username: `${prefix}${i}`, text: `Катышам ${i} номер менен` }),
  );
}

// ---------------------------------------------------------------- commitment

test('generateSeed returns 32 bytes of hex', () => {
  const seed = generateSeed();
  assert.match(seed, /^[0-9a-f]{64}$/);
  assert.notEqual(seed, generateSeed(), 'seeds must not repeat');
});

test('verifyCommitment accepts the matching seed and rejects any other', () => {
  const commitment = createCommitment(SEED);
  assert.equal(verifyCommitment(SEED, commitment), true);
  assert.equal(verifyCommitment('b'.repeat(64), commitment), false);
});

test('createCommitment rejects a malformed seed', () => {
  assert.throws(() => createCommitment('not-hex'), /seed/i);
});

// ----------------------------------------------------------------- rng

test('createDrbg is deterministic for the same material', () => {
  const a = createDrbg('material');
  const b = createDrbg('material');
  const drawsA = Array.from({ length: 10 }, () => a.nextBelow(1000));
  const drawsB = Array.from({ length: 10 }, () => b.nextBelow(1000));
  assert.deepEqual(drawsA, drawsB);
});

test('createDrbg diverges for different material', () => {
  const a = Array.from({ length: 10 }, ((r) => () => r.nextBelow(1e6))(createDrbg('one')));
  const b = Array.from({ length: 10 }, ((r) => () => r.nextBelow(1e6))(createDrbg('two')));
  assert.notDeepEqual(a, b);
});

test('nextBelow stays in range and covers the space roughly uniformly', () => {
  const rng = createDrbg('uniformity');
  const buckets = new Array(10).fill(0);

  for (let i = 0; i < 20000; i += 1) {
    const value = rng.nextBelow(10);
    assert.ok(value >= 0 && value < 10);
    buckets[value] += 1;
  }

  // 20000 draws over 10 buckets: 2000 expected. Rejection sampling should keep
  // every bucket well inside +/-15%, which a modulo-biased generator would not.
  for (const count of buckets) {
    assert.ok(count > 1700 && count < 2300, `bucket out of range: ${count}`);
  }
});

test('nextBelow rejects a non-positive bound', () => {
  assert.throws(() => createDrbg('x').nextBelow(0), /positive/i);
});

// --------------------------------------------------------------- entries

test('buildEntries gives one ticket per unique participant by default', () => {
  const { entries } = buildEntries(
    [
      comment({ id: '1', username: 'aigerim', text: 'Катышам мен биринчи' }),
      comment({ id: '2', username: 'aigerim', text: 'Дагы бир жолу катышам' }),
      comment({ id: '3', username: 'nurbek', text: 'Мен да катышам досторум' }),
    ],
    { contestStartedAt: START },
  );

  assert.deepEqual(entries.map((e) => e.username), ['aigerim', 'nurbek']);
  assert.deepEqual(entries.map((e) => e.tickets), [1, 1]);
});

test('buildEntries can weight tickets per comment up to a cap', () => {
  const { entries } = buildEntries(
    [
      comment({ id: '1', username: 'aigerim', text: 'Биринчи комментарийим ушул' }),
      comment({ id: '2', username: 'aigerim', text: 'Экинчи комментарийим ушул' }),
      comment({ id: '3', username: 'aigerim', text: 'Үчүнчү комментарийим ушул' }),
    ],
    { contestStartedAt: START, ticketsPerComment: true, maxTicketsPerUser: 2 },
  );

  assert.equal(entries[0].tickets, 2, 'the cap must bind');
});

test('buildEntries drops bots, duplicates and excluded accounts', () => {
  const { entries, excluded } = buildEntries(
    [
      comment({ id: '1', username: 'alistore_kg', text: 'Конкурс башталды' }),
      comment({ id: '2', username: 'bot', text: '🔥🔥🔥' }),
      comment({ id: '3', username: 'real_one', text: 'Катышам ийгилик каалайм' }),
      comment({ id: '4', username: 'copy', text: 'катышам   ИЙГИЛИК каалайм' }),
    ],
    { contestStartedAt: START, excludedUsernames: ['alistore_kg'] },
  );

  assert.deepEqual(entries.map((e) => e.username), ['real_one']);
  assert.equal(excluded.length, 3);
});

test('entriesFingerprint is order-independent and content-sensitive', () => {
  const a = [{ username: 'x', tickets: 1 }, { username: 'y', tickets: 2 }];
  const b = [{ username: 'y', tickets: 2 }, { username: 'x', tickets: 1 }];
  const c = [{ username: 'x', tickets: 2 }, { username: 'y', tickets: 2 }];

  assert.equal(entriesFingerprint(a), entriesFingerprint(b));
  assert.notEqual(entriesFingerprint(a), entriesFingerprint(c));
});

// ------------------------------------------------------------------- draw

test('draw is reproducible from seed, entries and beacon', () => {
  const { entries } = buildEntries(pool(50), { contestStartedAt: START });

  const first = draw({ entries, seed: SEED, beacon: BEACON, winners: 5 });
  const second = draw({ entries, seed: SEED, beacon: BEACON, winners: 5 });

  assert.deepEqual(first.winners, second.winners);
  assert.deepEqual(first.winners.map((w) => w.rank), [1, 2, 3, 4, 5]);
});

test('draw changes when the seed changes', () => {
  const { entries } = buildEntries(pool(200), { contestStartedAt: START });

  const a = draw({ entries, seed: SEED, beacon: BEACON, winners: 5 });
  const b = draw({ entries, seed: 'b'.repeat(64), beacon: BEACON, winners: 5 });

  assert.notDeepEqual(a.winners.map((w) => w.username), b.winners.map((w) => w.username));
});

test('draw changes when the beacon changes', () => {
  const { entries } = buildEntries(pool(200), { contestStartedAt: START });

  const a = draw({ entries, seed: SEED, beacon: BEACON, winners: 5 });
  const b = draw({ entries, seed: SEED, beacon: 'different-beacon', winners: 5 });

  assert.notDeepEqual(a.winners.map((w) => w.username), b.winners.map((w) => w.username));
});

test('draw never repeats a winner and never exceeds the entrant count', () => {
  const { entries } = buildEntries(pool(7), { contestStartedAt: START });
  const result = draw({ entries, seed: SEED, beacon: BEACON, winners: 20 });

  const names = result.winners.map((w) => w.username);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 7);
});

test('draw refuses an empty entrant pool', () => {
  assert.throws(() => draw({ entries: [], seed: SEED, beacon: BEACON, winners: 1 }), /no eligible/i);
});

test('draw refuses a seed that does not match a supplied commitment', () => {
  const { entries } = buildEntries(pool(10), { contestStartedAt: START });

  assert.throws(
    () =>
      draw({
        entries,
        seed: SEED,
        beacon: BEACON,
        winners: 1,
        commitment: createCommitment('b'.repeat(64)),
      }),
    /commitment/i,
  );
});

test('draw is fair: over many seeds every entrant wins roughly equally often', () => {
  const { entries } = buildEntries(pool(20), { contestStartedAt: START });
  const wins = new Map();

  for (let i = 0; i < 4000; i += 1) {
    const seed = i.toString(16).padStart(64, '0');
    const [winner] = draw({ entries, seed, beacon: BEACON, winners: 1 }).winners;
    wins.set(winner.username, (wins.get(winner.username) ?? 0) + 1);
  }

  assert.equal(wins.size, 20, 'every entrant must be reachable');
  // 4000 draws over 20 entrants: 200 expected each.
  for (const [username, count] of wins) {
    assert.ok(count > 140 && count < 260, `${username} won ${count} times`);
  }
});

test('draw honours ticket weights', () => {
  const entries = [
    { username: 'heavy', tickets: 9, commentIds: [] },
    { username: 'light', tickets: 1, commentIds: [] },
  ];
  let heavyWins = 0;

  for (let i = 0; i < 2000; i += 1) {
    const seed = i.toString(16).padStart(64, '0');
    if (draw({ entries, seed, beacon: BEACON, winners: 1 }).winners[0].username === 'heavy') {
      heavyWins += 1;
    }
  }

  assert.ok(heavyWins > 1650 && heavyWins < 1950, `heavy won ${heavyWins}/2000, expected ~1800`);
});

// ----------------------------------------------------------------- verify

test('verifyDraw confirms a published result end to end', () => {
  const { entries } = buildEntries(pool(30), { contestStartedAt: START });
  const commitment = createCommitment(SEED);
  const result = draw({ entries, seed: SEED, beacon: BEACON, winners: 3, commitment });

  const check = verifyDraw({
    entries,
    seed: SEED,
    beacon: BEACON,
    commitment,
    winners: 3,
    claimedWinners: result.winners.map((w) => w.username),
  });

  assert.equal(check.ok, true);
  assert.deepEqual(check.failures, []);
});

test('verifyDraw catches a swapped winner', () => {
  const { entries } = buildEntries(pool(30), { contestStartedAt: START });
  const commitment = createCommitment(SEED);
  const result = draw({ entries, seed: SEED, beacon: BEACON, winners: 3, commitment });

  const tampered = [...result.winners.map((w) => w.username)];
  tampered[0] = 'u29';

  const check = verifyDraw({
    entries,
    seed: SEED,
    beacon: BEACON,
    commitment,
    winners: 3,
    claimedWinners: tampered,
  });

  assert.equal(check.ok, false);
  assert.ok(check.failures.some((f) => /winner/i.test(f)));
});

test('verifyDraw catches a seed that does not open the commitment', () => {
  const { entries } = buildEntries(pool(30), { contestStartedAt: START });

  const check = verifyDraw({
    entries,
    seed: 'c'.repeat(64),
    beacon: BEACON,
    commitment: createCommitment(SEED),
    winners: 1,
    claimedWinners: ['u0'],
  });

  assert.equal(check.ok, false);
  assert.ok(check.failures.some((f) => /commitment/i.test(f)));
});

// ----------------------------------------------------------------- report

test('renderMarkdown publishes seed, commitment, beacon and winners', () => {
  const { entries } = buildEntries(pool(12), { contestStartedAt: START });
  const commitment = createCommitment(SEED);
  const result = draw({ entries, seed: SEED, beacon: BEACON, winners: 2, commitment });

  const md = renderMarkdown(result, { postUrl: 'https://www.instagram.com/reel/DbEt11Dz8Xj/' });

  assert.match(md, /DbEt11Dz8Xj/);
  assert.match(md, new RegExp(SEED));
  assert.match(md, new RegExp(commitment));
  assert.match(md, new RegExp(BEACON));
  assert.match(md, new RegExp(result.winners[0].username));
});
