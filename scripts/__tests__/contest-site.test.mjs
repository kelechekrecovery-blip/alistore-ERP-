import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createStore } from '../contest-site/store.mjs';
import { parseCommentsInput } from '../contest-site/parse-comments.mjs';
import { parsePostUrl } from '../contest-site/post-url.mjs';
import { splitPlaces } from '../contest-site/places.mjs';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contest-site-'));
  return { store: createStore(dir), dir };
}

// ---------------------------------------------------------------- post url

test('parsePostUrl accepts Instagram posts, reels and IGTV', () => {
  assert.deepEqual(parsePostUrl('https://www.instagram.com/reel/DbEt11Dz8Xj/'), {
    network: 'instagram',
    shortcode: 'DbEt11Dz8Xj',
    url: 'https://www.instagram.com/reel/DbEt11Dz8Xj/',
  });

  assert.equal(parsePostUrl('https://instagram.com/p/ABC123xyz_-/').shortcode, 'ABC123xyz_-');
  assert.equal(parsePostUrl('https://www.instagram.com/tv/QQQ111/').network, 'instagram');
});

test('parsePostUrl tolerates query strings and a missing trailing slash', () => {
  assert.equal(
    parsePostUrl('https://www.instagram.com/reel/DbEt11Dz8Xj?igsh=abc').shortcode,
    'DbEt11Dz8Xj',
  );
});

test('parsePostUrl rejects a non-post link and a foreign host', () => {
  assert.throws(() => parsePostUrl('https://www.instagram.com/alistore_kg/'), /ссылк/i);
  assert.throws(() => parsePostUrl('https://example.com/p/ABC/'), /instagram/i);
  assert.throws(() => parsePostUrl('не ссылка'), /ссылк/i);
});

// ------------------------------------------------------------------ places

test('splitPlaces separates winners from the reserve list', () => {
  const drawn = Array.from({ length: 7 }, (_, i) => ({ rank: i + 1, username: `u${i}` }));
  const { winners, reserves } = splitPlaces(drawn, 3);

  assert.deepEqual(winners.map((w) => w.username), ['u0', 'u1', 'u2']);
  assert.deepEqual(reserves.map((r) => r.username), ['u3', 'u4', 'u5', 'u6']);
  assert.deepEqual(reserves.map((r) => r.reserveRank), [1, 2, 3, 4]);
});

test('splitPlaces copes with fewer entrants than requested winners', () => {
  const { winners, reserves } = splitPlaces([{ rank: 1, username: 'only' }], 5);

  assert.equal(winners.length, 1);
  assert.deepEqual(reserves, []);
});

// ------------------------------------------------------------------- store

test('save returns a short url-safe id and load round-trips the record', () => {
  const { store } = tmpStore();
  const saved = store.save({ winners: [{ rank: 1, username: 'aigerim' }], seed: 'a'.repeat(64) });

  assert.match(saved.id, /^[0-9a-z]{8}$/);
  assert.equal(store.load(saved.id).winners[0].username, 'aigerim');
  assert.ok(saved.createdAt, 'records are timestamped');
});

test('load returns null for an unknown id', () => {
  const { store } = tmpStore();
  assert.equal(store.load('zzzzzzzz'), null);
});

test('load refuses ids containing path separators', () => {
  const { store } = tmpStore();
  assert.equal(store.load('../../etc/passwd'), null);
  assert.equal(store.load('a/b'), null);
});

test('save never reuses an id', () => {
  const { store } = tmpStore();
  const ids = new Set(Array.from({ length: 200 }, () => store.save({ winners: [] }).id));
  assert.equal(ids.size, 200);
});

test('a published record cannot be overwritten', () => {
  const { store } = tmpStore();
  const saved = store.save({ winners: [{ rank: 1, username: 'first' }] });

  assert.throws(
    () => store.save({ winners: [{ rank: 1, username: 'swapped' }] }, saved.id),
    /already published/i,
  );
  assert.equal(store.load(saved.id).winners[0].username, 'first');
});

test('list returns the most recent records first', () => {
  const { store } = tmpStore();
  const a = store.save({ winners: [], postUrl: 'first' });
  const b = store.save({ winners: [], postUrl: 'second' });

  const ids = store.list(10).map((record) => record.id);
  assert.deepEqual(ids.slice(0, 2), [b.id, a.id]);
});

test('listByShortcode exposes every draw run for the same post, oldest first', () => {
  const { store } = tmpStore();
  const first = store.save({ winners: [], post: { shortcode: 'ABC' } });
  const second = store.save({ winners: [], post: { shortcode: 'ABC' } });
  store.save({ winners: [], post: { shortcode: 'OTHER' } });

  assert.deepEqual(store.listByShortcode('ABC').map((r) => r.id), [first.id, second.id]);
  assert.deepEqual(store.listByShortcode('NONE'), []);
});

// ---------------------------------------------------------- comment input

test('parseCommentsInput reads a JSON export', () => {
  const parsed = parseCommentsInput('[{"username":"aigerim","text":"Катышам"}]');
  assert.equal(parsed[0].username, 'aigerim');
  assert.equal(parsed[0].text, 'Катышам');
});

test('parseCommentsInput reads plain username lines, with or without @', () => {
  const parsed = parseCommentsInput('@aigerim\nnurbek_77\n  eldar.kg  ');
  assert.deepEqual(parsed.map((c) => c.username), ['aigerim', 'nurbek_77', 'eldar.kg']);
  assert.equal(parsed[0].text, 'aigerim', 'handle stands in when there is no comment text');
});

test('parseCommentsInput reads "username — text" lines', () => {
  const parsed = parseCommentsInput('aigerim — Катышам ийгилик каалайм\nnurbek: Мен да катышам');
  assert.equal(parsed[0].text, 'Катышам ийгилик каалайм');
  assert.equal(parsed[1].text, 'Мен да катышам');
});

test('parseCommentsInput reports the offending line number', () => {
  assert.throws(() => parseCommentsInput('aigerim\n!!! мусор !!!'), /Строка 2/);
});

test('parseCommentsInput rejects empty input', () => {
  assert.throws(() => parseCommentsInput('   '), /пуст/i);
});
