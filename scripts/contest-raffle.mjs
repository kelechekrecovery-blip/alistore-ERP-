#!/usr/bin/env node
/**
 * Verifiable random draw for the @alistore_kg giveaway.
 *
 * Three commands, run in this order:
 *
 *   commit  — BEFORE entries close. Generates a secret seed, saves it locally
 *             and prints the commitment hash. Publish that hash in the post.
 *
 *   draw    — AFTER entries close AND after the public beacon value exists.
 *             Reveals the seed and picks the winners.
 *
 *   verify  — what a participant runs. Recomputes the whole draw from the
 *             published numbers and reports any mismatch.
 *
 * The beacon is the part people skip and it is the part that matters. Without
 * it, an organiser who already has the entrant list can generate seeds until
 * one of them makes their friend win, and only then publish its commitment.
 * With a beacon nobody controlled at commit time — a stated future Bitcoin
 * block hash, a drand round, tomorrow's national lottery numbers — that attack
 * dies, because the outcome is not knowable when the seed is chosen.
 *
 * Usage:
 *   node scripts/contest-raffle.mjs commit --out .raffle-seed.json
 *   node scripts/contest-raffle.mjs draw --comments comments.json \
 *     --seed-file .raffle-seed.json --beacon <block-hash> --winners 5 \
 *     --started-at 2026-07-21T00:00:00+06:00 --exclude alistore_kg \
 *     --entries-out entries.json --out raffle-report.md
 *   node scripts/contest-raffle.mjs verify --entries entries.json \
 *     --seed <hex> --beacon <hash> --commitment <hex> --winners a,b,c
 */

import fs from 'node:fs';
import path from 'node:path';

import { createCommitment, generateSeed } from './contest-raffle/commit.mjs';
import { buildEntries, entriesFingerprint } from './contest-raffle/entries.mjs';
import { draw } from './contest-raffle/draw.mjs';
import { loadComments } from './contest-judge/ingest.mjs';
import { renderMarkdown } from './contest-raffle/report.mjs';
import { verifyDraw } from './contest-raffle/verify.mjs';

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

function list(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------ commit

function commitCommand(args) {
  const seed = generateSeed();
  const commitment = createCommitment(seed);
  const target = path.resolve(args.out ?? '.raffle-seed.json');

  if (fs.existsSync(target) && !args.force) {
    console.error(`${target} already exists. Refusing to overwrite a live seed (use --force).`);
    process.exit(2);
  }

  fs.writeFileSync(target, `${JSON.stringify({ seed, commitment }, null, 2)}\n`, { mode: 0o600 });

  console.log(
    [
      'Опубликуйте это в посте ДО закрытия приёма заявок:',
      '',
      `  Обязательство (SHA-256): ${commitment}`,
      '',
      'И назовите публичный маяк, например: "победителя определит хеш',
      'первого блока Bitcoin после 2026-07-28 20:00 по Бишкеку".',
      '',
      `Сид сохранён в ${target} — не публикуйте его до дедлайна.`,
    ].join('\n'),
  );
}

// -------------------------------------------------------------------- draw

function drawCommand(args) {
  const { seed, commitment } = JSON.parse(
    fs.readFileSync(path.resolve(args['seed-file'] ?? '.raffle-seed.json'), 'utf8'),
  );

  if (!args.beacon) {
    console.error('Missing --beacon. A draw without a public beacon is not verifiable.');
    process.exit(2);
  }

  const comments = loadComments(path.resolve(args.comments));
  const { entries, excluded } = buildEntries(comments, {
    contestStartedAt: args['started-at'],
    excludedUsernames: list(args.exclude),
    ticketsPerComment: Boolean(args['tickets-per-comment']),
    maxTicketsPerUser: args['max-tickets'] ? Number(args['max-tickets']) : undefined,
  });

  const result = draw({
    entries,
    seed,
    beacon: args.beacon,
    winners: args.winners ? Number(args.winners) : 5,
    commitment,
  });

  const entriesFile = args['entries-out'] ?? 'entries.json';
  fs.writeFileSync(path.resolve(entriesFile), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  const markdown = renderMarkdown(result, {
    postUrl: args['post-url'],
    drawnAt: new Date().toISOString(),
    prizes: list(args.prizes),
    entriesFile,
  });

  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), markdown, 'utf8');
    console.log(`Report written to ${args.out}`);
  } else {
    console.log(markdown);
  }

  console.error(
    `\nentrants=${result.stats.entrants} tickets=${result.stats.tickets} ` +
      `rejected=${excluded.length}\nentries-hash=${entriesFingerprint(entries)}\n` +
      `Publish ${entriesFile} alongside the post — the list hash is meaningless without it.`,
  );
}

// ------------------------------------------------------------------ verify

function verifyCommand(args) {
  const entries = JSON.parse(fs.readFileSync(path.resolve(args.entries), 'utf8'));
  const claimedWinners = list(args.winners);

  const check = verifyDraw({
    entries,
    seed: args.seed,
    beacon: args.beacon,
    commitment: args.commitment,
    claimedWinners,
    claimedEntriesHash: args['entries-hash'],
  });

  if (check.ok) {
    console.log('OK — розыгрыш воспроизводится в точности. Победители подтверждены:');
    check.recomputed.forEach((username, index) => console.log(`  ${index + 1}. @${username}`));
    return;
  }

  console.error('FAILED — результат не сходится:');
  for (const failure of check.failures) console.error(`  - ${failure}`);
  process.exit(1);
}

// -------------------------------------------------------------------- main

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

switch (command) {
  case 'commit':
    commitCommand(args);
    break;
  case 'draw':
    drawCommand(args);
    break;
  case 'verify':
    verifyCommand(args);
    break;
  default:
    console.error('Usage: contest-raffle.mjs <commit|draw|verify> [options]');
    console.error('See the header of this file for the full flow.');
    process.exit(2);
}
