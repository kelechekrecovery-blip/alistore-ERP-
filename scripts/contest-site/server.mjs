#!/usr/bin/env node
/**
 * Giveaway randomiser site.
 *
 * Same engine as the CLI (scripts/contest-raffle) with the product layer on
 * top: paste a post link, draw, get a permanent public result page to share.
 *
 *   npm run contest:site        → http://localhost:4322
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEntries, entriesFingerprint } from '../contest-raffle/entries.mjs';
import { createCommitment, generateSeed } from '../contest-raffle/commit.mjs';
import { draw } from '../contest-raffle/draw.mjs';
import { verifyDraw } from '../contest-raffle/verify.mjs';

import { createStore } from './store.mjs';
import { parseCommentsInput } from './parse-comments.mjs';
import { parsePostUrl } from './post-url.mjs';
import { splitPlaces } from './places.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CONTEST_SITE_PORT ?? 4322);
const DATA_DIR = process.env.CONTEST_SITE_DATA ?? path.join(HERE, '../../.artifacts/giveaways');

const store = createStore(DATA_DIR);

/**
 * Public randomness beacon.
 *
 * drand (League of Entropy) publishes a fresh, publicly verifiable random value
 * every 30 seconds. Mixing it in means the outcome depends on something the
 * organiser did not choose and could not predict.
 */
async function fetchBeacon(manual) {
  if (manual) return { source: 'manual', value: String(manual) };

  try {
    const res = await fetch('https://api.drand.sh/public/latest', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`drand responded ${res.status}`);

    const { round, randomness } = await res.json();
    return { source: 'drand', round, value: randomness };
  } catch (error) {
    throw new Error(
      `Не удалось получить публичный маяк drand (${error.message}). ` +
        'Укажите маяк вручную — например хеш свежего блока Bitcoin.',
    );
  }
}

const routes = {
  'GET /api/recent': () => {
    const all = store.list(1000);

    return {
      draws: all.slice(0, 12).map(summarise),
      // Real counters only. Borrowing someone else's usage numbers would be a
      // fabricated claim about this service.
      totals: {
        draws: all.length,
        comments: all.reduce((sum, record) => sum + (record.commentsProcessed ?? 0), 0),
      },
    };
  },

  'POST /api/draw': async (body) => {
    const post = parsePostUrl(body.postUrl);
    const comments = parseCommentsInput(body.comments);
    const beacon = await fetchBeacon(body.beacon);

    const winnerCount = Math.max(1, Number(body.winners) || 1);
    const reserveCount = Math.max(0, Number(body.reserves) || 0);

    const { entries, excluded } = buildEntries(comments, {
      excludedUsernames: String(body.excluded ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
      ticketsPerComment: Boolean(body.ticketsPerComment),
      maxTicketsPerUser: Number(body.maxTickets) || undefined,
    });

    const seed = generateSeed();
    const commitment = createCommitment(seed);

    const result = draw({
      entries,
      seed,
      beacon: beacon.value,
      winners: winnerCount + reserveCount,
      commitment,
    });

    const { winners, reserves } = splitPlaces(result.winners, winnerCount);

    const saved = store.save({
      post,
      winners,
      reserves,
      seed,
      commitment,
      beacon,
      entries,
      entriesHash: entriesFingerprint(entries),
      prizes: Array.isArray(body.prizes) ? body.prizes : [],
      rejected: excluded.map((item) => ({ username: item.comment.username, reason: item.reason })),
      stats: result.stats,
      commentsProcessed: comments.length,
      options: {
        winners: winnerCount,
        reserves: reserveCount,
        ticketsPerComment: Boolean(body.ticketsPerComment),
      },
    });

    return { id: saved.id, url: `/r/${saved.id}` };
  },

  'POST /api/verify': (body) => {
    const record = store.load(body.id);
    if (!record) throw new Error('Розыгрыш не найден.');

    return verifyDraw({
      entries: record.entries,
      seed: record.seed,
      beacon: record.beacon.value,
      commitment: record.commitment,
      entriesHash: record.entriesHash,
      claimedWinners: [...record.winners, ...record.reserves].map((entry) => entry.username),
    });
  },
};

function summarise(record) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    post: record.post,
    winners: record.winners.map((winner) => winner.username),
    entrants: record.stats?.entrants ?? 0,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return sendFile(res, 'index.html');
  }
  if (req.method === 'GET' && /^\/r\/[0-9a-z]{8}$/.test(pathname)) {
    return sendFile(res, 'result.html');
  }

  // /api/result/<id> carries the id in the path, so it is matched separately.
  const resultMatch = pathname.match(/^\/api\/result\/([0-9a-z]{8})$/);
  if (req.method === 'GET' && resultMatch) {
    const record = store.load(resultMatch[1]);
    if (!record) return sendJson(res, 404, { error: 'Розыгрыш не найден.' });

    return sendJson(res, 200, {
      ...record,
      siblings: store.listByShortcode(record.post?.shortcode).map(summarise),
    });
  }

  const handler = routes[`${req.method} ${pathname}`];
  if (!handler) return sendJson(res, 404, { error: `Нет маршрута ${req.method} ${pathname}` });

  try {
    sendJson(res, 200, await handler(await readBody(req)));
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

function readBody(req) {
  if (req.method === 'GET') return Promise.resolve({});

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Тело запроса не является корректным JSON.'));
      }
    });
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, name) {
  fs.readFile(path.join(HERE, 'public', name), (error, data) => {
    if (error) return sendJson(res, 500, { error: error.message });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`Giveaway site on http://localhost:${PORT}  (data: ${store.directory})`);
});
