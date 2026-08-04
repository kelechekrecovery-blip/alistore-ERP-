#!/usr/bin/env node
/**
 * Contest judging CLI for the @alistore_kg "лучший комментарий" giveaway.
 *
 * Two-step by design:
 *
 *   1. Ranking (no --winner): screens and scores every comment, prints the
 *      shortlist and the two fingerprints. Publish the fingerprints BEFORE
 *      announcing anything — that is what makes the result verifiable.
 *
 *   2. Decision (--winner + --justification + --decided-by): records the human
 *      pick. The winner must be on the shortlist; the reasoning is published.
 *
 * Usage:
 *   node scripts/contest-judge.mjs --comments comments.json \
 *     --post-url https://www.instagram.com/reel/DbEt11Dz8Xj/ \
 *     --started-at 2026-07-21T00:00:00+06:00 \
 *     --exclude alistore_kg --max-per-user 3 --shortlist 20 \
 *     --out contest-report.md
 */

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_CRITERIA } from './contest-judge/criteria.mjs';
import { allocatePrizes } from './contest-judge/prizes.mjs';
import { finalizeWinner, judge } from './contest-judge/judge.mjs';
import { loadComments } from './contest-judge/ingest.mjs';
import { renderMarkdown } from './contest-judge/report.mjs';

const DEFAULT_PRIZES = [
  { prize: 'iPhone 15 Pro', count: 1 },
  { prize: 'Чехол PITAKA', count: 3 },
  { prize: 'Скидка 10% на любой товар', count: 16 },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.comments) {
    console.error('Missing --comments <file.json>. See the header of this file for usage.');
    process.exit(2);
  }

  const comments = loadComments(path.resolve(args.comments));

  const result = judge({
    comments,
    criteria: DEFAULT_CRITERIA,
    options: {
      contestStartedAt: args['started-at'],
      excludedUsernames: String(args.exclude ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
      maxPerUser: args['max-per-user'] ? Number(args['max-per-user']) : undefined,
      shortlistSize: args.shortlist ? Number(args.shortlist) : undefined,
    },
  });

  const meta = {
    postUrl: args['post-url'],
    generatedAt: new Date().toISOString(),
  };

  if (args.winner) {
    meta.decision = finalizeWinner({
      result,
      username: args.winner,
      justification: args.justification,
      decidedBy: args['decided-by'],
    });
    meta.awards = allocatePrizes(result.shortlist, loadPrizes(args.prizes), {
      winnerUsername: args.winner,
    });
  }

  const markdown = renderMarkdown(result, meta);

  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), markdown, 'utf8');
    console.log(`Report written to ${args.out}`);
  } else {
    console.log(markdown);
  }

  console.error(
    `\ncriteria=${result.fingerprint.criteria}\ninput=${result.fingerprint.input}\n` +
      `total=${result.stats.total} eligible=${result.stats.eligible} ` +
      `disqualified=${result.stats.disqualified}`,
  );
}

function loadPrizes(prizesPath) {
  if (!prizesPath || prizesPath === true) return DEFAULT_PRIZES;
  return JSON.parse(fs.readFileSync(path.resolve(prizesPath), 'utf8'));
}

main();
