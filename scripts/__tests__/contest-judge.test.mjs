import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CRITERIA, criteriaFingerprint } from '../contest-judge/criteria.mjs';
import { emojiRatio, normalizeText, tokenize } from '../contest-judge/normalize.mjs';
import { DISQUALIFY, screenComments } from '../contest-judge/filters.mjs';
import { buildCorpus, scoreComment } from '../contest-judge/scoring.mjs';
import { finalizeWinner, judge } from '../contest-judge/judge.mjs';
import { allocatePrizes } from '../contest-judge/prizes.mjs';
import { renderMarkdown } from '../contest-judge/report.mjs';
import { fromGraphApi, fromPlainJson } from '../contest-judge/ingest.mjs';

const START = '2026-07-21T00:00:00+06:00';

function comment(overrides = {}) {
  return {
    id: overrides.id ?? 'c1',
    username: overrides.username ?? 'user_one',
    text: overrides.text ?? 'Абдан жакшы дукон, баары сапаттуу',
    createdAt: overrides.createdAt ?? '2026-07-21T10:00:00+06:00',
    likeCount: overrides.likeCount ?? 0,
  };
}

// ---------------------------------------------------------------- normalize

test('normalizeText collapses whitespace and lowercases', () => {
  assert.equal(normalizeText('  Салам   БААРЫНА \n\n жакшы '), 'салам баарына жакшы');
});

test('tokenize keeps Kyrgyz letters and drops punctuation and emoji', () => {
  assert.deepEqual(tokenize('Сүйүнөм! Өтө жакшы 🔥🔥'), ['сүйүнөм', 'өтө', 'жакшы']);
});

test('emojiRatio is 1 for an emoji-only comment and 0 for plain text', () => {
  assert.equal(emojiRatio('🔥🔥🔥'), 1);
  assert.equal(emojiRatio('жакшы дукон'), 0);
});

// ------------------------------------------------------------------ filters

test('screenComments disqualifies empty and emoji-only comments', () => {
  const { eligible, disqualified } = screenComments(
    [
      comment({ id: 'a', text: '   ' }),
      comment({ id: 'b', username: 'u_b', text: '🔥🔥🔥' }),
      comment({ id: 'c', username: 'u_c' }),
    ],
    { contestStartedAt: START },
  );

  assert.deepEqual(eligible.map((c) => c.id), ['c']);
  assert.deepEqual(
    disqualified.map((d) => [d.comment.id, d.reason]),
    [['a', DISQUALIFY.EMPTY], ['b', DISQUALIFY.EMOJI_ONLY]],
  );
});

test('screenComments keeps the first duplicate and disqualifies the rest', () => {
  const { eligible, disqualified } = screenComments(
    [
      comment({ id: 'a', username: 'u_a', text: 'Жакшы дукон рахмат' }),
      comment({ id: 'b', username: 'u_b', text: 'жакшы   ДУКОН рахмат' }),
    ],
    { contestStartedAt: START },
  );

  assert.deepEqual(eligible.map((c) => c.id), ['a']);
  assert.equal(disqualified[0].reason, DISQUALIFY.DUPLICATE);
});

test('screenComments disqualifies comments posted before the contest started', () => {
  const { disqualified } = screenComments(
    [comment({ id: 'old', createdAt: '2026-07-20T23:59:00+06:00' })],
    { contestStartedAt: START },
  );

  assert.equal(disqualified[0].reason, DISQUALIFY.BEFORE_START);
});

test('screenComments disqualifies excluded usernames case-insensitively', () => {
  const { disqualified } = screenComments(
    [comment({ id: 'staff', username: 'AliStore_KG' })],
    { contestStartedAt: START, excludedUsernames: ['alistore_kg'] },
  );

  assert.equal(disqualified[0].reason, DISQUALIFY.EXCLUDED);
});

test('screenComments caps how many comments one user can contribute', () => {
  const { eligible, disqualified } = screenComments(
    [
      comment({ id: '1', username: 'spammer', text: 'Биринчи комментарий менден' }),
      comment({ id: '2', username: 'spammer', text: 'Экинчи комментарий менден' }),
      comment({ id: '3', username: 'spammer', text: 'Үчүнчү комментарий менден' }),
    ],
    { contestStartedAt: START, maxPerUser: 2 },
  );

  assert.deepEqual(eligible.map((c) => c.id), ['1', '2']);
  assert.equal(disqualified[0].reason, DISQUALIFY.SPAM_BURST);
});

// ------------------------------------------------------------------ scoring

test('scoreComment rewards substance over a one-word comment', () => {
  const pool = [
    comment({ id: 'long', username: 'u1', text: 'Мен бул дукондон телефон алгам, тейлөө абдан жакшы болду' }),
    comment({ id: 'short', username: 'u2', text: 'катыш' }),
  ];
  const corpus = buildCorpus(pool);

  const long = scoreComment(pool[0], corpus, DEFAULT_CRITERIA);
  const short = scoreComment(pool[1], corpus, DEFAULT_CRITERIA);

  assert.ok(long.total > short.total, `${long.total} should beat ${short.total}`);
  assert.ok(long.breakdown.substance > short.breakdown.substance);
});

