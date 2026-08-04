#!/usr/bin/env node
/**
 * Local demo server for the two contest services.
 *
 * Zero dependencies on purpose — it wraps the same modules the CLIs use, so
 * what you see in the browser is the real pipeline, not a mock of it.
 *
 *   npm run contest:demo          → http://localhost:4321
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CRITERIA } from '../contest-judge/criteria.mjs';
import { allocatePrizes } from '../contest-judge/prizes.mjs';
import { finalizeWinner, judge } from '../contest-judge/judge.mjs';

import { buildEntries, entriesFingerprint } from '../contest-raffle/entries.mjs';
import { createCommitment, generateSeed } from '../contest-raffle/commit.mjs';
import { draw } from '../contest-raffle/draw.mjs';
import { verifyDraw } from '../contest-raffle/verify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CONTEST_DEMO_PORT ?? 4321);

const SAMPLE = JSON.parse(fs.readFileSync(path.join(HERE, 'sample-comments.json'), 'utf8'));

/** Options shared by both services, so the demo cannot drift between them. */
function screenOptions(body = {}) {
  return {
    contestStartedAt: body.startedAt || undefined,
    excludedUsernames: Array.isArray(body.excluded) ? body.excluded : [],
    maxPerUser: Number(body.maxPerUser) > 0 ? Number(body.maxPerUser) : undefined,
  };
}

const routes = {
  'GET /api/sample': () => ({ comments: SAMPLE, criteria: DEFAULT_CRITERIA }),

  'POST /api/judge': (body) => {
    const result = judge({
      comments: body.comments,
      options: { ...screenOptions(body), shortlistSize: Number(body.shortlistSize) || 10 },
    });

    const payload = {
      shortlist: result.shortlist,
      disqualified: result.disqualified.map((d) => ({ username: d.comment.username, text: d.comment.text, reason: d.reason })),
      fingerprint: result.fingerprint,
      stats: result.stats,
      weights: result.criteria.weights,
    };

    if (!body.winner) return payload;

    const decision = finalizeWinner({
      result,
      username: body.winner,
      justification: body.justification,
      decidedBy: body.decidedBy,
    });

    return {
      ...payload,
      decision,
      awards: allocatePrizes(result.shortlist, body.prizes ?? [], { winnerUsername: body.winner }),
    };
  },

  'POST /api/raffle/commit': () => {
    const seed = generateSeed();
    return { seed, commitment: createCommitment(seed) };
  },

  'POST /api/raffle/draw': (body) => {
    const { entries, excluded } = buildEntries(body.comments, {
      ...screenOptions(body),
      ticketsPerComment: Boolean(body.ticketsPerComment),
      maxTicketsPerUser: Number(body.maxTickets) || undefined,
    });

    const result = draw({
      entries,
      seed: body.seed,
      beacon: body.beacon,
      winners: Number(body.winners) || 5,
      commitment: body.commitment,
    });

    return {
      ...result,
      entries,
      entriesHash: entriesFingerprint(entries),
      rejected: excluded.map((d) => ({ username: d.comment.username, reason: d.reason })),
    };
  },

  'POST /api/raffle/verify': (body) =>
    verifyDraw({
      entries: body.entries,
      seed: body.seed,
      beacon: body.beacon,
      commitment: body.commitment,
      claimedWinners: body.claimedWinners ?? [],
      claimedEntriesHash: body.entriesHash,
    }),
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;

  if (key === 'GET /' || key === 'GET /index.html') {
    return sendFile(res, path.join(HERE, 'index.html'), 'text/html; charset=utf-8');
  }

  const handler = routes[key];
  if (!handler) return sendJson(res, 404, { error: `No route for ${key}` });

  readBody(req)
    .then((body) => sendJson(res, 200, handler(body)))
    .catch((error) => sendJson(res, 400, { error: error.message }));
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
        reject(new Error('Request body is not valid JSON.'));
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

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) return sendJson(res, 500, { error: error.message });
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`Contest demo listening on http://localhost:${PORT}`);
});