test('scoreComment rewards originality over herd-repeated wording', () => {
  const herd = Array.from({ length: 20 }, (_, i) =>
    comment({ id: `h${i}`, username: `u${i}`, text: 'катышам подписка бастым' }),
  );
  const pool = [
    ...herd,
    comment({ id: 'rare', username: 'rare_user', text: 'катышам подписка бастым, апама белек кылам' }),
  ];
  const corpus = buildCorpus(pool);

  const common = scoreComment(pool[0], corpus, DEFAULT_CRITERIA);
  const rare = scoreComment(pool.at(-1), corpus, DEFAULT_CRITERIA);

  assert.ok(rare.breakdown.originality > common.breakdown.originality);
});

test('scoreComment rewards brand relevance', () => {
  const pool = [
    comment({ id: 'brand', username: 'u1', text: 'Alistore дон iphone алгам абдан ыраазымын' }),
    comment({ id: 'plain', username: 'u2', text: 'Бүгүн аба ырайы жакшы экен досторум' }),
  ];
  const corpus = buildCorpus(pool);

  assert.ok(
    scoreComment(pool[0], corpus, DEFAULT_CRITERIA).breakdown.relevance >
      scoreComment(pool[1], corpus, DEFAULT_CRITERIA).breakdown.relevance,
  );
});

test('scoreComment is deterministic for the same input', () => {
  const pool = [comment({ id: 'x', text: 'Жакшы дукон, сунуштайм баарына' })];
  const corpus = buildCorpus(pool);

  assert.deepEqual(
    scoreComment(pool[0], corpus, DEFAULT_CRITERIA),
    scoreComment(pool[0], corpus, DEFAULT_CRITERIA),
  );
});

// ---------------------------------------------------------------- fingerprint

test('criteriaFingerprint is stable across key order and changes with weights', () => {
  const a = { version: 1, weights: { substance: 30, originality: 25 } };
  const b = { weights: { originality: 25, substance: 30 }, version: 1 };
  const c = { version: 1, weights: { substance: 31, originality: 25 } };

  assert.equal(criteriaFingerprint(a), criteriaFingerprint(b));
  assert.notEqual(criteriaFingerprint(a), criteriaFingerprint(c));
});

// -------------------------------------------------------------------- judge

test('judge ranks by score and returns a shortlist with an audit fingerprint', () => {
  const comments = [
    comment({ id: 'weak', username: 'u_weak', text: 'катыш' }),
    comment({ id: 'strong', username: 'u_strong', text: 'Alistore дон энеме телефон белек кылдым, абдан ыраазымын' }),
    comment({ id: 'mid', username: 'u_mid', text: 'Жакшы дукон рахмат силерге' }),
  ];

  const result = judge({ comments, options: { contestStartedAt: START, shortlistSize: 2 } });

  assert.equal(result.shortlist.length, 2);
  assert.equal(result.shortlist[0].username, 'u_strong');
  assert.deepEqual(result.shortlist.map((c) => c.rank), [1, 2]);
  assert.equal(result.fingerprint.criteria, criteriaFingerprint(DEFAULT_CRITERIA));
  assert.ok(result.fingerprint.input.length === 64);
  assert.equal(result.stats.total, 3);
});

test('judge breaks score ties deterministically by comment id', () => {
  const twins = [
    comment({ id: 'b_id', username: 'u_b', text: 'Жакшы дукон рахмат силерге баарына' }),
    comment({ id: 'a_id', username: 'u_a', text: 'Жакшы дукон рахмат силерге ыраазымын' }),
  ];

  const first = judge({ comments: twins, options: { contestStartedAt: START } });
  const second = judge({ comments: [...twins].reverse(), options: { contestStartedAt: START } });

  assert.deepEqual(
    first.shortlist.map((c) => c.id),
    second.shortlist.map((c) => c.id),
  );
});

test('judge input fingerprint changes when a comment changes', () => {
  const base = [comment({ id: 'a', text: 'Жакшы дукон рахмат силерге' })];
  const edited = [comment({ id: 'a', text: 'Жакшы дукон рахмат силерге абдан' })];

  assert.notEqual(
    judge({ comments: base, options: { contestStartedAt: START } }).fingerprint.input,
    judge({ comments: edited, options: { contestStartedAt: START } }).fingerprint.input,
  );
});

// ----------------------------------------------------------------- finalize

test('finalizeWinner accepts a shortlisted username with a justification', () => {
  const result = judge({
    comments: [
      comment({ id: 'a', username: 'u_a', text: 'Alistore дон телефон алгам абдан ыраазымын' }),
      comment({ id: 'b', username: 'u_b', text: 'Жакшы дукон рахмат силерге' }),
    ],
    options: { contestStartedAt: START, shortlistSize: 2 },
  });

  const decision = finalizeWinner({
    result,
    username: 'u_b',
    justification: 'Эң жакшы комментарий деп тандадык, себеби окуясы чын жана таасирдүү.',
    decidedBy: 'owner',
  });

  assert.equal(decision.username, 'u_b');
  assert.equal(decision.decidedBy, 'owner');
  assert.ok(decision.rank >= 1);
});

test('finalizeWinner refuses a username that is not on the shortlist', () => {
  const result = judge({
    comments: [comment({ id: 'a', username: 'u_a' })],
    options: { contestStartedAt: START, shortlistSize: 1 },
  });

  assert.throws(
    () => finalizeWinner({ result, username: 'outsider', justification: 'ошол эле', decidedBy: 'owner' }),
    /not on the shortlist/i,
  );
});

test('finalizeWinner refuses an empty or throwaway justification', () => {
  const result = judge({
    comments: [comment({ id: 'a', username: 'u_a' })],
    options: { contestStartedAt: START, shortlistSize: 1 },
  });

  assert.throws(
    () => finalizeWinner({ result, username: 'u_a', justification: '  ', decidedBy: 'owner' }),
    /justification/i,
  );
});

// ------------------------------------------------------------------- prizes

test('allocatePrizes gives the main prize to rank 1 and spreads the rest', () => {
  const shortlist = Array.from({ length: 5 }, (_, i) => ({
    rank: i + 1,
    id: `c${i}`,
    username: `u${i}`,
    total: 100 - i,
  }));

  const awards = allocatePrizes(shortlist, [
    { prize: 'iPhone 15 Pro', count: 1 },
    { prize: 'Чехол PITAKA', count: 2 },
    { prize: 'Скидка 10%', count: 5 },
  ]);

  assert.equal(awards[0].prize, 'iPhone 15 Pro');
  assert.equal(awards[0].username, 'u0');
  assert.deepEqual(awards.slice(1, 3).map((a) => a.prize), ['Чехол PITAKA', 'Чехол PITAKA']);
  assert.equal(awards.length, 5, 'never awards more prizes than shortlisted people');
});

test('allocatePrizes honours an explicit winner override from finalizeWinner', () => {
  const shortlist = [
    { rank: 1, id: 'c1', username: 'top', total: 100 },
    { rank: 2, id: 'c2', username: 'second', total: 90 },
  ];

  const awards = allocatePrizes(
    shortlist,
    [{ prize: 'iPhone 15 Pro', count: 1 }, { prize: 'Чехол', count: 1 }],
    { winnerUsername: 'second' },
  );

  assert.equal(awards.find((a) => a.prize === 'iPhone 15 Pro').username, 'second');
  assert.equal(awards.find((a) => a.prize === 'Чехол').username, 'top');
});

// ------------------------------------------------------------------- ingest

test('fromGraphApi maps Instagram comment payloads', () => {
  const parsed = fromGraphApi({
    data: [
      { id: '17900', username: 'aigerim', text: 'Жакшы', timestamp: '2026-07-21T12:00:00+0000', like_count: 4 },
    ],
  });

  assert.deepEqual(parsed, [
    { id: '17900', username: 'aigerim', text: 'Жакшы', createdAt: '2026-07-21T12:00:00+0000', likeCount: 4 },
  ]);
});

test('fromPlainJson accepts a hand-exported array and defaults missing fields', () => {
  const parsed = fromPlainJson([{ username: 'nurbek', text: 'Салам' }]);

  assert.equal(parsed[0].username, 'nurbek');
  assert.equal(parsed[0].likeCount, 0);
  assert.ok(parsed[0].id, 'synthesises a stable id when the export has none');
});

test('fromPlainJson rejects a payload that is not a list of comments', () => {
  assert.throws(() => fromPlainJson({ nope: true }), /array/i);
});

// ------------------------------------------------------------------- report

test('renderMarkdown publishes the fingerprints, criteria and shortlist', () => {
  const result = judge({
    comments: [
      comment({ id: 'a', username: 'u_a', text: 'Alistore дон телефон алгам абдан ыраазымын' }),
      comment({ id: 'b', username: 'u_b', text: '🔥🔥🔥' }),
    ],
    options: { contestStartedAt: START, shortlistSize: 1 },
  });

  const md = renderMarkdown(result, { postUrl: 'https://www.instagram.com/reel/DbEt11Dz8Xj/' });

  assert.match(md, /DbEt11Dz8Xj/);
  assert.match(md, /u_a/);
  assert.match(md, new RegExp(result.fingerprint.criteria.slice(0, 16)));
  assert.match(md, /emoji_only/, 'disqualifications are published, not hidden');
});
